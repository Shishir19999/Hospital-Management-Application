import { useMemo, useState } from 'react';
import { paginateRows, sortRows } from '../lib/table';
import Icon from './Icon';

// Sortable, paginated table. columns: [{ key, label, sort?: (row) => value, render?: (row) => node, className? }]
export default function DataTable({ columns, rows, rowKey = (r) => r._id, initialSort, pageSize = 10, caption, empty }) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    return col?.sort ? sortRows(rows, col.sort, sort.dir) : rows;
  }, [rows, columns, sort]);
  const view = paginateRows(sorted, page, size);

  const toggle = (c) => {
    if (!c.sort) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
    setPage(1);
  };

  if (!rows.length) return empty || null;
  const from = (view.page - 1) * size + 1;
  return (
    <div className="card table-card">
      <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.className}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
                  >
                    {c.sort ? (
                      <button type="button" className="th-btn" onClick={() => toggle(c)}>
                        {c.label}
                        <span className={`sort-ind${active ? ' on' : ''}`}>
                          <Icon name={active && sort.dir === 'desc' ? 'down' : 'up'} size={13} />
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className} data-label={c.label}>
                    {c.render ? c.render(r) : c.sort ? c.sort(r) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="muted" aria-live="polite">
          {from}-{from + view.rows.length - 1} of {view.total}
        </span>
        <label className="pager-size">
          Rows
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="pager-nav">
          <button type="button" className="btn btn-ghost btn-sm" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
            <Icon name="chevL" size={14} /> Prev
          </button>
          <span>
            Page {view.page} of {view.pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={view.page >= view.pages}
            onClick={() => setPage(view.page + 1)}
          >
            Next <Icon name="chevR" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
