import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { X } from "lucide-react";
import { cropImageToBlob } from "@/lib/profilePhoto";

type Props = {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (blob: Blob, previewUrl: string) => void;
};

export default function ProfilePhotoCropper({ imageSrc, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const confirm = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError("");
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels);
      const previewUrl = URL.createObjectURL(blob);
      onConfirm(blob, previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="profile-crop-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Crop profile photo"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="profile-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-crop-head">
          <div>
            <p className="eyebrow">Photo</p>
            <h2>Crop &amp; zoom</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close cropper" onClick={onCancel} disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="profile-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <label className="profile-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={busy}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <div className="profile-edit-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button button-primary" onClick={() => void confirm()} disabled={busy || !croppedAreaPixels}>
            {busy ? "Preparing…" : "Use photo"}
          </button>
        </div>
        <p className="profile-crop-hint">Your photo is not uploaded until you click Save / Update profile.</p>
      </div>
    </div>
  );
}
