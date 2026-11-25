import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type B2Config = {
  keyId: string;
  applicationKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
};

export function readB2Config(): B2Config | null {
  const keyId = process.env.B2_KEY_ID || "";
  const applicationKey = process.env.B2_APPLICATION_KEY || "";
  const bucket = process.env.B2_BUCKET || "";
  const endpoint = (process.env.B2_ENDPOINT || "").replace(/\/+$/, "");
  const region = process.env.B2_REGION || "us-west-004";
  const publicBaseUrl = (process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!keyId || !applicationKey || !bucket || !endpoint) return null;
  return { keyId, applicationKey, bucket, endpoint, region, publicBaseUrl };
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
    // Browser PUTs fail CORS preflight if AWS SDK injects CRC32 checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function publicUrlForKey(key: string, cfg: B2Config): string {
  const clean = key.replace(/^\/+/, "");
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${clean}`;
  return `${cfg.endpoint}/${cfg.bucket}/${clean}`;
}

export async function createPresignedPut(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const cfg = readB2Config();
  if (!cfg) {
    throw new Error("B2 is not configured on Cloud Functions (set B2_* env / secrets).");
  }
  const cleanKey = key.replace(/^\/+/, "");
  const client = createClient(cfg);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: cleanKey,
      ContentType: contentType || "application/octet-stream",
    }),
    { expiresIn },
  );
  return { uploadUrl, publicUrl: publicUrlForKey(cleanKey, cfg), key: cleanKey };
}
