import { Pagination } from 'react-bootstrap';

interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Page numbers shown around the current one; the first and last pages are always shown. */
function visiblePages(page: number, pageCount: number): Array<number | 'gap'> {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) result.push('gap');
    result.push(p);
  });
  return result;
}

export function Paginator({ page, pageCount, onChange, className }: Props) {
  if (pageCount <= 1) return null;
  return (
    <Pagination className={`brand-pagination justify-content-center mb-0 ${className ?? ''}`}>
      <Pagination.Item
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <span aria-hidden="true">‹</span>
        <span className="visually-hidden">Page précédente</span>
      </Pagination.Item>
      {visiblePages(page, pageCount).map((p, index) => (
        p === 'gap'
          ? <Pagination.Ellipsis key={`gap-${index}`} disabled />
          : (
            <Pagination.Item key={p} active={p === page} onClick={() => onChange(p)}>
              {p}
            </Pagination.Item>
          )
      ))}
      <Pagination.Item
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <span aria-hidden="true">›</span>
        <span className="visually-hidden">Page suivante</span>
      </Pagination.Item>
    </Pagination>
  );
}

/** Clamps a page number to the available pages (after a filter shrinks the list). */
export function clampPage(page: number, itemCount: number, pageSize: number) {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(itemCount / pageSize)));
}
