import { useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { PAYMENT_METHOD_LABELS, type AdminOrder, type DeliveryState } from '../api/client';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { OrderEditModal } from '../components/OrderEditModal';
import type { Product } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';
import { DELIVERY_STATES, deliveryStateOf, isOutOfRevenue, isValidatedSale } from '../utils/sales';

const STATUS_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'À traiter' },
  { value: 'processing', label: 'En préparation' },
  { value: 'completed', label: 'Terminées' },
  { value: 'cancelled', label: 'Annulées' },
];

/** Delivery filters, combined with the order status filters. */
const DELIVERY_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'none', label: 'Non expédiées' },
  { value: 'in_transit', label: 'En cours de livraison' },
  { value: 'delivered', label: 'Livrées' },
  { value: 'returned', label: 'Retournées' },
];

const deliveryKey = (order: AdminOrder) => deliveryStateOf(order) ?? 'none';

function dateLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function itemDetails(item: AdminOrder['items'][number]) {
  const c = item.customization;
  return [
    c?.color,
    c?.size,
    c?.text,
    ...(c?.options ?? []).map((option) => (
      `${option.categoryTitle} : ${option.value}${option.price ? ` (+${formatPrice(option.price)})` : ''}`
    )),
  ].filter(Boolean) as string[];
}

/** Text searched by the search box: number, customer, city, products. */
function searchText(order: AdminOrder) {
  return [
    order.orderId,
    order.customer.name,
    order.customer.email,
    order.customer.phone,
    order.customer.city,
    ...order.items.map((item) => item.name),
  ].filter(Boolean).join(' ').toLowerCase();
}

interface Props {
  orders: AdminOrder[];
  /** Catalogue: product photos, and adding a product while correcting an order. */
  products: Product[];
  onStatusChange: (orderId: string, status: string) => void;
  /** Sets the delivery state (null = none): a completed and delivered order is a validated sale. */
  onDeliveryChange: (orderId: string, state: DeliveryState | null) => void;
  onOrderSaved: (order: AdminOrder) => void;
  /** Asks for confirmation, then deletes the order. */
  onDelete: (order: AdminOrder) => void;
}

