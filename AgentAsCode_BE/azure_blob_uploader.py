from azure.storage.blob import BlobServiceClient
import os
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import shutil
load_dotenv()

AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER_NAME = os.getenv("AZURE_CONTAINER_NAME")
# Replace these with your Azure Storage details


def upload_folder_to_blob(local_folder_path: str, blob_folder_path: str = ""):
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)

    for root, dirs, files in os.walk(local_folder_path):
        for file_name in files:
            file_path_on_local = os.path.join(root, file_name)
            # Calculate the path inside the blob
            relative_path = os.path.relpath(file_path_on_local, local_folder_path)
            blob_path = os.path.join(blob_folder_path, relative_path).replace("\\", "/")  # Azure uses "/" separator

            # Upload
            with open(file_path_on_local, "rb") as data:
                container_client.upload_blob(name=blob_path, data=data, overwrite=True)
            url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{AZURE_CONTAINER_NAME}/{blob_path}"
            print(f"Uploaded: {url}")
            
def get_blob(blob_name: str):
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
    temp_blobname = blob_name.split('/')[-1]
    # Download the blob data to a local file temporarily
    download_path = f"temp_{temp_blobname}"
    with open(download_path, "wb") as file:
        print("blob name",blob_name)
        data = container_client.download_blob(blob_name)
        data.readinto(file)
    response = FileResponse(download_path, media_type='application/octet-stream', filename=blob_name)
    # os.remove(download_path)
    return response

def upload_blob(file, blob_name: str):
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    blob_client = blob_service_client.get_blob_client(container=AZURE_CONTAINER_NAME, blob=blob_name)

    # Upload the file to Azure Blob Storage
    with open(file.filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    with open(file.filename, "rb") as data:
        blob_client.upload_blob(data, overwrite=True)

    return {"message": "File uploaded successfully!"}




def list_blob_files():
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)

    blob_list = []
    blobs = container_client.list_blobs()
    for blob in blobs:
        blob_list.append(blob.name)

    return blob_list

