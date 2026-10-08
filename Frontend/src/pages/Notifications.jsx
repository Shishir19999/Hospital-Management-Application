import { Link } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { errorMessage } from '../api/errors';
import { timeAgo } from '../lib/format';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { Tag } from '../ui/Kit';

export default function Notifications() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/notifications');
  const mark = async (ids) => {
    try {
      await api.post('/notifications/read', { ids });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const list = data?.data || [];
  return (
    <>
      <PageHeader title="Notifications and reminders" subtitle={data ? `${data.unread} unread` : ''}>
        <button type="button" className="btn btn-ghost" disabled={!data?.unread} onClick={() => mark(list.map((n) => n.id))}>Mark all read</button>
      </PageHeader>
      {loading && <SkeletonList label="Loading notifications" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && list.length === 0 && <EmptyState title="You are all caught up" text="Reminders about appointments, results, stock and bills show up here." />}
      {list.length > 0 && (
        <ul className="card notif-list">
          {list.map((n) => (
            <li key={n.id} className={n.read ? 'is-read' : ''}>
              <div>
                <strong>{n.kind !== 'info' && <Tag tone={n.kind === 'critical' ? 'bad' : 'warn'}>{n.kind}</Tag>} {n.title}</strong>
                <p className="muted">{n.body} {n.at ? `- ${timeAgo(n.at)}` : ''}</p>
              </div>
              <div className="row-actions">
                {n.link && <Link className="btn btn-ghost btn-sm" to={n.link}>Open</Link>}
                {!n.read && <button type="button" className="btn btn-ghost btn-sm" onClick={() => mark([n.id])}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
