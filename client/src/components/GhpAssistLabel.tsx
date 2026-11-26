/**
 * Green Health Products assist mark — letters GHP plus a quiet guidance glyph.
 * No model / vendor names in the UI.
 */
export default function GhpAssistLabel({ busy = false }: { busy?: boolean }) {
  return (
    <span className="ghp-assist-label">
      {busy ? (
        <img src="/brand-leaf.png" alt="" width={16} height={16} className="button-busy-mark" aria-hidden />
      ) : (
        <span className="ghp-assist-glyph" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.1" fill="currentColor" />
            <circle cx="3.2" cy="4.2" r="1.15" fill="currentColor" opacity="0.85" />
            <circle cx="12.8" cy="4.2" r="1.15" fill="currentColor" opacity="0.85" />
            <circle cx="3.2" cy="11.8" r="1.15" fill="currentColor" opacity="0.85" />
            <circle cx="12.8" cy="11.8" r="1.15" fill="currentColor" opacity="0.85" />
            <path
              d="M8 5.9V3.5M8 12.5V10.1M5.9 8H3.5M12.5 8H10.1"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
        </span>
      )}
      <span className="ghp-assist-letters">GHP</span>
    </span>
  );
}
