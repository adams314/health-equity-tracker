import { MetadataMap, Dataset } from "./DatasetTypes";
import { getUniqueProviders } from "./variableProviders";
import VariableProvider from "./variables/VariableProvider";
import { joinOnCols } from "./datasetutils";
import { DataFrame, IDataFrame } from "data-forge";
import { MetricQuery, MetricQueryResponse } from "./MetricQuery";
import { getDataFetcher, getDataManager, getLogger } from "../utils/globals";
import { useEffect } from "react";

async function onMetadataLoaded(callback: (metadata: MetadataMap) => void) {
  try {
    const metadata = await getDataManager().loadMetadata();
    callback(metadata);
    // Swallow errors - they are logged in the DataManager
  } catch (e) {}
}

/**
 * @param callback Callback that is executed exactly once, once metadata is
 *     loaded.
 */
export function useOnMetadataLoaded(callback: (metadata: MetadataMap) => void) {
  useEffect(() => {
    onMetadataLoaded(callback);
    // eslint-disable-next-line
  }, []);
}

export abstract class ResourceCache<K, R> {
  private resources: Record<string, R>;
  private loadingResources: Record<string, Promise<R>>;
  private failedResources: Set<string>;

  /**
   * Keep a reference to the overall data manager for intermediate caching and
   * loading.
   */
  protected readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.resources = {};
    this.loadingResources = {};
    this.failedResources = new Set();
    this.dataManager = dataManager;
  }

  resetCache() {
    // There's no way to cancel in-flight promises, so we don't clear the
    // loading resources.
    this.resources = {};
    this.failedResources = new Set();
  }

  addResourceToCache(key: K, resource: R) {
    const resourceId = this.getResourceId(key);
    this.resources[resourceId] = resource;
  }

  async loadResource(key: K): Promise<R> {
    const resourceId = this.getResourceId(key);

    // Errors are considered permanent, so we don't retry on errors. Reloading
    // is required to retry. In the future we could consider a more robust retry
    // mechanism that only allows retrying after a certain amount of time or
    // when the user changes Mad-libs. However, it's simpler and safer to just
    // not retry because frequent retries can risk spamming the server or
    // freezing the page from too many expensive computations.
    if (this.failedResources.has(resourceId)) {
      throw new Error("Resource already failed, not retrying");
    }

    try {
      // TODO handle errors at the DataFetcher level
      // TODO handle re-load periodically so long-lived tabs don't get stale.
      // Also need to reset the variable cache when datasets are reloaded.

      const resource = this.resources[resourceId];
      if (resource) {
        return resource;
      }
      const loadingResource = this.loadingResources[resourceId];
      if (loadingResource) {
        return await loadingResource;
      }

      getLogger().debugLog("Loading " + resourceId);
      const loadPromise = this.loadResourceInternal(key);
      this.loadingResources[resourceId] = loadPromise;
      const result = await loadPromise;

      this.resources[resourceId] = result;
      delete this.loadingResources[resourceId];
      getLogger().debugLog("Loaded " + resourceId);

      return result;
    } catch (e) {
      delete this.loadingResources[resourceId];
      this.failedResources.add(resourceId);
      await getLogger().logError(e, "WARNING", {
        error_type: "resource_load_failure",
        resource_id: resourceId,
      });
      throw e;
    }
  }

  getResource(key: K): R | undefined {
    return this.resources[this.getResourceId(key)];
  }

  protected abstract loadResourceInternal(key: K): Promise<R>;

  abstract getResourceId(key: K): string;
}

export class MetadataCache extends ResourceCache<string, MetadataMap> {
  static METADATA_KEY = "all_metadata";

  protected async loadResourceInternal(
    metadataId: string
  ): Promise<MetadataMap> {
    if (metadataId !== MetadataCache.METADATA_KEY) {
      throw new Error("Invalid metadata id");
    }
    return await getDataFetcher().getMetadata();
  }

  getResourceId(metadataId: string): string {
    return metadataId;
  }
}

