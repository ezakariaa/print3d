import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, InputGroup, Modal, Row } from 'react-bootstrap';
import {
  fetchCarriers,
  PAYMENT_METHOD_LABELS,
  saveAdminOrder,
  type AdminOrder,
  type Carrier,
  type PaymentMethod,
} from '../api/client';
import type { Product } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { shippingQuote } from '../utils/shipping';

type Draft = Pick<AdminOrder, 'customer' | 'items' | 'shipping' | 'paymentMethod' | 'status'>;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'À traiter' },
  { value: 'processing', label: 'En préparation' },
  { value: 'completed', label: 'Terminée' },
  { value: 'cancelled', label: 'Annulée' },
];

/** Same summary of a line's options as in the orders table. */
function optionSummary(item: AdminOrder['items'][number]) {
  const c = item.customization;
  return [
    c?.color,
    c?.size,
    c?.text,
    ...(c?.options ?? []).map((option) => `${option.categoryTitle} : ${option.value}`),
  ].filter(Boolean).join(' · ');
}

interface Props {
  order: AdminOrder | null;
  products: Product[];
  onHide: () => void;
  onSaved: (order: AdminOrder) => void;
}

/** Lets the administrator correct an order (customer details, lines, delivery, payment, status). */
export function OrderEditModal({ order, products, onHide, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [productToAdd, setProductToAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    setDraft({
      customer: { phone: '', address: '', city: '', note: '', ...order.customer },
      items: order.items.map((item) => ({ ...item })),
      shipping: order.shipping ? { ...order.shipping } : null,
      paymentMethod: order.paymentMethod ?? 'cash_on_delivery',
      status: order.status,
    });
    setProductToAdd('');
    setError('');
    fetchCarriers()
      .then((list) => setCarriers(list.filter((carrier) => carrier.active)))
      .catch(() => setCarriers([]));
  }, [order]);

  const subtotal = useMemo(
    () => (draft?.items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0),
    [draft?.items],
  );

  if (!order || !draft) return null;

  const setCustomer = (field: keyof AdminOrder['customer'], value: string) =>
    setDraft({ ...draft, customer: { ...draft.customer, [field]: value } });

  const setItem = (index: number, changes: Partial<AdminOrder['items'][number]>) =>
    setDraft({ ...draft, items: draft.items.map((item, i) => (i === index ? { ...item, ...changes } : item)) });

  /** Price suggested by the carrier's grid for the customer's city (the admin can still change it). */
  const priceFor = (carrierId: string, city: string) => {
    const carrier = carriers.find((item) => item.id === carrierId);
    return carrier ? shippingQuote(carrier, city, subtotal) : null;
  };

  const chooseCarrier = (carrierId: string) => {
    if (!carrierId) {
      setDraft({ ...draft, shipping: null });
      return;
    }
    const carrier = carriers.find((item) => item.id === carrierId);
    if (!carrier) return;
    const quote = priceFor(carrierId, draft.customer.city ?? '');
    setDraft({
      ...draft,
      shipping: {
        carrierId,
        carrierName: carrier.name,
        price: quote?.price ?? draft.shipping?.price ?? 0,
        delay: quote?.delay ?? carrier.delay,
      },
    });
  };

  const addProduct = () => {
    const product = products.find((item) => item.id === productToAdd);
    if (!product) return;
    setDraft({
      ...draft,
      items: [...draft.items, { productId: product.id, slug: product.slug, name: product.name, price: product.price, quantity: 1 }],
    });
    setProductToAdd('');
  };

  const suggested = draft.shipping ? priceFor(draft.shipping.carrierId, draft.customer.city ?? '') : null;
  const shippingPrice = draft.shipping?.price ?? 0;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.items.length === 0) {
      setError('La commande doit contenir au moins un article.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await saveAdminOrder(order.orderId, draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer la commande.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={onHide} size="xl" centered scrollable className="order-edit-modal">
      <Form onSubmit={onSubmit} className="d-flex flex-column h-100 overflow-hidden">
        <Modal.Header closeButton>
          <Modal.Title>Modifier la commande {order.orderId}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}

          <Row className="g-3 mb-4">
            <Col md={6}>
              <Form.Group controlId="order-edit-status">
                <Form.Label>Statut</Form.Label>
                <Form.Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="order-edit-payment">
                <Form.Label>Paiement</Form.Label>
                <Form.Select
                  value={draft.paymentMethod}
                  onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })}
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                    <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          <h3 className="order-edit-section">Client</h3>
          <Row className="g-3 mb-4">
            <Col md={4}>
              <Form.Group controlId="order-edit-name">
                <Form.Label>Nom</Form.Label>
                <Form.Control required maxLength={120} value={draft.customer.name} onChange={(e) => setCustomer('name', e.target.value)} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="order-edit-email">
                <Form.Label>E-mail</Form.Label>
                <Form.Control required type="email" maxLength={254} value={draft.customer.email} onChange={(e) => setCustomer('email', e.target.value)} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="order-edit-phone">
                <Form.Label>Téléphone</Form.Label>
                <Form.Control maxLength={40} value={draft.customer.phone ?? ''} onChange={(e) => setCustomer('phone', e.target.value)} />
              </Form.Group>
            </Col>
            <Col md={8}>
              <Form.Group controlId="order-edit-address">
                <Form.Label>Adresse</Form.Label>
                <Form.Control maxLength={500} value={draft.customer.address ?? ''} onChange={(e) => setCustomer('address', e.target.value)} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="order-edit-city">
                <Form.Label>Ville</Form.Label>
                <Form.Control maxLength={120} value={draft.customer.city ?? ''} onChange={(e) => setCustomer('city', e.target.value)} />
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="order-edit-note">
                <Form.Label>Note du client</Form.Label>
                <Form.Control as="textarea" rows={2} maxLength={2000} value={draft.customer.note ?? ''} onChange={(e) => setCustomer('note', e.target.value)} />
              </Form.Group>
            </Col>
          </Row>

          <h3 className="order-edit-section">Articles</h3>
          <div className="order-edit-items mb-2">
            {draft.items.map((item, index) => (
              <div className="order-edit-item" key={`${item.productId ?? item.name}-${index}`}>
                <div className="order-edit-item-name">
                  <Form.Control
                    required
                    maxLength={200}
                    aria-label={`Nom de l’article ${index + 1}`}
                    value={item.name}
                    onChange={(e) => setItem(index, { name: e.target.value })}
                  />
                  {optionSummary(item) && <div className="admin-order-muted mt-1">{optionSummary(item)}</div>}
                </div>
                <InputGroup className="order-edit-item-price">
                  <Form.Control
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    aria-label={`Prix unitaire de ${item.name}`}
                    value={item.price}
                    onChange={(e) => setItem(index, { price: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <InputGroup.Text>DH</InputGroup.Text>
                </InputGroup>
                <Form.Control
                  className="order-edit-item-qty"
                  type="number"
                  min={1}
                  max={999}
                  aria-label={`Quantité de ${item.name}`}
                  value={item.quantity}
                  onChange={(e) => setItem(index, { quantity: Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1))) })}
                />
                <span className="order-edit-item-total">{formatPrice(item.price * item.quantity)}</span>
                <Button
                  variant="link"
                  className="admin-icon-btn admin-icon-btn-danger"
                  title="Retirer l’article"
                  aria-label={`Retirer ${item.name}`}
                  disabled={draft.items.length <= 1}
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </Button>
              </div>
            ))}
          </div>
          <div className="d-flex gap-2 mb-4">
            <Form.Select
              aria-label="Produit à ajouter"
              value={productToAdd}
              onChange={(e) => setProductToAdd(e.target.value)}
            >
              <option value="">Ajouter un produit du catalogue…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name} — {formatPrice(product.price)}</option>
              ))}
            </Form.Select>
            <Button variant="outline-secondary" className="text-nowrap" disabled={!productToAdd} onClick={addProduct}>
              Ajouter
            </Button>
          </div>

          <h3 className="order-edit-section">Livraison</h3>
          <Row className="g-3 mb-2">
            <Col md={5}>
              <Form.Group controlId="order-edit-carrier">
                <Form.Label>Transporteur</Form.Label>
                <Form.Select value={draft.shipping?.carrierId ?? ''} onChange={(e) => chooseCarrier(e.target.value)}>
                  <option value="">Aucun / à définir</option>
                  {draft.shipping && !carriers.some((carrier) => carrier.id === draft.shipping?.carrierId) && (
                    <option value={draft.shipping.carrierId}>{draft.shipping.carrierName}</option>
                  )}
                  {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group controlId="order-edit-shipping-price">
                <Form.Label>Frais de livraison</Form.Label>
                <InputGroup>
                  <Form.Control
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    disabled={!draft.shipping}
                    value={draft.shipping?.price ?? 0}
                    onChange={(e) => draft.shipping && setDraft({
                      ...draft,
                      shipping: { ...draft.shipping, price: Math.max(0, Number(e.target.value) || 0) },
                    })}
                  />
                  <InputGroup.Text>DH</InputGroup.Text>
                </InputGroup>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="order-edit-delay">
                <Form.Label>Délai</Form.Label>
                <Form.Control
                  maxLength={120}
                  disabled={!draft.shipping}
                  value={draft.shipping?.delay ?? ''}
                  onChange={(e) => draft.shipping && setDraft({ ...draft, shipping: { ...draft.shipping, delay: e.target.value } })}
                />
              </Form.Group>
            </Col>
          </Row>
          {draft.shipping && (
            <div className="admin-order-muted mb-4">
              {suggested
                ? <>Tarif du transporteur pour {draft.customer.city} : {formatPrice(suggested.price)}
                  {suggested.price !== draft.shipping.price && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 ms-2 align-baseline"
                      onClick={() => draft.shipping && setDraft({ ...draft, shipping: { ...draft.shipping, price: suggested.price, delay: suggested.delay } })}
                    >
                      Appliquer ce tarif
                    </Button>
                  )}</>
                : `${draft.shipping.carrierName} n’a pas de tarif pour « ${draft.customer.city || '—'} » : saisissez les frais à la main.`}
            </div>
          )}

          <div className="cart-summary order-edit-summary">
            <div className="cart-summary-row"><span>Sous-total</span><span>{formatPrice(subtotal)}</span></div>
            <div className="cart-summary-row"><span>Livraison</span><span>{draft.shipping ? formatPrice(shippingPrice) : '—'}</span></div>
            <div className="cart-summary-row is-total"><span>Total</span><span className="product-price">{formatPrice(subtotal + shippingPrice)}</span></div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide}>Annuler</Button>
          <Button type="submit" className="btn-brand" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
