/** Initials avatar data-URL for reports (no uploaded photos until media server). */

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
