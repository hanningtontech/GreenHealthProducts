/**
 * Backblaze B2 via S3-compatible API (AWS SDK).
 * Env: B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT, B2_REGION, B2_PUBLIC_BASE_URL
 */
import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

export type B2Config = {
  keyId: string;
  applicationKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
};

export function readB2Config(): B2Config | null {
  const keyId = ENV.b2KeyId || process.env.B2_KEY_ID || "";
  const applicationKey = ENV.b2ApplicationKey || process.env.B2_APPLICATION_KEY || "";
  const bucket = ENV.b2Bucket || process.env.B2_BUCKET || "";
  const endpoint = (ENV.b2Endpoint || process.env.B2_ENDPOINT || "").replace(/\/+$/, "");
  const region = ENV.b2Region || process.env.B2_REGION || "us-west-004";
  const publicBaseUrl = (ENV.b2PublicBaseUrl || process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!keyId || !applicationKey || !bucket || !endpoint) return null;
  return { keyId, applicationKey, bucket, endpoint, region, publicBaseUrl };
}

export function isB2Configured(): boolean {
  return Boolean(readB2Config());
}

function createClient(cfg: B2Config): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.keyId,
      secretAccessKey: cfg.applicationKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function publicUrlForKey(key: string, cfg = readB2Config()): string {
  const clean = key.replace(/^\/+/, "");
  if (!cfg) return clean;
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${clean}`;
  // Path-style fallback: https://s3.region.backblazeb2.com/bucket/key
  return `${cfg.endpoint}/${cfg.bucket}/${clean}`;
}

export async function b2PresignPut(key: string, contentType: string, expiresIn = 900): Promise<{
  uploadUrl: string;
  publicUrl: string;
  key: string;
}> {
  const cfg = readB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured. Set B2_* env vars.");
  const cleanKey = key.replace(/^\/+/, "");
  const client = createClient(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: cleanKey,
    ContentType: contentType || "application/octet-stream",
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, publicUrl: publicUrlForKey(cleanKey, cfg), key: cleanKey };
}

export async function b2PutObject(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const cfg = readB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured. Set B2_* env vars.");
  const cleanKey = key.replace(/^\/+/, "");
  const client = createClient(cfg);
  const body = typeof data === "string" ? Buffer.from(data) : data;
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: cleanKey,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key: cleanKey, url: publicUrlForKey(cleanKey, cfg) };
}

export async function b2PresignGet(key: string, expiresIn = 3600): Promise<string> {
  const cfg = readB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured.");
  const cleanKey = key.replace(/^\/+/, "");
  if (cfg.publicBaseUrl) return publicUrlForKey(cleanKey, cfg);
  const client = createClient(cfg);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: cleanKey }),
    { expiresIn },
  );
}
