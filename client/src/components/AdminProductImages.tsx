import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  productImageSrc,
  withSyncedCoverImage,
  type Product,
  type ProductImage,
} from "@/lib/catalog";
import { uploadMediaFile } from "@/lib/mediaStorage";
import { DETAIL_SIZE, prepareProductImageFile, THUMBNAIL_SIZE } from "@/lib/productImagePrep";

type Props = {
  product: Product;
  onChange: (next: Product) => void;
  onStatus?: (message: string) => void;
};

function formatFromUrl(url: string): string {
  const clean = url.split("?")[0] || "";
  const ext = (clean.match(/\.([a-z0-9]+)$/i) || [])[1];
  return (ext || "jpg").toLowerCase();
}

function nextGallerySlot(images: ProductImage[]): string {
  const used = new Set(
    images
      .filter((image) => image.role !== "thumbnail")
      .map((image) => image.slot || image.file_name.replace(/\.[^.]+$/, "")),
  );
  let n = 1;
  while (used.has(`g${n}`)) n += 1;
  return `g${n}`;
}

function AdminImagePreview({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div className={`upload-placeholder ${className || ""}`} aria-label={`${alt} unavailable`}>
        <ImagePlus size={22} />
      </div>
    );
  }
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function AdminProductImages({ product, onChange, onStatus }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const thumbInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  const thumbnail = (product.images || []).find((image) => image.role === "thumbnail");
  const thumbSrc = productImageSrc(thumbnail);
  const gallery = (product.images || [])
    .filter((image) => image.role !== "thumbnail")
    .slice()
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || String(a.file_name).localeCompare(String(b.file_name)));

  const commit = (images: ProductImage[]) => {
    onChange(withSyncedCoverImage({ ...product, images }));
  };

  const beginProgress = (label: string) => {
    setProgress(4);
    setProgressLabel(label);
  };

  const endProgress = () => {
    setProgress(0);
    setProgressLabel("");
    setBusy(null);
  };

  const fail = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    toast.error(message);
    onStatus?.(message);
  };

  const uploadOne = async (
    file: File,
    kind: "thumbnail" | "detail",
    options?: { replaceFileName?: string; slot?: string; sortOrder?: number },
  ) => {
    if (!product.id) throw new Error("Save a product id before uploading images.");
    setProgressLabel(kind === "thumbnail" ? "Preparing thumbnail…" : "Preparing detail image…");
    setProgress(10);
    const prepared = await prepareProductImageFile(file, kind);
    const slot = kind === "thumbnail" ? "thumbnail" : (options?.slot || nextGallerySlot(product.images || []));
    const fileName =
      kind === "thumbnail"
        ? `thumbnail.${prepared.fileName.split(".").pop()}`
        : `${slot}.${prepared.fileName.split(".").pop()}`;

    setProgressLabel(
      kind === "thumbnail"
        ? `Uploading thumbnail (${prepared.width}×${prepared.height})…`
        : `Uploading detail image (${prepared.width}×${prepared.height})…`,
    );

    const { publicUrl } = await uploadMediaFile(prepared.blob, {
      purpose: "product",
      fileName,
      productId: product.id,
      productRole: kind === "thumbnail" ? "thumbnail" : "gallery",
      slot: kind === "thumbnail" ? undefined : slot,
      onProgress: setProgress,
    });

    const record: ProductImage = {
      file_name: options?.replaceFileName || fileName,
      website_path: publicUrl,
      external_url: publicUrl,
      role: kind === "thumbnail" ? "thumbnail" : (options?.sortOrder === 0 ? "primary" : "gallery"),
      format: formatFromUrl(publicUrl),
      sortOrder: kind === "thumbnail" ? undefined : (options?.sortOrder ?? gallery.length),
      slot: kind === "thumbnail" ? "thumbnail" : slot,
      notes: kind === "thumbnail"
        ? `Shop thumbnail · prepared ${prepared.width}×${prepared.height}`
        : `Detail gallery · prepared ${prepared.width}×${prepared.height}`,
    };
    return record;
  };

  const onThumbPick = async (file?: File | null) => {
    if (!file) return;
    setBusy("thumb");
    beginProgress("Uploading thumbnail…");
    try {
      const record = await uploadOne(file, "thumbnail");
      const others = (product.images || []).filter((image) => image.role !== "thumbnail");
      commit([record, ...others]);
      toast.success("Thumbnail uploaded.");
      onStatus?.("Thumbnail uploaded.");
    } catch (err) {
      fail(err, "Thumbnail upload failed");
    } finally {
      endProgress();
      if (thumbInput.current) thumbInput.current.value = "";
    }
  };

  const onGalleryAdd = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("gallery");
    beginProgress(`Uploading ${files.length} detail image(s)…`);
    try {
      let images = [...(product.images || [])];
      let orderBase = images.filter((image) => image.role !== "thumbnail").length;
      const list = Array.from(files);
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i];
        setProgressLabel(`Uploading detail ${i + 1} of ${list.length}…`);
        const slot = nextGallerySlot(images);
        const record = await uploadOne(file, "detail", { slot, sortOrder: orderBase });
        images = [...images.filter((image) => image.role === "thumbnail" || image.slot !== slot), record];
        const thumbs = images.filter((image) => image.role === "thumbnail");
        const details = images
          .filter((image) => image.role !== "thumbnail")
          .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
          .map((image, index) => ({
            ...image,
            sortOrder: index,
            role: index === 0 ? "primary" : "gallery",
          }));
        images = [...thumbs, ...details];
        orderBase = details.length;
      }
      commit(images);
      toast.success(`Uploaded ${files.length} detail image(s).`);
      onStatus?.(`Uploaded ${files.length} detail image(s).`);
    } catch (err) {
      fail(err, "Detail upload failed");
    } finally {
      endProgress();
      if (galleryInput.current) galleryInput.current.value = "";
    }
  };

  const onReplacePick = async (file?: File | null) => {
    if (!file || !replaceTarget) return;
    const target = (product.images || []).find((image) => image.file_name === replaceTarget);
    if (!target) return;
    setBusy(`replace:${replaceTarget}`);
    beginProgress("Replacing image…");
    try {
      const kind = target.role === "thumbnail" ? "thumbnail" : "detail";
      const record = await uploadOne(file, kind, {
        replaceFileName: target.file_name,
        slot: target.slot || target.file_name.replace(/\.[^.]+$/, ""),
        sortOrder: target.sortOrder,
      });
      const images = (product.images || []).map((image) =>
        image.file_name === replaceTarget
          ? { ...record, sortOrder: target.sortOrder, role: target.role === "thumbnail" ? "thumbnail" : record.role }
          : image,
      );
      commit(images);
      toast.success("Image replaced.");
      onStatus?.("Image replaced.");
    } catch (err) {
      fail(err, "Replace failed");
    } finally {
      endProgress();
      setReplaceTarget(null);
      if (replaceInput.current) replaceInput.current.value = "";
    }
  };

  const removeImage = (fileName: string) => {
    commit((product.images || []).filter((image) => image.file_name !== fileName));
    toast.success("Image removed from product.");
    onStatus?.("Image removed from product.");
  };

  const makeFirst = (fileName: string) => {
    const thumbs = (product.images || []).filter((image) => image.role === "thumbnail");
    const details = gallery;
    const chosen = details.find((image) => image.file_name === fileName);
    if (!chosen) return;
    const rest = details.filter((image) => image.file_name !== fileName);
    const ordered = [chosen, ...rest].map((image, index) => ({
      ...image,
      sortOrder: index,
      role: index === 0 ? "primary" : "gallery",
    }));
    commit([...thumbs, ...ordered]);
    toast.success("Set as first detail image.");
    onStatus?.("Set as first detail image.");
  };

  const moveUp = (fileName: string) => {
    const thumbs = (product.images || []).filter((image) => image.role === "thumbnail");
    const details = gallery;
    const index = details.findIndex((image) => image.file_name === fileName);
    if (index <= 0) return;
    const next = details.slice();
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    commit([
      ...thumbs,
      ...next.map((image, order) => ({
        ...image,
        sortOrder: order,
        role: order === 0 ? "primary" : "gallery",
      })),
    ]);
  };

  return (
    <div className="product-images-editor field-wide">
      <div className="product-images-head">
        <span>Product images</span>
        <small>
          Upload, replace, or reorder. Save the product to keep changes in the catalogue.
          If a preview stays blank after upload, open Backblaze → Caps &amp; Alerts and set
          Download + Class B to No Cap (bucket must also be Public).
        </small>
      </div>

      {busy && (
        <div className="product-upload-progress" role="status" aria-live="polite">
          <div className="product-upload-progress-meta">
            <span>{progressLabel || "Uploading…"}</span>
            <b>{Math.max(0, Math.min(100, progress))}%</b>
          </div>
          <div className="product-upload-progress-track">
            <div className="product-upload-progress-fill" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
          </div>
        </div>
      )}

      <section className="product-image-block">
        <div className="product-image-block-copy">
          <b>{THUMBNAIL_SIZE.label}</b>
          <p>{THUMBNAIL_SIZE.hint}</p>
          <ul>
            <li>Recommended: <strong>{THUMBNAIL_SIZE.recommended}</strong></li>
            <li>Minimum: {THUMBNAIL_SIZE.min}</li>
            <li>JPG / PNG / WebP · auto square-cropped to {THUMBNAIL_SIZE.maxEdge}px</li>
          </ul>
        </div>
        <div className="product-image-thumb-row">
          <AdminImagePreview src={thumbSrc} alt="Thumbnail preview" className="product-image-preview is-thumb" />
          <div className="product-image-actions">
            <label className={`button button-secondary upload-button ${busy ? "is-disabled" : ""}`}>
              <Upload size={16} /> {thumbSrc ? "Replace thumbnail" : "Upload thumbnail"}
              <input
                ref={thumbInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={Boolean(busy)}
                onChange={(e) => void onThumbPick(e.target.files?.[0])}
              />
            </label>
            {thumbnail && (
              <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => removeImage(thumbnail.file_name)}>
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="product-image-block">
        <div className="product-image-block-copy">
          <b>{DETAIL_SIZE.label}</b>
          <p>{DETAIL_SIZE.hint}</p>
          <ul>
            <li>Recommended: <strong>{DETAIL_SIZE.recommended}</strong></li>
            <li>Minimum: {DETAIL_SIZE.min}</li>
            <li>JPG / PNG / WebP · long edge capped at {DETAIL_SIZE.maxEdge}px</li>
            <li>Use <strong>First</strong> to choose the hero image on the product page</li>
          </ul>
        </div>

        <div className="product-gallery-admin">
          {gallery.length === 0 && (
            <p className="muted product-gallery-empty">No detail images yet. Add package photos for the product page gallery.</p>
          )}
          {gallery.map((image, index) => {
            const src = productImageSrc(image);
            return (
              <article key={image.file_name} className={`product-gallery-admin-card ${index === 0 ? "is-first" : ""}`}>
                <AdminImagePreview src={src} alt={`Detail ${index + 1}`} />
                <div className="product-gallery-admin-meta">
                  <span>{index === 0 ? "1st · hero" : `Image ${index + 1}`}</span>
                </div>
                <div className="product-gallery-admin-actions">
                  <button type="button" className="mini-button" disabled={Boolean(busy) || index === 0} onClick={() => makeFirst(image.file_name)} title="Show first on product page">
                    <Star size={14} /> First
                  </button>
                  <button type="button" className="mini-button" disabled={Boolean(busy) || index === 0} onClick={() => moveUp(image.file_name)} title="Move earlier">
                    <ArrowUp size={14} /> Up
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setReplaceTarget(image.file_name);
                      replaceInput.current?.click();
                    }}
                  >
                    <Upload size={14} /> Replace
                  </button>
                  <button type="button" className="mini-button" disabled={Boolean(busy)} onClick={() => removeImage(image.file_name)}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="product-image-actions">
          <label className={`button button-secondary upload-button ${busy ? "is-disabled" : ""}`}>
            <ImagePlus size={16} /> Add detail image(s)
            <input
              ref={galleryInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={Boolean(busy)}
              onChange={(e) => void onGalleryAdd(e.target.files)}
            />
          </label>
          <input
            ref={replaceInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => void onReplacePick(e.target.files?.[0])}
          />
        </div>
      </section>
    </div>
  );
}
