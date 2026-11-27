import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, markNotificationsRead, type UserNotification } from '../api/client';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';

/** Unread notifications are checked this often while the tab is visible. */
const POLL_MS = 2 * 60 * 1000;

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function timeAgo(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return 'à l’instant';
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

const KIND_ICONS: Record<string, string> = {
  processing: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  completed: 'm5 12.5 4.5 4.5L19 7.5',
  delivered: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01',
  cancelled: 'M6 6l12 12M18 6 6 18',
};

/**
 * Bell of the navigation bar (signed-in customers): number of unread notifications,
 * and the list when opened (opening marks them as read).
 */
export function NotificationBell({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      setSignedIn(Boolean(user && !user.isAnonymous));
      setUnread(0);
      setItems(null);
    });
  }, []);

  const checkUnread = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    fetchNotifications(true)
      .then((list) => setUnread(list.length))
      .catch(() => undefined);
  }, []);

  // Cheap poll: only the unread notifications, while the tab is visible.
  useEffect(() => {
    if (!signedIn) return;
    checkUnread();
    const timer = window.setInterval(checkUnread, POLL_MS);
    document.addEventListener('visibilitychange', checkUnread);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkUnread);
    };
  }, [signedIn, checkUnread]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    try {
      const list = await fetchNotifications();
      setItems(list);
      if (list.some((item) => !item.read)) {
        await markNotificationsRead();
        setUnread(0);
      }
    } catch {
      setItems([]);
    }
  };

  if (!signedIn) return null;

  return (
    <div className={`notif ${className}`} ref={rootRef}>
      <button
        type="button"
        className="notif-button"
        aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => void toggle()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-count">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <Link to="/mes-commandes" onClick={() => { setOpen(false); onNavigate?.(); }}>Mes commandes</Link>
          </div>
          {items === null ? (
            <p className="notif-empty">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">Aucune notification pour le moment. Vous serez prévenu ici de l’avancement de vos commandes.</p>
          ) : (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to="/mes-commandes"
                    className={`notif-item is-${item.kind}${item.read ? '' : ' is-unread'}`}
                    onClick={() => { setOpen(false); onNavigate?.(); }}
                  >
                    <span className="notif-item-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={KIND_ICONS[item.kind] ?? KIND_ICONS.processing} />
                      </svg>
                    </span>
                    <span className="notif-item-body">
                      <span className="notif-item-title">{item.title}</span>
                      <span className="notif-item-text">{item.message}</span>
                      <span className="notif-item-time">{timeAgo(item.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
