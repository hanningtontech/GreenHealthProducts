import { clampPage } from "@/lib/listPaging";

type ListPagerProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
  pageSizeAriaLabel?: string;
};

export default function ListPager({
  page,
  totalPages,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  className = "",
  prevLabel = "Previous",
  nextLabel = "Next",
  pageSizeAriaLabel = "Items per page",
}: ListPagerProps) {
  const safePage = clampPage(page, totalPages);
  const showSize = Boolean(pageSizeOptions?.length && onPageSizeChange && pageSize != null);
  if (totalPages <= 1 && !showSize) return null;

  return (
    <nav className={`list-pager ${className}`.trim()} aria-label="List pagination">
      {showSize && (
        <div className="list-pager-size">
          <span className="muted">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange!(Number(e.target.value))}
            aria-label={pageSizeAriaLabel}
          >
            {pageSizeOptions!.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="button"
        className="button button-secondary"
        disabled={safePage <= 1}
        onClick={() => onPageChange(Math.max(1, safePage - 1))}
      >
        {prevLabel}
      </button>
      <span className="list-pager-indicator muted">
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        className="button button-secondary"
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
      >
        {nextLabel}
      </button>
    </nav>
  );
}