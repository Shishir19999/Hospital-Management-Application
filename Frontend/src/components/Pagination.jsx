import { useEffect, useState } from 'react';

// Search box + Prev/Next controls for server-paginated lists.
// `meta` is { page, pages, total } from the API; onPage/onSearch update the parent's query.
export default function Pagination({ meta, onPage, search, onSearch, placeholder = 'Search...' }) {
  const [text, setText] = useState(search);

  // Debounce typing so we do not hit the API on every keystroke.
  useEffect(() => {
    if (text.trim() === search) return undefined;
    const id = setTimeout(() => onSearch(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text, search, onSearch]);

  return (
    <div className="list-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
      <input
        type="search"
        aria-label="Search"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" data-testid="prev-page" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Prev</button>
      <span data-testid="page-info">Page {meta.page} of {meta.pages} ({meta.total} total)</span>
      <button type="button" data-testid="next-page" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</button>
    </div>
  );
}
