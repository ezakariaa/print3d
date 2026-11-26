import { useState } from 'react';
import { Button, Form, Table } from 'react-bootstrap';
import { PAYMENT_METHOD_LABELS, type AdminOrder } from '../api/client';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { formatPrice } from '../utils/formatPrice';

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('fr-FR') : '—';
}

interface Props {
  orders: AdminOrder[];
  onStatusChange: (orderId: string, status: string) => void;
}

/** Orders table of "Gestion des commandes". */
export function AdminOrdersTable({ orders, onStatusChange }: Props) {
  const [invoiceOrder, setInvoiceOrder] = useState<AdminOrder | null>(null);

  return (
    <>
    <div className="table-responsive custom-panel admin-product-panel">
      <Table hover className="mb-0 admin-product-table admin-orders-table">
        <thead>
          <tr>
            <th>Commande</th>
            <th>Client</th>
            <th>Articles</th>
            <th>Livraison</th>
            <th className="text-end">Total</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.orderId}>
              <td>
                <div className="admin-order-id">{order.orderId}</div>
                <div className="admin-order-muted text-nowrap">{dateLabel(order.createdAt)}</div>
                <Button
                  size="sm"
                  variant="link"
                  className="admin-order-invoice"
                  onClick={() => setInvoiceOrder(order)}
                  aria-label={`Aperçu de la facture de la commande ${order.orderId}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5M9 13h6M9 17h4" />
                  </svg>
                  Facture PDF
                </Button>
              </td>
              <td>
                <div className="fw-semibold">{order.customer.name}</div>
                <a className="admin-order-link" href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
                {order.customer.phone && (
                  <div><a className="admin-order-link" href={`tel:${order.customer.phone.replace(/\s+/g, '')}`}>{order.customer.phone}</a></div>
                )}
                {(order.customer.address || order.customer.city) && (
                  <div className="admin-order-muted admin-order-address">
                    {[order.customer.address, order.customer.city].filter(Boolean).join(', ')}
                  </div>
                )}
                {order.customer.note && (
                  <div className="admin-order-note" title="Note du client">« {order.customer.note} »</div>
                )}
              </td>
              <td>
                <ul className="admin-order-items">
                  {order.items.map((item, index) => {
                    const customization = item.customization;
                    const details = [
                      customization?.color,
                      customization?.size,
                      customization?.text,
                    ].filter(Boolean) as string[];
                    return (
                      <li key={`${item.name}-${index}`}>
                        <div className="admin-order-item-line">
                          <span className="admin-order-qty">{item.quantity}×</span>
                          <span className="admin-order-item-name">{item.name}</span>
                          <span className="admin-order-muted text-nowrap ms-auto">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                        {(details.length > 0 || Boolean(customization?.options?.length)) && (
                          <div className="admin-order-options">
                            {details.map((detail) => <span className="admin-order-chip" key={detail}>{detail}</span>)}
                            {customization?.options?.map((option) => (
                              <span className="admin-order-chip" key={option.categoryId}>
                                {option.imageUrl && <img src={option.imageUrl} alt={`Image pour ${option.categoryTitle}`} />}
                                {option.categoryTitle} : {option.value}
                                {option.price ? ` (+${formatPrice(option.price)})` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </td>
              <td>
                {order.shipping ? (
                  <>
                    <div className="fw-semibold">{order.shipping.carrierName}</div>
                    <div className="admin-order-muted">
                      {order.shipping.price === 0 ? 'Gratuite' : formatPrice(order.shipping.price)}
                      {order.shipping.delay ? ` · ${order.shipping.delay}` : ''}
                    </div>
                    {order.customer.city && <div className="admin-order-muted">{order.customer.city}</div>}
                  </>
                ) : (
                  <span className="admin-order-muted">—</span>
                )}
              </td>
              <td className="text-end">
                <div className="admin-order-total">{formatPrice(order.total)}</div>
                {order.shipping && order.subtotal !== undefined && (
                  <div className="admin-order-muted text-nowrap">
                    {formatPrice(order.subtotal)} + {order.shipping.price === 0 ? 'livraison offerte' : formatPrice(order.shipping.price)}
                  </div>
                )}
                {order.paymentMethod && (
                  <span className={`admin-order-payment is-${order.paymentMethod}`}>
                    {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                  </span>
                )}
              </td>
              <td>
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
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} className="text-secondary">Aucune commande enregistrée.</td></tr>}
        </tbody>
      </Table>
    </div>
    <InvoicePreviewModal order={invoiceOrder} onHide={() => setInvoiceOrder(null)} />
    </>
  );
}
