/**
 * Profile photo helpers — crop/compress locally, upload to Backblaze B2,
 * return the public HTTPS URL stored on the user profile.
 */
import type { Area } from "react-easy-crop";
import { isHttpUrl, uploadMediaFile } from "@/lib/mediaStorage";

const MAX_EDGE = 512;
const JPEG_QUALITY = 0.82;

/** Crop a source image URL to a JPEG blob using pixel crop area from react-easy-crop. */
export async function cropImageToBlob(
  imageSrc: string,
  crop: Area,
  options?: { maxEdge?: number; quality?: number },
): Promise<Blob> {
  const maxEdge = options?.maxEdge ?? MAX_EDGE;
  const quality = options?.quality ?? JPEG_QUALITY;
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
  return canvasToJpeg(canvas, quality);
}

/** Resize + compress a picked image for upload payload (no crop). */
export async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToJpeg(canvas, JPEG_QUALITY);
}

/**
 * Upload profile photo to B2 under media/profiles/{uid}/avatar.jpg.
 * Accepts a File or already-cropped Blob. Does not touch Firestore.
 */
export async function uploadProfilePhoto(file: File | Blob, _uid?: string): Promise<string> {
  const blob = file instanceof File ? await prepareProfilePhoto(file) : file;
  const { publicUrl } = await uploadMediaFile(blob, {
    purpose: "profile",
    fileName: "avatar.jpg",
  });
  if (!isHttpUrl(publicUrl)) {
    throw new Error("Upload succeeded but no public image URL was returned.");
  }
  return publicUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load image for cropping.")));
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not compress image."))),
      "image/jpeg",
      quality,
    );
  });
}
