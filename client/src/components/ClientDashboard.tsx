import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AdminOrder, AdminQuote, AdminUser, Expense, UserProfile } from '../api/client';
import { inRange, periodRange } from '../config/finance';
import { isValidatedSale, saleDay } from '../utils/sales';
import { COMPANY } from '../config/company';
import type { Product } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { OwnVerifiedEmailMark } from './VerifiedEmailMark';

export type DashboardSectionKey = 'users' | 'orders' | 'products' | 'options' | 'quotes' | 'services' | 'carriers' | 'sales' | 'expenses' | 'testimonials';

interface SectionInfo {
  path: string;
  title: string;
  description: string;
}

interface Props {
  isAdmin: boolean;
  profile: UserProfile;
  profileName: string;
  profileEmail: string;
  profileInitials: string;
  wishlistCount: number;
  orders: AdminOrder[];
  products: Product[];
  quotes: AdminQuote[];
  users: AdminUser[];
  expenses: Expense[];
  sections: Record<DashboardSectionKey, SectionInfo>;
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS: Record<string, ReactNode> = {
  users: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 19c.5-3 2.5-4.5 6-4.5s5.5 1.5 6 4.5M16 5.5a3 3 0 0 1 0 5.8M18 15c1.9.7 2.8 2 3 4" /></>),
  orders: svg(<><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></>),
  products: svg(<><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>),
  options: svg(<><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>),
  quotes: svg(<><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /><path d="m16 16 1.5 1.5L21 14" /></>),
  services: svg(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M7 18v3h10v-3" /></>),
  carriers: svg(<><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  profile: svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.6 3.1-5.5 7-5.5s6.3 1.9 7 5.5" /></>),
  wishlist: svg(<path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z" />),
  myOrders: svg(<><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /><path d="m9.5 13.5 1.8 1.8 3.4-3.6" /></>),
  revenue: svg(<><path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" /></>),
  sales: svg(<><path d="M4 19V5M4 19h16" /><path d="m7 14 4-4 3 3 5-6" /></>),
  expenses: svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  testimonials: svg(<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="m12 8.5 1.1 2.2 2.4.4-1.7 1.7.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.7 2.4-.4Z" /></>),
  arrow: svg(<path d="M5 12h14M13 6l6 6-6 6" />),
};

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'À traiter', className: 'is-pending' },
  processing: { label: 'En préparation', className: 'is-processing' },
  completed: { label: 'Terminée', className: 'is-completed' },
  cancelled: { label: 'Annulée', className: 'is-cancelled' },
};

/** Management areas, grouped as on the dashboard. */
const GROUPS: Array<{ title: string; keys: DashboardSectionKey[] }> = [
  { title: 'Finances', keys: ['sales', 'expenses'] },
  { title: 'Commandes et devis', keys: ['orders', 'quotes'] },
  { title: 'Catalogue', keys: ['products', 'options', 'services'] },
  { title: 'Clients et livraison', keys: ['users', 'testimonials', 'carriers'] },
];

function ShortcutCard({ to, icon, title, text, badge }: {
  to: string;
  icon: ReactNode;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <Link to={to} className="dash-card">
      <span className="dash-card-icon">{icon}</span>
      <span className="dash-card-body">
        <span className="dash-card-title">
          {title}
          {badge && <span className="dash-card-badge">{badge}</span>}
        </span>
        <span className="dash-card-text">{text}</span>
      </span>
      <span className="dash-card-arrow">{ICONS.arrow}</span>
    </Link>
  );
}

/** Home of the Client Area: profile, shortcuts, and for the administrator key figures and latest orders. */
export function ClientDashboard({
  isAdmin,
  profile,
  profileName,
  profileEmail,
  profileInitials,
  wishlistCount,
  orders,
  products,
  quotes,
  users,
  expenses,
  sections,
}: Props) {
  const pendingOrders = orders.filter((order) => order.status === 'pending').length;
  // Revenue = validated sales only (orders completed AND delivered).
  const validatedSales = orders.filter(isValidatedSale);
  const revenue = validatedSales.reduce((sum, order) => sum + order.total, 0);
  const newQuotes = quotes.filter((quote) => quote.status === 'new').length;
  const activeProducts = products.filter((product) => product.active !== false).length;
  const latestOrders = [...orders]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 5);

  // Current month, for the Finances cards.
  const month = periodRange('month');
  const monthSales = orders
    .filter((order) => isValidatedSale(order) && inRange(saleDay(order), month))
    .reduce((sum, order) => sum + order.total, 0);
  const monthCharges = expenses
    .filter((expense) => inRange(expense.date, month))
    .reduce((sum, expense) => sum + expense.amount, 0);

  const badges: Partial<Record<DashboardSectionKey, string>> = {
    sales: `${formatPrice(monthSales, 0)} ce mois`,
    expenses: `${formatPrice(monthCharges, 0)} ce mois`,
    orders: pendingOrders ? `${pendingOrders} à traiter` : undefined,
    quotes: newQuotes ? `${newQuotes} nouveau${newQuotes > 1 ? 'x' : ''}` : undefined,
    products: `${products.length}`,
    users: `${users.length}`,
  };

  const whatsapp = COMPANY.whatsapp
    ? `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(COMPANY.whatsappMessage)}`
    : '';

  return (
    <div className="dash">
      <aside className="dash-profile">
        <div className="dash-profile-head">
          <div className="profile-avatar" aria-label={`Initiales : ${profileInitials}`}>{profileInitials}</div>
          <div className="dash-profile-id">
            <h2>{profileName || 'Votre profil'}</h2>
            <span className={`dash-role ${isAdmin ? 'is-admin' : ''}`}>{profile.role || 'Utilisateur'}</span>
          </div>
        </div>
        <dl className="dash-profile-list">
          <div><dt>E-mail</dt><dd className="email-with-mark">{profileEmail}<OwnVerifiedEmailMark /></dd></div>
          <div><dt>Téléphone</dt><dd>{profile.phone || 'Non renseigné'}</dd></div>
          <div>
            <dt>Adresse</dt>
            <dd>{[profile.address, profile.city, profile.country].filter(Boolean).join(', ') || 'Non renseignée'}</dd>
          </div>
        </dl>
        <Link to="/profile" className="btn btn-outline-secondary w-100">Modifier mon profil</Link>
      </aside>

      <div className="dash-main">
        {isAdmin && (
          <div className="dash-stats">
            <Link to={sections.orders.path} className="dash-stat is-amber">
              <span className="dash-stat-icon">{ICONS.orders}</span>
              <span className="dash-stat-value">{pendingOrders}</span>
              <span className="dash-stat-label">Commande{pendingOrders > 1 ? 's' : ''} à traiter</span>
            </Link>
            <Link to={sections.orders.path} className="dash-stat is-teal">
              <span className="dash-stat-icon">{ICONS.revenue}</span>
              <span className="dash-stat-value">{formatPrice(revenue, 0)}</span>
              <span className="dash-stat-label">Chiffre d’affaires ({validatedSales.length} vente{validatedSales.length > 1 ? 's' : ''} validée{validatedSales.length > 1 ? 's' : ''})</span>
            </Link>
            <Link to={sections.quotes.path} className="dash-stat is-blue">
              <span className="dash-stat-icon">{ICONS.quotes}</span>
              <span className="dash-stat-value">{newQuotes}</span>
              <span className="dash-stat-label">Nouveau{newQuotes > 1 ? 'x' : ''} devis</span>
            </Link>
            <Link to={sections.products.path} className="dash-stat is-violet">
              <span className="dash-stat-icon">{ICONS.products}</span>
              <span className="dash-stat-value">{activeProducts}</span>
              <span className="dash-stat-label">Produits actifs sur {products.length}</span>
            </Link>
          </div>
        )}

        <section>
          <h2 className="dash-title">Mon compte</h2>
          <div className="dash-grid">
            <ShortcutCard to="/profile" icon={ICONS.profile} title="Mon profil" text="Coordonnées et adresse de livraison." />
            <ShortcutCard
              to="/wishlist"
              icon={ICONS.wishlist}
              title="Ma wishlist"
              text={wishlistCount > 0 ? `${wishlistCount} produit${wishlistCount > 1 ? 's' : ''} mis de côté.` : 'Les produits que vous avez aimés.'}
              badge={wishlistCount > 0 ? String(wishlistCount) : undefined}
            />
            {!isAdmin && (
              <ShortcutCard to="/mes-commandes" icon={ICONS.myOrders} title="Mes commandes" text="Suivi, statut et factures." />
            )}
          </div>
        </section>

        {isAdmin && GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="dash-title">{group.title}</h2>
            <div className="dash-grid">
              {group.keys.map((key) => (
                <ShortcutCard
                  key={key}
                  to={sections[key].path}
                  icon={ICONS[key]}
                  title={sections[key].title.replace(/^Gestion des /, '').replace(/^\w/, (c) => c.toUpperCase())}
                  text={sections[key].description}
                  badge={badges[key]}
                />
              ))}
            </div>
          </section>
        ))}

        {isAdmin && (
          <section>
            <div className="d-flex justify-content-between align-items-baseline">
              <h2 className="dash-title">Dernières commandes</h2>
              <Link to={sections.orders.path} className="shop-reset">Toutes les commandes</Link>
            </div>
            {latestOrders.length === 0 ? (
              <p className="text-secondary small">Aucune commande pour le moment.</p>
            ) : (
              <ul className="dash-orders">
                {latestOrders.map((order) => {
                  const status = ORDER_STATUS[order.status] ?? { label: order.status, className: '' };
                  return (
                    <li key={order.orderId}>
                      <Link to={sections.orders.path} className="dash-order">
                        <span className="dash-order-id">{order.orderId}</span>
                        <span className="dash-order-customer">
                          {order.customer.name}
                          <small>
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}
                            {order.customer.city ? ` · ${order.customer.city}` : ''}
                          </small>
                        </span>
                        <span className="dash-order-total">{formatPrice(order.total)}</span>
                        <span className={`my-order-status ${status.className}`}>{status.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {!isAdmin && (
          <section className="dash-help">
            <div>
              <h2 className="h5 mb-1">Besoin d’aide ?</h2>
              <p className="mb-0">Une question sur une commande ou un projet sur mesure : l’atelier vous répond.</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link to="/contact" className="btn btn-light">Nous écrire</Link>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn custom-cta-whatsapp">WhatsApp</a>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
