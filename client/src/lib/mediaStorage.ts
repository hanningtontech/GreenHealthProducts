/**
 * Client ↔ Backblaze B2 via Cloud Function `createMediaUploadUrl`.
 *
 * Bucket layout:
 *   media/profiles/{uid}/avatar.jpg
 *   media/products/{productId}/thumbnail.{ext}
 *   media/products/{productId}/gallery/{slot}.{ext}
 *   media/screenings/{screeningId}/source/{stamp}_{filename}
 *   media/screenings/{screeningId}/reports/patient-report.pdf
 *
 * Firestore stores the returned `publicUrl` (HTTPS). The UI loads that URL directly.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

export type MediaPurpose = "profile" | "product" | "screening" | "report";

export type PresignResponse = {
  ok: boolean;
  uploadUrl: string;
  publicUrl: string;
  key: string;
  contentType: string;
  purpose?: MediaPurpose;
  version?: number;
};

const FUNCTIONS_REGION = "us-central1";

export function isHttpUrl(value?: string | null): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

/** True when the value can be used as an <img src> / link (HTTPS B2 or temporary data URL). */
export function isDisplayableMediaUrl(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  return isHttpUrl(v) || v.startsWith("data:image/") || v.startsWith("blob:");
}

/** Prefer HTTPS B2 links; strip empty / local markers. Allow blob: for local crop previews. */
export function resolveMediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (isHttpUrl(v) || v.startsWith("data:image/") || v.startsWith("blob:")) return v;
  return undefined;
}

function functionsClient() {
  return getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
}

export async function requestMediaUploadUrl(input: {
  purpose: MediaPurpose;
  fileName: string;
  contentType: string;
  productId?: string;
  screeningId?: string;
  /** product only: thumbnail | gallery | primary */
  productRole?: string;
  /** product gallery slot id */
  slot?: string;
}): Promise<PresignResponse> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }
  const fn = httpsCallable(functionsClient(), "createMediaUploadUrl");
  try {
    const result = await fn({
      purpose: input.purpose,
      fileName: input.fileName,
      contentType: input.contentType,
      productId: input.productId,
      screeningId: input.screeningId,
      productRole: input.productRole,
      slot: input.slot,
    });
    return result.data as PresignResponse;
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "Could not request upload URL";
    throw new Error(message);
  }
}

function putWithProgress(
  uploadUrl: string,
  file: File | Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      onProgress(Math.min(99, Math.max(0, pct)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})${xhr.responseText ? `: ${xhr.responseText.slice(0, 120)}` : ""}`));
    };
    xhr.onerror = () => reject(new Error("Upload network error. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

/** Upload a File/Blob to media storage and return the public HTTPS URL + object key. */
export async function uploadMediaFile(
  file: File | Blob,
  options: {
    purpose: MediaPurpose;
    fileName?: string;
    productId?: string;
    screeningId?: string;
    productRole?: string;
    slot?: string;
    onProgress?: (percent: number) => void;
  },
): Promise<{ publicUrl: string; key: string }> {
  const fileName =
    options.fileName
    || (file instanceof File && file.name)
    || defaultFileName(options.purpose);
  const contentType =
    file.type
    || guessContentType(fileName, options.purpose);

  options.onProgress?.(8);
  const presign = await requestMediaUploadUrl({
    purpose: options.purpose,
    fileName,
    contentType,
    productId: options.productId,
    screeningId: options.screeningId,
    productRole: options.productRole,
    slot: options.slot,
  });

  if (!presign.uploadUrl || !presign.publicUrl) {
    throw new Error("Upload URL response was incomplete.");
  }

  options.onProgress?.(18);
  await putWithProgress(presign.uploadUrl, file, contentType, (pct) => {
    // Map PUT progress into the remaining 18→100 range.
    options.onProgress?.(18 + Math.round(pct * 0.82));
  });

  return { publicUrl: presign.publicUrl, key: presign.key };
}

function defaultFileName(purpose: MediaPurpose): string {
  switch (purpose) {
    case "profile":
      return "avatar.jpg";
    case "product":
      return "primary.jpg";
    case "report":
      return "patient-report.pdf";
    default:
      return "upload.bin";
  }
}

function guessContentType(fileName: string, purpose: MediaPurpose): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (purpose === "profile" || purpose === "product") return "image/jpeg";
  if (purpose === "report") return "application/pdf";
  return "application/octet-stream";
}
