import { useEffect, useMemo, useState } from 'react';
import { Button, Container } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchMyOrders, fetchProducts, PAYMENT_METHOD_LABELS, type AdminOrder } from '../api/client';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';
import type { Product } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Reçue', className: 'is-pending' },
  processing: { label: 'En préparation', className: 'is-processing' },
  completed: { label: 'Terminée', className: 'is-completed' },
  cancelled: { label: 'Annulée', className: 'is-cancelled' },
};

/** Steps of the progress bar, in order. */
const STEPS = [
  { status: 'pending', label: 'Reçue' },
  { status: 'processing', label: 'En préparation' },
  { status: 'completed', label: 'Terminée' },
];

function dateLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
}

function itemDetails(item: AdminOrder['items'][number]) {
  const c = item.customization;
  return [
    c?.color,
    c?.size,
    c?.text,
    ...(c?.options ?? []).map((option) => `${option.categoryTitle} : ${option.value}`),
  ].filter(Boolean) as string[];
}

function OrderProgress({ status }: { status: string }) {
  if (status === 'cancelled') {
    return <div className="mo-cancelled">Cette commande a été annulée.</div>;
  }
  const current = Math.max(0, STEPS.findIndex((step) => step.status === status));
  return (
    <ol className="mo-progress" aria-label="Avancement de la commande">
      {STEPS.map((step, index) => (
        <li
          key={step.status}
          className={index < current ? 'is-done' : index === current ? 'is-current' : ''}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="mo-progress-dot" aria-hidden="true">
            {index < current || (index === current && step.status === 'completed') ? '✓' : index + 1}
          </span>
          <span className="mo-progress-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** One order of "Mes commandes". */
export function MyOrderCard({
  order,
  productById,
  onInvoice,
}: {
  order: AdminOrder;
  productById: Map<string, Product>;
  onInvoice: (order: AdminOrder) => void;
}) {
  const imageFor = (item: AdminOrder['items'][number]) => {
    const product = item.productId ? productById.get(item.productId) : undefined;
    return getProductImage(product?.slug ?? item.slug ?? '', product?.images);
  };

  const status = STATUS[order.status] ?? { label: order.status, className: '' };
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <article className="mo-card">
      <header className="mo-head">
        <div>
          <div className="mo-kicker">Commande</div>
          <div className="mo-number">{order.orderId}</div>
          <div className="mo-date">
            Passée le {dateLabel(order.createdAt)} · {itemCount} article{itemCount > 1 ? 's' : ''}
          </div>
        </div>
        <span className={`my-order-status ${status.className}`}>{status.label}</span>
      </header>

      <ul className="mo-items">
        {order.items.map((item, index) => {
          const details = itemDetails(item);
          const image = imageFor(item);
          const product = item.productId ? productById.get(item.productId) : undefined;
          return (
            <li className="mo-item" key={`${item.name}-${index}`}>
              <div className="mo-thumb">
                {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{item.name.charAt(0)}</span>}
              </div>
              <div className="mo-item-body">
                {product ? (
                  <Link to={`/produit/${product.slug}`} className="mo-item-name">{item.name}</Link>
                ) : (
                  <span className="mo-item-name">{item.name}</span>
                )}
                {details.length > 0 && <div className="mo-item-details">{details.join(' · ')}</div>}
                <div className="mo-item-qty">
                  {item.quantity} × {formatPrice(item.price)}
                </div>
              </div>
              <div className="mo-item-total">{formatPrice(item.price * item.quantity)}</div>
            </li>
          );
        })}
      </ul>

      <div className="mo-bottom">
        <div className="mo-left">
        <div className="mo-info">
          {order.shipping && (
            <div className="mo-info-block">
              <div className="mo-info-title">Livraison</div>
              <div className="mo-info-main">{order.shipping.carrierName}</div>
              <div className="mo-info-sub">
                {[order.customer.address, order.customer.city].filter(Boolean).join(', ')}
              </div>
              {order.shipping.delay && <div className="mo-info-sub">Délai : {order.shipping.delay}</div>}
            </div>
          )}
          {order.paymentMethod && (
            <div className="mo-info-block">
              <div className="mo-info-title">Paiement</div>
              <div className="mo-info-main">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
            </div>
          )}
        </div>
        {/* Progress under the delivery and payment details. */}
        <OrderProgress status={order.status} />
        </div>

        <div className="mo-summary">
          <div className="mo-summary-row"><span>Sous-total</span><span>{formatPrice(subtotal)}</span></div>
          {order.shipping && (
            <div className="mo-summary-row">
              <span>Livraison</span>
              <span>{order.shipping.price === 0 ? 'Offerte' : formatPrice(order.shipping.price)}</span>
            </div>
          )}
          <div className="mo-summary-row is-total"><span>Total</span><span>{formatPrice(order.total)}</span></div>
          <Button variant="outline-secondary" size="sm" className="mo-invoice" onClick={() => onInvoice(order)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h4" />
            </svg>
            Voir la facture PDF
          </Button>
        </div>
      </div>
    </article>
  );
}

export function MyOrders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState<AdminOrder | null>(null);

  useEffect(() => {
    // Product photos come from the catalogue (already cached by the shop).
    fetchProducts().then(setCatalogue).catch(() => setCatalogue([]));
  }, []);

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

  const productById = useMemo(() => new Map(catalogue.map((product) => [product.id, product])), [catalogue]);

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

      <div className="mo-list">
        {orders?.map((order) => (
          <MyOrderCard key={order.orderId} order={order} productById={productById} onInvoice={setInvoiceOrder} />
        ))}
      </div>

      <InvoicePreviewModal order={invoiceOrder} onHide={() => setInvoiceOrder(null)} />
    </Container>
  );
}
