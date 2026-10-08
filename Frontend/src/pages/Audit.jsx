import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { downloadCsv } from '../lib/csv';
import { AUDIT_CSV } from '../lib/exports';
import { fmtDateTime } from '../lib/dates';
import { label } from '../lib/format';
import Icon from '../ui/Icon';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { ServerPager, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

export default function Audit() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/audit', { search, page, limit: 25 });
  const rows = data?.data || [];
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, newest first">
        <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv('audit-log.csv', AUDIT_CSV, rows)}><Icon name="download" /> Export CSV</button>
      </PageHeader>
      <div className="toolbar">
        <div className="field"><label htmlFor="au-q">Search</label><input id="au-q" type="search" placeholder="Person, action or details" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      </div>
      {loading && <SkeletonList label="Loading audit log" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title="No entries" text="Try a different search." />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Audit log">
            <table className="table">
              <caption className="sr-only">Audit log</caption>
              <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Role</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a._id}>
                    <td data-label="When">{fmtDateTime(a.at)}</td><td data-label="Who">{a.userName || '-'}</td><td data-label="Role"><Tag tone="neutral">{label(a.role) || 'n/a'}</Tag></td>
                    <td data-label="Action"><code>{a.action}</code></td><td data-label="Details">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="entries" />
        </div>
      )}
    </>
  );
}
