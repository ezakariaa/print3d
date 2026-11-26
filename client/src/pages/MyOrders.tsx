import { useEffect, useState } from 'react';
import { Button, Container } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchMyOrders, PAYMENT_METHOD_LABELS, type AdminOrder } from '../api/client';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';
import { formatPrice } from '../utils/formatPrice';

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Reçue', className: 'is-pending' },
  processing: { label: 'En préparation', className: 'is-processing' },
  completed: { label: 'Terminée', className: 'is-completed' },
  cancelled: { label: 'Annulée', className: 'is-cancelled' },
};

function dateLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
}

export function MyOrders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState<AdminOrder | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setSignedIn(false);
      return;
    }
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      const isMember = Boolean(user && !user.isAnonymous);
      setSignedIn(isMember);
      if (!isMember) return;
      setError('');
      fetchMyOrders()
        .then((list) => {
          if (!cancelled) setOrders(list);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger vos commandes.');
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <Container className="page-hero pb-5">
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
        <div>
          <h1>Mes commandes</h1>
          <p className="section-lead mb-0">Les commandes passées avec votre compte et leur avancement.</p>
        </div>
        <Link to="/admin" className="btn btn-outline-secondary">Retour à l’Espace Client</Link>
      </div>

      {signedIn === false && (
        <div className="custom-panel text-center py-5">
          <p className="mb-3 text-secondary">Connectez-vous pour voir vos commandes.</p>
          <Link to="/admin" className="btn btn-brand">Se connecter</Link>
        </div>
      )}

      {error && <p className="text-warning">{error}</p>}

      {signedIn && !error && orders === null && <p className="text-secondary">Chargement de vos commandes…</p>}

      {orders?.length === 0 && (
        <div className="custom-panel text-center py-5">
          <p className="mb-3 text-secondary">Vous n’avez pas encore passé de commande.</p>
          <Link to="/boutique" className="btn btn-brand">Découvrir la boutique</Link>
        </div>
      )}

      <div className="my-orders">
        {orders?.map((order) => {
          const status = STATUS[order.status] ?? { label: order.status, className: '' };
          return (
            <article className="custom-panel my-order" key={order.orderId}>
              <header className="my-order-header">
                <div>
                  <div className="admin-order-id">{order.orderId}</div>
                  <div className="admin-order-muted">Passée le {dateLabel(order.createdAt)}</div>
                </div>
                <span className={`my-order-status ${status.className}`}>{status.label}</span>
              </header>

              <ul className="admin-order-items my-order-items">
                {order.items.map((item, index) => {
                  const customization = item.customization;
                  const details = [
                    customization?.color,
                    customization?.size,
                    customization?.text,
                    ...(customization?.options ?? []).map((option) => `${option.categoryTitle} : ${option.value}`),
                  ].filter(Boolean) as string[];
                  return (
                    <li key={`${item.name}-${index}`}>
                      <div className="admin-order-item-line">
                        <span className="admin-order-qty">{item.quantity}×</span>
                        <span className="admin-order-item-name">{item.name}</span>
                        <span className="text-nowrap ms-auto">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                      {details.length > 0 && (
                        <div className="admin-order-options">
                          {details.map((detail) => <span className="admin-order-chip" key={detail}>{detail}</span>)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <footer className="my-order-footer">
                <div className="my-order-meta">
                  {order.shipping && (
                    <div>
                      <span className="admin-order-muted">Livraison</span>
                      <div>
                        {order.shipping.carrierName} · {order.shipping.price === 0 ? 'gratuite' : formatPrice(order.shipping.price)}
                        {order.customer.city ? ` · ${order.customer.city}` : ''}
                      </div>
                    </div>
                  )}
                  {order.paymentMethod && (
                    <div>
                      <span className="admin-order-muted">Paiement</span>
                      <div>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
                    </div>
                  )}
                </div>
                <div className="my-order-total">
                  <span className="admin-order-muted">Total</span>
                  <div className="admin-order-total">{formatPrice(order.total)}</div>
                  <Button size="sm" variant="link" className="admin-order-invoice" onClick={() => setInvoiceOrder(order)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5M9 13h6M9 17h4" />
                    </svg>
                    Facture PDF
                  </Button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>

      <InvoicePreviewModal order={invoiceOrder} onHide={() => setInvoiceOrder(null)} />
    </Container>
  );
}
