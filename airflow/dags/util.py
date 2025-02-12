'''Collection of shared Airflow functionality.'''
from http import HTTPStatus
import os
import requests
# Ignore the Airflow module, it is installed in both our dev and prod environments
from airflow import DAG  # type: ignore
from airflow.models import Variable  # type: ignore
from airflow.operators.python_operator import PythonOperator  # type: ignore
from airflow.operators.python_operator import ShortCircuitOperator  # type: ignore


def get_required_attrs(workflow_id: str, gcs_bucket: str = None) -> dict:
    """Creates message with required arguments for both GCS and BQ operators

    workflow_id: ID of the datasource workflow. Should match ID defined in
                 DATA_SOURCES_DICT.
    gcs_bucket: GCS bucket to write to. Defaults to the GCS_LANDING_BUCKET env
                var."""
    if gcs_bucket is None:
        gcs_bucket = Variable.get('GCS_LANDING_BUCKET')
    return {
        'is_airflow_run': True,
        'id': workflow_id,
        'gcs_bucket': gcs_bucket,
    }


def generate_gcs_payload(workflow_id: str, filename: str = None,
                         url: str = None, gcs_bucket: str = None) -> dict:
    """Creates the payload object required for the GCS ingestion operator.

    workflow_id: ID of the datasource workflow. Should match ID defined in
                 DATA_SOURCES_DICT.
    filename: Name of gcs file to store the data in.
    url: URL where the data lives.
    gcs_bucket: GCS bucket to write to. Defaults to the GCS_LANDING_BUCKET env
                var."""
    message = get_required_attrs(workflow_id, gcs_bucket=gcs_bucket)
    if filename is not None:
        message['filename'] = filename
    if url is not None:
        message['url'] = url
    return {'message': message}


def generate_bq_payload(workflow_id: str, dataset: str, filename: str = None,
                        gcs_bucket: str = None, url: str = None) -> dict:
    """Creates the payload object required for the BQ ingestion operator.

    workflow_id: ID of the datasource workflow. Should match ID defined in
                 DATA_SOURCES_DICT.
    dataset: Name of the BQ dataset to write the data to.
    filename: Name of gcs file to get the data from. May also be a
              comma-separated list of files.
    gcs_bucket: GCS bucket to read from. Defaults to the GCS_LANDING_BUCKET env
                var.
    url: The URL used for ingestion. This should be deprecated in favor of
         writing any metadata to GCS during the GCS step. It's temporarily
         necessary since ACS directly requests metadata during BQ upload."""
    message = get_required_attrs(workflow_id, gcs_bucket=gcs_bucket)
    message['dataset'] = dataset
    if filename is not None:
        message['filename'] = filename
    if url is not None:
        message['url'] = url
    return {'message': message}


def create_gcs_ingest_operator(task_id: str, payload: dict, dag: DAG) -> PythonOperator:
    return create_request_operator(task_id, Variable.get('INGEST_TO_GCS_SERVICE_ENDPOINT'), payload, dag)


def create_bq_ingest_operator(task_id: str, payload: dict, dag: DAG) -> PythonOperator:
    return create_request_operator(task_id, Variable.get('GCS_TO_BQ_SERVICE_ENDPOINT'), payload, dag)


def create_exporter_operator(task_id: str, payload: dict, dag: DAG) -> PythonOperator:
    return create_request_operator(task_id, Variable.get('EXPORTER_SERVICE_ENDPOINT'), payload, dag)


def create_aggregator_operator(task_id: str, payload: dict, dag: DAG) -> PythonOperator:
    return create_request_operator(task_id, Variable.get('AGGREGATOR_SERVICE_ENDPOINT'), payload, dag)


def service_request(url: str, data: dict, **kwargs):
    receiving_service_headers = {}
    if (os.getenv('ENV') != 'dev'):
        # Set up metadata server request
        # See https://cloud.google.com/compute/docs/instances/verifying-instance-identity#request_signature
        token_url = 'http://metadata/computeMetadata/v1/instance/service-accounts/default/identity?audience='

        token_request_url = token_url + url
        token_request_headers = {'Metadata-Flavor': 'Google'}

        # Fetch the token for the default compute service account
        token_response = requests.get(
            token_request_url, headers=token_request_headers)
        jwt = token_response.content.decode("utf-8")

        # Provide the token in the request to the receiving service
        receiving_service_headers = {'Authorization': f'bearer {jwt}'}

    try:
        resp = requests.post(url, json=data, headers=receiving_service_headers)
        resp.raise_for_status()
        # Allow the most recent response code to be accessed by a downstream task for possible short circuiting.
        kwargs['ti'].xcom_push(key='response_status', value=resp.status_code)
    except requests.exceptions.HTTPError as err:
        raise Exception('Failed response code: {}'.format(err))


def create_request_operator(task_id: str, url: str, payload: dict, dag: DAG, xcom_push: bool = True,
                            provide_context: bool = True) -> PythonOperator:
    return PythonOperator(
        task_id=task_id,
        provide_context=provide_context,
        python_callable=service_request,
        op_kwargs={'url': url, 'data': payload},
        xcom_push=xcom_push,
        dag=dag,
    )


def did_gcs_file_download(gcs_download_task_id: str, **kwargs):
    """
    Check the response code of the gcs download step.

    Parameters:
        gcs_download_task_id: the task id of the
        kwargs: remaining named function arguments

    Returns: A boolean indication that a file was downloaded
    """
    response_code = kwargs['ti'].xcom_pull(
        key=None, task_ids=gcs_download_task_id)
    return response_code == HTTPStatus.CREATED


def create_gcs_short_circuit_operator(task_id: str, gcs_download_task_id: str, dag: DAG, provide_context: bool = True):
    return ShortCircuitOperator(
        task_id=task_id,
        provide_context=provide_context,
        python_callable=did_gcs_file_download,
        op_kwargs={'gcs_download_task_id': gcs_download_task_id},
        dag=dag,
    )
