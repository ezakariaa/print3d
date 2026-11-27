import { useMemo, useState } from 'react';
import { Form, Table } from 'react-bootstrap';
import type { AdminUser } from '../api/client';

type RoleFilter = 'all' | 'Utilisateur' | 'Administrateur';
type StatusFilter = 'all' | 'active' | 'disabled';
type Sort = 'recent' | 'last-sign-in' | 'name';

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** "il y a 3 jours", "hier"… (the exact date is given in a tooltip). */
function relativeDate(value: string | null) {
  if (!value) return '—';
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(days) < 1) {
    const hours = Math.round((new Date(value).getTime() - Date.now()) / 3_600_000);
    return Math.abs(hours) < 1 ? 'à l’instant' : relative.format(hours, 'hour');
  }
  if (Math.abs(days) < 30) return relative.format(days, 'day');
  if (Math.abs(days) < 365) return relative.format(Math.round(days / 30), 'month');
  return relative.format(Math.round(days / 365), 'year');
}

const fullDate = (value: string | null) => (value ? new Date(value).toLocaleString('fr-FR') : '');

const displayName = (user: AdminUser) => user.fullName || user.displayName || user.email;

function initials(user: AdminUser) {
  const fromName = `${user.firstName?.trim().charAt(0) ?? ''}${user.lastName?.trim().charAt(0) ?? ''}`.toUpperCase();
  return fromName || displayName(user).charAt(0).toUpperCase() || '?';
}

interface Props {
  users: AdminUser[];
  onToggle: (uid: string, disabled: boolean) => void;
}

/** "Gestion des utilisateurs": accounts, roles, verification and access. */
export function AdminUsers({ users, onToggle }: Props) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const counts = {
    all: users.length,
    clients: users.filter((user) => user.role !== 'Administrateur').length,
    admins: users.filter((user) => user.role === 'Administrateur').length,
    disabled: users.filter((user) => user.disabled).length,
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = users.filter((user) => (
      (role === 'all' || (role === 'Administrateur' ? user.role === 'Administrateur' : user.role !== 'Administrateur')) &&
      (status === 'all' || (status === 'disabled' ? user.disabled : !user.disabled)) &&
      (!term || `${displayName(user)} ${user.email}`.toLowerCase().includes(term))
    ));
    return [...list].sort((a, b) => {
      if (sort === 'name') return displayName(a).localeCompare(displayName(b), 'fr');
      if (sort === 'last-sign-in') return (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? '');
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
  }, [users, search, role, status, sort]);

  return (
    <section>
      <div className="prod-stats">
        <button type="button" className="prod-stat is-all" onClick={() => { setRole('all'); setStatus('all'); }}>
          <span className="prod-stat-value">{counts.all}</span>
          <span className="prod-stat-label">Comptes</span>
        </button>
        <button type="button" className="prod-stat is-active" onClick={() => setRole('Utilisateur')}>
          <span className="prod-stat-value">{counts.clients}</span>
          <span className="prod-stat-label">Clients</span>
        </button>
        <button type="button" className="prod-stat is-admin" onClick={() => setRole('Administrateur')}>
          <span className="prod-stat-value">{counts.admins}</span>
          <span className="prod-stat-label">Administrateurs</span>
        </button>
        <button type="button" className="prod-stat is-inactive" onClick={() => setStatus('disabled')}>
          <span className="prod-stat-value">{counts.disabled}</span>
          <span className="prod-stat-label">Désactivés</span>
        </button>
      </div>

      <div className="prod-toolbar">
        <div className="shop-search prod-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Form.Control
            type="search"
            placeholder="Rechercher par nom ou e-mail…"
            aria-label="Rechercher un utilisateur"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="featured-tabs" role="tablist" aria-label="Rôle">
          {([
            { value: 'all', label: 'Tous', count: counts.all },
            { value: 'Utilisateur', label: 'Clients', count: counts.clients },
            { value: 'Administrateur', label: 'Administrateurs', count: counts.admins },
          ] as const).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={role === tab.value}
              className={`featured-tab${role === tab.value ? ' is-active' : ''}`}
              onClick={() => setRole(tab.value)}
            >
              {tab.label}
              <span className="featured-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="prod-filters">
        <Form.Select size="sm" aria-label="Statut du compte" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
          <option value="all">Tous les statuts</option>
          <option value="active">Comptes actifs</option>
          <option value="disabled">Comptes désactivés</option>
        </Form.Select>
        <Form.Select size="sm" aria-label="Trier" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
          <option value="recent">Plus récents</option>
          <option value="last-sign-in">Dernière connexion</option>
          <option value="name">Nom (A → Z)</option>
        </Form.Select>
        <span className="prod-count">{visible.length} compte{visible.length > 1 ? 's' : ''}</span>
      </div>

      <div className="table-responsive custom-panel admin-product-panel">
        <Table hover className="align-middle mb-0 admin-product-table users-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>E-mail</th>
              <th>Inscription</th>
              <th>Dernière connexion</th>
              <th className="text-center">Accès</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="text-secondary">{users.length ? 'Aucun compte ne correspond.' : 'Aucun utilisateur enregistré.'}</td></tr>
            )}
            {visible.map((user) => (
              <tr key={user.uid} className={user.disabled ? 'is-disabled' : ''}>
                <td>
                  <div className="user-cell" title={`Identifiant : ${user.uid}`}>
                    <span className={`user-avatar${user.role === 'Administrateur' ? ' is-admin' : ''}`} aria-hidden="true">{initials(user)}</span>
                    <span className="user-names">
                      <span className="fw-semibold">{displayName(user)}</span>
                      <a href={`mailto:${user.email}`} className="admin-order-link">{user.email}</a>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`dash-role${user.role === 'Administrateur' ? ' is-admin' : ''}`}>{user.role}</span>
                </td>
                <td>
                  <span className={`user-verified${user.emailVerified ? ' is-yes' : ''}`}>
                    {user.emailVerified ? '✓ Vérifié' : 'Non vérifié'}
                  </span>
                </td>
                <td className="text-nowrap" title={fullDate(user.createdAt)}>{relativeDate(user.createdAt)}</td>
                <td className="text-nowrap" title={fullDate(user.lastSignInAt)}>{relativeDate(user.lastSignInAt)}</td>
                <td className="text-center">
                  <Form.Check
                    type="switch"
                    id={`user-status-${user.uid}`}
                    className="d-inline-flex align-items-center gap-2"
                    label={user.disabled ? 'Désactivé' : 'Actif'}
                    checked={!user.disabled}
                    onChange={(event) => onToggle(user.uid, !event.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
