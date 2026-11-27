import { useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Table } from 'react-bootstrap';
import type { AdminOrder, AdminUser, AdminUserDetails } from '../api/client';
import { formatPrice } from '../utils/formatPrice';
import { isValidatedSale } from '../utils/sales';

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
  orders: AdminOrder[];
  onToggle: (uid: string, disabled: boolean) => void;
  onSave: (uid: string, details: AdminUserDetails) => Promise<void>;
  onDelete: (user: AdminUser) => void;
}

/** "Gestion des utilisateurs": accounts, roles, verification and access. */
export function AdminUsers({ users, orders, onToggle, onSave, onDelete }: Props) {
  const [previewUser, setPreviewUser] = useState<AdminUser | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
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
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} className="text-secondary">{users.length ? 'Aucun compte ne correspond.' : 'Aucun utilisateur enregistré.'}</td></tr>
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
                <td className="text-center">
                  <div className="user-actions">
                    <Button
                      variant="link"
                      className="admin-icon-btn"
                      title="Aperçu"
                      aria-label={`Aperçu du compte de ${displayName(user)}`}
                      onClick={() => setPreviewUser(user)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </Button>
                    <Button
                      variant="link"
                      className="admin-icon-btn"
                      title="Modifier"
                      aria-label={`Modifier le compte de ${displayName(user)}`}
                      onClick={() => setEditUser(user)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </Button>
                    <Button
                      variant="link"
                      className="admin-icon-btn admin-icon-btn-danger"
                      title={user.role === 'Administrateur' ? 'Le compte administrateur ne peut pas être supprimé' : 'Supprimer'}
                      aria-label={`Supprimer le compte de ${displayName(user)}`}
                      disabled={user.role === 'Administrateur'}
                      onClick={() => onDelete(user)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {previewUser && (
        <UserPreviewModal
          user={users.find((item) => item.uid === previewUser.uid) ?? previewUser}
          orders={orders.filter((order) => order.uid === previewUser.uid)}
          onHide={() => setPreviewUser(null)}
          onEdit={() => { setEditUser(previewUser); setPreviewUser(null); }}
        />
      )}
      {editUser && (
        <UserEditModal user={editUser} onHide={() => setEditUser(null)} onSave={onSave} />
      )}
    </section>
  );
}

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Reçue', className: 'is-pending' },
  processing: { label: 'En préparation', className: 'is-processing' },
  completed: { label: 'Terminée', className: 'is-completed' },
  cancelled: { label: 'Annulée', className: 'is-cancelled' },
};

function UserPreviewModal({ user, orders, onHide, onEdit }: {
  user: AdminUser;
  orders: AdminOrder[];
  onHide: () => void;
  onEdit: () => void;
}) {
  const validated = orders.filter(isValidatedSale);
  const spent = validated.reduce((sum, order) => sum + order.total, 0);
  const recent = [...orders].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 5);
  const details: Array<[string, string]> = [
    ['E-mail', user.email],
    ['Téléphone', user.phone || '—'],
    ['Adresse', user.address || '—'],
    ['Ville', user.city || '—'],
    ['Pays', user.country || '—'],
    ['Inscription', fullDate(user.createdAt) || '—'],
    ['Dernière connexion', fullDate(user.lastSignInAt) || '—'],
  ];
  return (
    <Modal show onHide={onHide} centered size="lg" className="user-modal">
      <Modal.Header closeButton>
        <Modal.Title>Aperçu du compte</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="user-preview-head">
          <span className={`user-avatar is-lg${user.role === 'Administrateur' ? ' is-admin' : ''}`} aria-hidden="true">{initials(user)}</span>
          <div className="min-w-0">
            <div className="user-preview-name">{displayName(user)}</div>
            <div className="d-flex flex-wrap gap-2 mt-1">
              <span className={`dash-role${user.role === 'Administrateur' ? ' is-admin' : ''}`}>{user.role}</span>
              <span className={`user-verified${user.emailVerified ? ' is-yes' : ''}`}>{user.emailVerified ? '✓ E-mail vérifié' : 'E-mail non vérifié'}</span>
              <span className={`user-access${user.disabled ? ' is-off' : ''}`}>{user.disabled ? 'Désactivé' : 'Actif'}</span>
            </div>
          </div>
        </div>

        <div className="user-preview-stats">
          <div><span className="user-preview-stat">{orders.length}</span><span>Commande{orders.length > 1 ? 's' : ''}</span></div>
          <div><span className="user-preview-stat">{validated.length}</span><span>Vente{validated.length > 1 ? 's' : ''} validée{validated.length > 1 ? 's' : ''}</span></div>
          <div><span className="user-preview-stat">{formatPrice(spent)}</span><span>Total encaissé</span></div>
        </div>

        <dl className="user-preview-details">
          {details.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>

        <h3 className="order-edit-section">Dernières commandes</h3>
        {recent.length === 0 ? (
          <p className="text-secondary mb-0">Aucune commande passée avec ce compte.</p>
        ) : (
          <ul className="user-preview-orders">
            {recent.map((order) => {
              const status = ORDER_STATUS[order.status] ?? { label: order.status, className: '' };
              return (
                <li key={order.orderId}>
                  <span className="fw-semibold">{order.orderId}</span>
                  <span className="admin-order-muted">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR') : '—'}</span>
                  <span className={`my-order-status ${status.className}`}>{status.label}</span>
                  <span className="fw-semibold text-end">{formatPrice(order.total)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Fermer</Button>
        <Button className="btn-brand" onClick={onEdit}>Modifier</Button>
      </Modal.Footer>
    </Modal>
  );
}

function UserEditModal({ user, onHide, onSave }: {
  user: AdminUser;
  onHide: () => void;
  onSave: (uid: string, details: AdminUserDetails) => Promise<void>;
}) {
  const [form, setForm] = useState<AdminUserDetails>({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
    address: user.address ?? '',
    city: user.city ?? '',
    country: user.country || 'Maroc',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = (key: keyof AdminUserDetails) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(user.uid, form);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={onHide} centered size="lg" className="user-modal">
      <Form onSubmit={onSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Modifier le compte</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Row className="g-3">
            <Col sm={6}>
              <Form.Label htmlFor="user-first-name">Prénom</Form.Label>
              <Form.Control id="user-first-name" required maxLength={100} {...field('firstName')} />
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="user-last-name">Nom</Form.Label>
              <Form.Control id="user-last-name" required maxLength={100} {...field('lastName')} />
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="user-email">E-mail</Form.Label>
              <Form.Control id="user-email" value={user.email} disabled readOnly />
              <Form.Text>L’adresse de connexion ne se modifie pas ici.</Form.Text>
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="user-phone">Téléphone</Form.Label>
              <Form.Control id="user-phone" type="tel" maxLength={40} {...field('phone')} />
            </Col>
            <Col xs={12}>
              <Form.Label htmlFor="user-address">Adresse</Form.Label>
              <Form.Control id="user-address" maxLength={300} {...field('address')} />
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="user-city">Ville</Form.Label>
              <Form.Control id="user-city" maxLength={100} {...field('city')} />
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="user-country">Pays</Form.Label>
              <Form.Control id="user-country" maxLength={100} {...field('country')} />
            </Col>
          </Row>
          <p className="admin-order-muted mt-3 mb-0">
            Les commandes de ce client (sauf annulées) reprendront ces informations.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide}>Annuler</Button>
          <Button type="submit" className="btn-brand" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