class DatasetCache extends ResourceCache<string, Dataset> {
  protected async loadResourceInternal(datasetId: string): Promise<Dataset> {
    const promise = getDataFetcher().loadDataset(datasetId);
    const metadataPromise = this.dataManager.loadMetadata();
    const [data, metadata] = await Promise.all([promise, metadataPromise]);
    // TODO throw specific error message if metadata is missing for this dataset
    // id.
    // TODO validate metadata against data, and also process variables out
    // of it?
    return new Dataset(data, metadata[datasetId]);
  }

  getResourceId(datasetId: string): string {
    return datasetId;
  }
}

class MetricQueryCache extends ResourceCache<MetricQuery, MetricQueryResponse> {
  protected async loadResourceInternal(
    query: MetricQuery
  ): Promise<MetricQueryResponse> {
    const providers = getUniqueProviders(query.metricIds);
    // TODO move dataset loading into providers so that only the ones that are
    // strictly needed will be loaded.
    const datasetIds = VariableProvider.getUniqueDatasetIds(providers);

    const promises = datasetIds.map((id) => this.dataManager.loadDataset(id));
    const datasets = await Promise.all(promises);

    const entries = datasets.map((d) => {
      if (!d) {
        throw new Error("Failed to load dependent dataset");
      }
      return [d.metadata.id, d];
    });
    const datasetMap = Object.fromEntries(entries);
    // Yield thread so the UI can respond. This prevents long calculations
    // from causing UI elements to look laggy.
    await new Promise((res) => {
      setTimeout(res, 0);
    });
    // TODO potentially improve caching by caching the individual results
    // before joining so those can be reused, or caching the results under
    // all of the variables provided under different keys. For example, if
    // you request covid cases we could also cache it under covid deaths
    // since they're provided together. Also, it would be nice to cache ACS
    // when it's used from within another provider.
    const queryResponses: MetricQueryResponse[] = providers.map((provider) =>
      provider.getData(datasetMap, query.breakdowns)
    );

    const potentialErrorResponse = queryResponses.find((metricQueryResponse) =>
      metricQueryResponse.dataIsMissing()
    );
    if (potentialErrorResponse !== undefined) {
      return potentialErrorResponse;
    }

    const dataframes: IDataFrame[] = queryResponses.map(
      (response) => new DataFrame(response.data)
    );

    const joined = dataframes.reduce((prev, next) => {
      return joinOnCols(
        prev,
        next,
        query.breakdowns.getJoinColumns(),
        query.joinType
      );
    });

    const consumedDatasetIds = queryResponses.reduce(
      (accumulator: string[], response: MetricQueryResponse) =>
        accumulator.concat(response.consumedDatasetIds),
      []
    );
    const uniqueConsumedDatasetIds = Array.from(new Set(consumedDatasetIds));
    return new MetricQueryResponse(joined.toArray(), uniqueConsumedDatasetIds);
  }

  getResourceId(query: MetricQuery): string {
    return query.getUniqueKey();
  }
}

/**
 * Loads and caches metadata, datasets, and metric queries. This class is not
 * part of the React lifecycle, so it can manage its cache independently of UI
 * components updating. To use these in a React component, see
 * `useResources.tsx` and `WithLoadingOrErrorUI.tsx`
 */
export default class DataManager {
  private readonly datasetCache: DatasetCache;
  private readonly metricQueryCache: MetricQueryCache;
  private readonly metadataCache: MetadataCache;

  constructor() {
    this.datasetCache = new DatasetCache(this);
    this.metricQueryCache = new MetricQueryCache(this);
    this.metadataCache = new MetadataCache(this);
  }

  async loadDataset(datasetId: string): Promise<Dataset> {
    return await this.datasetCache.loadResource(datasetId);
  }

  async loadMetrics(query: MetricQuery): Promise<MetricQueryResponse> {
    return await this.metricQueryCache.loadResource(query);
  }

  async loadMetadata(): Promise<MetadataMap> {
    return await this.metadataCache.loadResource(MetadataCache.METADATA_KEY);
  }

  addQueryToCache(query: MetricQuery, response: MetricQueryResponse) {
    this.metricQueryCache.addResourceToCache(query, response);
  }

  resetCache() {
    this.datasetCache.resetCache();
    this.metricQueryCache.resetCache();
    this.metadataCache.resetCache();
  }
}
