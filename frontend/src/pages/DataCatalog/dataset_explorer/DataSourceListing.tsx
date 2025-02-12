import React, { useState } from "react";
import {
  DataSourceMetadata,
  MapOfDatasetMetadata,
  DatasetMetadata,
} from "../../../data/utils/DatasetTypes";
import { getLogger } from "../../../utils/globals";
import styles from "./DataSourceListing.module.scss";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import Link from "@material-ui/core/Link";
import Typography from "@material-ui/core/Typography";
import AnimateHeight from "react-animate-height";
import downloadDataset from "./downloadDataset";
import DialogTitle from "@material-ui/core/DialogTitle";
import Dialog from "@material-ui/core/Dialog";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import CircularProgress from "@material-ui/core/CircularProgress";
import Alert from "@material-ui/lab/Alert";
import ListItemText from "@material-ui/core/ListItemText";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import GetAppIcon from "@material-ui/icons/GetApp";
import { IconButton } from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";

type LoadStatus = "loading" | "unloaded" | "error" | "loaded";

function DownloadDatasetListItem(props: {
  datasetId: string;
  datasetMetadata: DatasetMetadata;
}) {
  const [downloadStatus, setDownloadStatus] = useState<LoadStatus>("unloaded");

  const download = async () => {
    setDownloadStatus("loading");
    const state = await downloadDataset(props.datasetId);
    setDownloadStatus(state ? "loaded" : "error");
  };

  const getIcon = () => {
    switch (downloadStatus) {
      case "unloaded":
        return <GetAppIcon />;
      case "loading":
        return <CircularProgress className={styles.DownloadIcon} />;
      case "loaded":
        return <CheckCircleIcon />;
      case "error":
        return "";
    }
  };

  if (props.datasetMetadata === undefined) {
    getLogger().logError(
      new Error(
        "Dataset metdata was missing for dataset with ID: " + props.datasetId
      ),
      "ERROR"
    );
    return <></>;
  }

  return (
    <ListItem
      className={styles.DownloadListItem}
      button
      onClick={() => download()}
      key={props.datasetId}
    >
      {downloadStatus !== "error" ? (
        <>
          <ListItemIcon>{getIcon()}</ListItemIcon>
          <ListItemText
            className={styles.DownloadListItemText}
            primary={props.datasetMetadata.name}
            secondary={"Last updated: " + props.datasetMetadata.update_time}
          />
        </>
      ) : (
        <Alert severity="error">
          Error downloading {props.datasetMetadata.name}.
        </Alert>
      )}
    </ListItem>
  );
}
export interface DataSourceListingProps {
  source_metadata: DataSourceMetadata;
  dataset_metadata: MapOfDatasetMetadata;
}

export function DataSourceListing(props: DataSourceListingProps) {
  const [expanded, setExpanded] = useState(false);
  const [dialogIsOpen, setDialogIsOpen] = useState(false);

  return (
    <Card
      elevation={3}
      className={styles.DataSourceListing}
      data-testid={props.source_metadata.id}
    >
      <Typography variant="h5" className={styles.DatasetTitle} align="left">
        {props.source_metadata.data_source_name}
      </Typography>
      <Typography className={styles.DataSubtitle} align="left">
        <Link
          href={props.source_metadata.data_source_link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {props.source_metadata.data_source_name}
        </Link>
      </Typography>
      <table className={styles.MetadataTable}>
        <tbody>
          <tr>
            <td>
              <b>Geographic Level</b>
            </td>
            <td>{props.source_metadata.geographic_level}</td>
          </tr>
          <tr>
            <td>
              <b>Demographic Granularity</b>
            </td>
            <td>{props.source_metadata.demographic_granularity}</td>
          </tr>
          <tr>
            <td>
              <b>Update Frequency</b>
            </td>
            <td>{props.source_metadata.update_frequency}</td>
          </tr>
          {/* TODO - do we want to add all the dataset latest update times? */}
        </tbody>
      </table>
      <AnimateHeight duration={500} height={expanded ? "auto" : 20}>
        <div className={styles.Description}>
          {props.source_metadata.description}
        </div>
      </AnimateHeight>
      <div className={styles.Footer}>
        <div className={styles.CardFooterRight}>
          <Button color="primary" onClick={() => setDialogIsOpen(true)}>
            Download
          </Button>
        </div>
        <div className={styles.CardFooterLeft}>
          <Button
            aria-label="expand description"
            onClick={() => setExpanded(!expanded)}
            data-testid={"expand-" + props.source_metadata.id}
            color="primary"
          >
            {expanded ? "Less" : "More"}
          </Button>
        </div>
        <Dialog onClose={() => setDialogIsOpen(false)} open={dialogIsOpen}>
          <DialogTitle>
            Available Breakdowns for this Data Source
            <IconButton
              aria-label="close"
              onClick={() => setDialogIsOpen(false)}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <List>
            {props.source_metadata.dataset_ids.map((datasetId) => (
              <DownloadDatasetListItem
                key={datasetId}
                datasetId={datasetId}
                datasetMetadata={props.dataset_metadata[datasetId]}
              />
            ))}
          </List>
        </Dialog>
      </div>
    </Card>
  );
}

export default DataSourceListing;
