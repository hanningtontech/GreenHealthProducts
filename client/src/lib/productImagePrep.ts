/**
 * Client-side resize guidance for product media before B2 upload.
 */
export const THUMBNAIL_SIZE = {
  label: "Thumbnail (shop cards)",
  recommended: "512 × 512 px square",
  min: "400 × 400 px",
  maxEdge: 512,
  /** Product fits inside this fraction of the square; rest is white margin (matches catalogue cards). */
  contentScale: 0.72,
  square: true,
  maxBytes: 2.5 * 1024 * 1024,
  hint: "Square shop thumbnail with padding so the product does not fill the card.",
} as const;

export const DETAIL_SIZE = {
  label: "Detail / gallery",
  recommended: "1200–1600 px on the long edge",
  min: "800 px on the long edge",
  maxEdge: 1600,
  square: false,
  maxBytes: 4 * 1024 * 1024,
  hint: "Product page gallery. First image is the hero on the detail page.",
} as const;

export type ProductImageKind = "thumbnail" | "detail";

function extFromType(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

/** Resize (and square-crop for thumbnails) for predictable storefront sizes. */
export async function prepareProductImageFile(
  file: File,
  kind: ProductImageKind,
): Promise<{ blob: Blob; fileName: string; contentType: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, or WebP).");
  }
  const spec = kind === "thumbnail" ? THUMBNAIL_SIZE : DETAIL_SIZE;
  if (file.size > spec.maxBytes * 2) {
    throw new Error(`Image is too large (max about ${Math.round(spec.maxBytes / (1024 * 1024))} MB after prepare).`);
  }

  const bitmap = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;

  if (spec.square) {
    const side = Math.min(bitmap.width, bitmap.height);
    sx = Math.floor((bitmap.width - side) / 2);
    sy = Math.floor((bitmap.height - side) / 2);
    sw = side;
    sh = side;
  }

  let width: number;
  let height: number;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process image.");
  }

  if (kind === "thumbnail") {
    const edge = THUMBNAIL_SIZE.maxEdge;
    const content = Math.max(1, Math.round(edge * THUMBNAIL_SIZE.contentScale));
    const inset = Math.floor((edge - content) / 2);
    canvas.width = edge;
    canvas.height = edge;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, edge, edge);
    ctx.drawImage(bitmap, sx, sy, sw, sh, inset, inset, content, content);
    width = edge;
    height = edge;
  } else {
    const scale = Math.min(1, spec.maxEdge / Math.max(sw, sh));
    width = Math.max(1, Math.round(sw * scale));
    height = Math.max(1, Math.round(sh * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  }
  bitmap.close();

  const preferPng = file.type === "image/png" && kind === "detail";
  const contentType = preferPng ? "image/png" : "image/jpeg";
  const quality = kind === "thumbnail" ? 0.85 : 0.88;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not compress image."))),
      contentType,
      quality,
    );
  });

  const base = (file.name.replace(/\.[^.]+$/, "") || kind).replace(/[^\w\-]+/g, "_").slice(0, 40);
  const fileName = `${base}.${extFromType(contentType)}`;
  return { blob, fileName, contentType, width, height };
}
