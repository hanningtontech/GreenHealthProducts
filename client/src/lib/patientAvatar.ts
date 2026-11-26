/** Initials + optional profile-photo data URLs for PDF embedding. */

const PALETTE = [
  "#1d4d3a",
  "#2f6b52",
  "#3d6b5a",
  "#4a7c59",
  "#5f8f6a",
  "#6b8f71",
  "#8a6a1e",
  "#b76645",
];

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Canvas-based circular avatar PNG data URL for PDF embedding. */
export function buildAvatarDataUrl(name: string, size = 256): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const bg = colorForName(name || "Patient");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.38)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initialsFromName(name || "Patient"), size / 2, size / 2 + size * 0.02);
  return canvas.toDataURL("image/png");
}

/**
 * Load a remote profile photo as a PNG/JPEG data URL for jsPDF.
 * Falls back to initials avatar when the photo cannot be fetched.
 */
export async function resolveAvatarDataUrl(
  name: string,
  photoUrl?: string | null,
  size = 256,
): Promise<string> {
  const fallback = buildAvatarDataUrl(name, size);
  const src = String(photoUrl || "").trim();
  if (!src || !/^https?:\/\//i.test(src)) return fallback;
  if (typeof document === "undefined") return fallback;

  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return fallback;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return fallback;
  }
}
