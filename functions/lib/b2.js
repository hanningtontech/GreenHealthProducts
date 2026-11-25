"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readB2Config = readB2Config;
exports.publicUrlForKey = publicUrlForKey;
exports.createPresignedPut = createPresignedPut;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
function readB2Config() {
    const keyId = process.env.B2_KEY_ID || "";
    const applicationKey = process.env.B2_APPLICATION_KEY || "";
    const bucket = process.env.B2_BUCKET || "";
    const endpoint = (process.env.B2_ENDPOINT || "").replace(/\/+$/, "");
    const region = process.env.B2_REGION || "us-west-004";
    const publicBaseUrl = (process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (!keyId || !applicationKey || !bucket || !endpoint)
        return null;
    return { keyId, applicationKey, bucket, endpoint, region, publicBaseUrl };
}
function createClient(cfg) {
    return new client_s3_1.S3Client({
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
function publicUrlForKey(key, cfg) {
    const clean = key.replace(/^\/+/, "");
    if (cfg.publicBaseUrl)
        return `${cfg.publicBaseUrl}/${clean}`;
    return `${cfg.endpoint}/${cfg.bucket}/${clean}`;
}
async function createPresignedPut(key, contentType, expiresIn = 900) {
    const cfg = readB2Config();
    if (!cfg) {
        throw new Error("B2 is not configured on Cloud Functions (set B2_* env / secrets).");
    }
    const cleanKey = key.replace(/^\/+/, "");
    const client = createClient(cfg);
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(client, new client_s3_1.PutObjectCommand({
        Bucket: cfg.bucket,
        Key: cleanKey,
        ContentType: contentType || "application/octet-stream",
    }), { expiresIn });
    return { uploadUrl, publicUrl: publicUrlForKey(cleanKey, cfg), key: cleanKey };
}
//# sourceMappingURL=b2.js.map