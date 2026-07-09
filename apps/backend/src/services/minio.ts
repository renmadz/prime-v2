import { Client } from 'minio';
import type { Readable } from 'stream';

function buildClient(
  endpoint: string,
  accessKey: string,
  secretKey: string,
  region?: string,
): Client {
  // Parse endpoint: may be "host:port" or just "host"
  const [host, portStr] = endpoint.split(':');
  const port = portStr ? parseInt(portStr, 10) : 9000;
  return new Client({
    endPoint: host,
    port,
    useSSL: false,
    accessKey,
    secretKey,
    ...(region ? { region } : {}),
  });
}

let _client: Client | null = null;

// Internal client — used for server-to-MinIO calls (uploadFile) over the
// Docker-internal network (e.g. "prime-minio:9000").
export function getMinioClient(): Client {
  if (!_client) {
    const endpoint = process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (!endpoint || !accessKey || !secretKey) {
      throw new Error('MinIO configuration missing');
    }
    _client = buildClient(endpoint, accessKey, secretKey);
  }
  return _client;
}

let _publicClient: Client | null = null;

// Public-facing client — used only to sign presigned URLs that the browser
// will fetch directly. Must use a host:port the browser can actually reach
// (e.g. "localhost:9010" in local dev, where docker-compose.dev.yml maps
// the container's 9000 to host 9010). Falls back to MINIO_ENDPOINT when
// MINIO_PUBLIC_ENDPOINT isn't set (e.g. production behind a real DNS name
// shared by both internal and external traffic).
//
// A fixed region is required: without it, the minio SDK's presignedGetObject
// calls getBucketRegionAsync() first, which dials the *public* endpoint
// (e.g. localhost:9010) from inside the backend container — that address is
// only reachable from the host, so the lookup itself fails with ECONNREFUSED
// before a URL is ever signed. Passing region skips that lookup entirely.
function getPublicMinioClient(): Client {
  if (!_publicClient) {
    const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    const region = process.env.MINIO_REGION || 'us-east-1';
    if (!endpoint || !accessKey || !secretKey) {
      throw new Error('MinIO configuration missing');
    }
    _publicClient = buildClient(endpoint, accessKey, secretKey, region);
  }
  return _publicClient;
}

export async function uploadFile(
  key: string,
  stream: Buffer | Readable,
  size: number,
  contentType: string,
): Promise<void> {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET_NAME;
  if (!bucket) throw new Error('MinIO configuration missing');
  await client.putObject(bucket, key, stream, size, { 'Content-Type': contentType });
}

export async function getPresignedUrl(key: string, ttlSeconds: number): Promise<string> {
  const client = getPublicMinioClient();
  const bucket = process.env.MINIO_BUCKET_NAME;
  if (!bucket) throw new Error('MinIO configuration missing');
  return client.presignedGetObject(bucket, key, ttlSeconds);
}