/** Orders of "Gestion des commandes", one card per order. */
export function AdminOrdersTable({ orders, products, onStatusChange, onDeliveryChange, onOrderSaved, onDelete }: Props) {
  const [invoiceOrder, setInvoiceOrder] = useState<AdminOrder | null>(null);
  const [editOrder, setEditOrder] = useState<AdminOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  // Each row's counts follow the other row's choice, so they match what a click will show.
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    const shown = orders.filter((order) => deliveryFilter === 'all' || deliveryKey(order) === deliveryFilter);
    result.all = shown.length;
    shown.forEach((order) => { result[order.status] = (result[order.status] ?? 0) + 1; });
    return result;
  }, [orders, deliveryFilter]);

  const deliveryCounts = useMemo(() => {
    const result: Record<string, number> = {};
    const shown = orders.filter((order) => statusFilter === 'all' || order.status === statusFilter);
    result.all = shown.length;
    shown.forEach((order) => { const key = deliveryKey(order); result[key] = (result[key] ?? 0) + 1; });
    return result;
  }, [orders, statusFilter]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => (
      (statusFilter === 'all' || order.status === statusFilter) &&
      (deliveryFilter === 'all' || deliveryKey(order) === deliveryFilter) &&
      (!term || searchText(order).includes(term))
    ));
  }, [orders, statusFilter, deliveryFilter, search]);

  const imageFor = (item: AdminOrder['items'][number]) => {
    const product = item.productId ? productById.get(item.productId) : undefined;
    return getProductImage(product?.slug ?? item.slug ?? '', product?.images);
  };

  return (
    <>
      <div className="ao-toolbar">
        <span className="ao-filter-label" id="ao-status-label">Statut</span>
        <div className="ao-tabs" role="tablist" aria-labelledby="ao-status-label">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.value}
              className={`ao-tab is-${filter.value}${statusFilter === filter.value ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
              <span className="ao-tab-count">{counts[filter.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ao-toolbar ao-toolbar-delivery">
        <span className="ao-filter-label" id="ao-delivery-label">Livraison</span>
        <div className="ao-tabs" role="tablist" aria-labelledby="ao-delivery-label">
          {DELIVERY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={deliveryFilter === filter.value}
              className={`ao-tab is-delivery-${filter.value}${deliveryFilter === filter.value ? ' is-active' : ''}`}
              onClick={() => setDeliveryFilter(filter.value)}
            >
              {filter.label}
              <span className="ao-tab-count">{deliveryCounts[filter.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <Form.Control
          type="search"
          className="ao-search"
          placeholder="Rechercher : n°, client, ville, produit…"
          aria-label="Rechercher une commande"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {visible.length === 0 && (
        <div className="custom-panel text-secondary text-center py-5">
          {orders.length === 0 ? 'Aucune commande enregistrée.' : 'Aucune commande ne correspond à ces critères.'}
        </div>
      )}

      <div className="ao-list">
        {visible.map((order) => {
          const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <article className={`ao-card is-${order.status}`} key={order.orderId}>
              <header className="ao-head">
                <div className="ao-head-main">
                  <span className="ao-number">{order.orderId}</span>
                  <span className="ao-date">{dateLabel(order.createdAt)}</span>
                  <span className="ao-count">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
                </div>
                <div className="ao-head-side">
                  {order.paymentMethod && (
                    <span className={`admin-order-payment is-${order.paymentMethod}`}>
                      {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                    </span>
                  )}
                  <Form.Select
                    size="sm"
                    aria-label={`Statut de la commande ${order.orderId}`}
                    className={`admin-order-status is-${order.status}`}
                    value={order.status}
                    onChange={(event) => void onStatusChange(order.orderId, event.target.value)}
                  >
                    <option value="pending">À traiter</option>
                    <option value="processing">En préparation</option>
                    <option value="completed">Terminée</option>
                    <option value="cancelled">Annulée</option>
                  </Form.Select>
                  <div className="ao-actions">
                    <Button
                      variant="link"
                      className="admin-icon-btn"
                      title="Modifier"
                      aria-label={`Modifier la commande ${order.orderId}`}
                      onClick={() => setEditOrder(order)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </Button>
                    <Button
                      variant="link"
                      className="admin-icon-btn"
                      title="Aperçu de la facture"
                      aria-label={`Aperçu de la facture de la commande ${order.orderId}`}
                      onClick={() => setInvoiceOrder(order)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </Button>
                    <Button
                      variant="link"
                      className="admin-icon-btn admin-icon-btn-danger"
                      title="Supprimer"
                      aria-label={`Supprimer la commande ${order.orderId}`}
                      onClick={() => onDelete(order)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </header>

              <div className="ao-body">
                <section className="ao-col">
                  <h3 className="ao-col-title">Client</h3>
                  <div className="ao-customer">
                    <span className="ao-avatar" aria-hidden="true">
                      {order.customer.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()}
                    </span>
                    <div className="ao-customer-text">
                      <div className="fw-semibold">{order.customer.name}</div>
                      <a className="admin-order-link d-block text-truncate" href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
                      {order.customer.phone && (
                        <a className="admin-order-link" href={`tel:${order.customer.phone.replace(/\s+/g, '')}`}>{order.customer.phone}</a>
                      )}
                    </div>
                  </div>
                  {(order.customer.address || order.customer.city) && (
                    <div className="ao-address">
                      {[order.customer.address, order.customer.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {order.customer.note && <div className="admin-order-note">« {order.customer.note} »</div>}
                </section>

                <section className="ao-col">
                  <h3 className="ao-col-title">Articles</h3>
                  <ul className="ao-items">
                    {order.items.map((item, index) => {
                      const image = imageFor(item);
                      const details = itemDetails(item);
                      return (
                        <li className="ao-item" key={`${item.name}-${index}`}>
                          <span className="ao-thumb">
                            {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{item.name.charAt(0)}</span>}
                            <span className="ao-thumb-qty">{item.quantity}</span>
                          </span>
                          <div className="ao-item-body">
                            <div className="ao-item-name">{item.name}</div>
                            {details.length > 0 && <div className="ao-item-details">{details.join(' · ')}</div>}
                            <div className="ao-item-details">{item.quantity} × {formatPrice(item.price)}</div>
                          </div>
                          <span className="ao-item-total">{formatPrice(item.price * item.quantity)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="ao-col ao-col-summary">
                  <h3 className="ao-col-title">Livraison et total</h3>
                  <div className="ao-shipping">
                    <div className="ao-shipping-row">
                    <div className="ao-shipping-info">
                    <span className="fw-semibold">{order.shipping?.carrierName ?? 'Transporteur à définir'}</span>
                    <div className="admin-order-muted">
                      {[order.customer.city, order.shipping?.delay].filter(Boolean).join(' · ')}
                    </div>
                    {deliveryStateOf(order) === 'delivered' && order.deliveredAt && (
                      <div className="admin-order-muted">
                        Livrée le {new Date(order.deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    )}
                    <span className={`ao-sale-state ${isValidatedSale(order) ? 'is-validated' : isOutOfRevenue(order) ? 'is-cancelled' : 'is-progress'}`}>
                      {isValidatedSale(order)
                        ? '✓ Vente validée'
                        : isOutOfRevenue(order)
                          ? 'Hors chiffre d’affaires'
                          : 'Vente en cours'}
                    </span>
                    </div>
                    {/* One delivery state at a time; ticking the checked one again clears it. */}
                    <div className="ao-delivery" role="group" aria-label={`Livraison de la commande ${order.orderId}`}>
                      {DELIVERY_STATES.map((state) => {
                        const checked = deliveryStateOf(order) === state.value;
                        return (
                          <Form.Check
                            key={state.value}
                            type="checkbox"
                            id={`delivery-${state.value}-${order.orderId}`}
                            className={`ao-delivery-option is-${state.value}${checked ? ' is-checked' : ''}`}
                            label={state.label}
                            checked={checked}
                            disabled={order.status === 'cancelled'}
                            onChange={() => onDeliveryChange(order.orderId, checked ? null : state.value)}
                          />
                        );
                      })}
                    </div>
                    </div>
                  </div>
                  <div className="ao-summary">
                    <div><span>Sous-total</span><span>{formatPrice(subtotal)}</span></div>
                    <div>
                      <span>Livraison</span>
                      <span>{order.shipping ? (order.shipping.price === 0 ? 'Offerte' : formatPrice(order.shipping.price)) : '—'}</span>
                    </div>
                    <div className="is-total"><span>Total</span><span>{formatPrice(order.total)}</span></div>
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </div>

      <InvoicePreviewModal order={invoiceOrder} onHide={() => setInvoiceOrder(null)} />
      <OrderEditModal
        order={editOrder}
        products={products}
        onHide={() => setEditOrder(null)}
        onSaved={(saved) => {
          onOrderSaved(saved);
          setEditOrder(null);
        }}
      />
    </>
  );
}
