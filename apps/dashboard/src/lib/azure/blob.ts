import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

function getClient() {
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!account || !key) throw new Error("Azure Blob Storage not configured");
  const credential = new StorageSharedKeyCredential(account, key);
  return new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
}

export async function uploadToBlob(
  container: string,
  blobName: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const client = getClient();
  const containerClient = client.getContainerClient(container);
  await containerClient.createIfNotExists({ access: "blob" });
  const blobClient = containerClient.getBlockBlobClient(blobName);
  await blobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  return blobClient.url;
}

export async function deleteBlob(container: string, blobName: string): Promise<void> {
  const client = getClient();
  await client.getContainerClient(container).deleteBlob(blobName);
}
