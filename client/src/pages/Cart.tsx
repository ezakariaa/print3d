import { useState, type FormEvent } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { placeOrder } from '../api/client';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';

export function Cart() {
  const { items, total, updateQty, removeItem, clear, itemKey } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const onCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await placeOrder({
        items,
        customer: { name, email, phone, note },
      });
      setStatus({ type: 'ok', text: res.message });
      clear();
      setName('');
      setEmail('');
      setPhone('');
      setNote('');
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="page-hero pb-5">
      <h1>Panier</h1>
      <p className="section-lead">Vérifiez vos articles puis validez la commande.</p>

      {items.length === 0 ? (
        <div>
          <p className="text-secondary">Votre panier est vide.</p>
          <Link to="/boutique">Continuer vos achats →</Link>
          {status?.type === 'ok' && <Alert className="alert-soft mt-4">{status.text}</Alert>}
        </div>
      ) : (
        <Row className="gy-4">
          <Col lg={7}>
            {items.map((item) => {
              const key = itemKey(item);
              return (
                <div key={key} className="cart-row cart-line">
                  <Link
                    to={`/produit/${item.slug}`}
                    className="cart-product-visual"
                    style={{ background: item.imageGradient }}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {(item.imageUrl || getProductImage(item.slug)) && (
                      <img src={item.imageUrl || getProductImage(item.slug)} alt="" />
                    )}
                  </Link>
                  <div className="cart-line-info">
                    <Link to={`/produit/${item.slug}`} className="cart-line-title">{item.name}</Link>
                    {item.customization && (
                      <div className="small text-secondary">
                        {[
                          item.customization.color,
                          item.customization.size,
                          item.customization.text,
                        ].filter(Boolean).join(' · ')}
                        {item.customization.options?.map((option) => (
                          <span className="d-inline-flex align-items-center gap-2 ms-2" key={option.categoryId}>
                            <span>{option.categoryTitle} : {option.value}{option.price ? ` (+${formatPrice(option.price)})` : ''}</span>
                            {option.imageUrl && (
                              <img
                                src={option.imageUrl}
                                alt={`Image téléversée pour ${option.categoryTitle}`}
                                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                              />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="small text-secondary mt-1">{formatPrice(item.price)} / unité</div>
                  </div>
                  <div className="product-quantity-selector cart-line-qty">
                    <button
                      type="button"
                      className="product-quantity-btn"
                      onClick={() => updateQty(key, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label={`Diminuer la quantité de ${item.name}`}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className="product-quantity-input"
                      value={item.quantity}
                      aria-label={`Quantité de ${item.name}`}
                      onChange={(e) => {
                        const next = Math.floor(Number(e.target.value));
                        if (Number.isFinite(next) && next >= 1) updateQty(key, Math.min(99, next));
                      }}
                    />
                    <button
                      type="button"
                      className="product-quantity-btn"
                      onClick={() => updateQty(key, item.quantity + 1)}
                      disabled={item.quantity >= 99}
                      aria-label={`Augmenter la quantité de ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <div className="cart-line-end">
                    <span className="product-price">{formatPrice(item.price * item.quantity)}</span>
                    <Button
                      variant="link"
                      className="admin-icon-btn admin-icon-btn-danger"
                      title="Retirer du panier"
                      aria-label={`Retirer ${item.name} du panier`}
                      onClick={() => removeItem(key)}
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
              );
            })}
            <div className="d-flex justify-content-between align-items-center mt-3">
              <span className="text-secondary">Total</span>
              <span className="fs-4 product-price">{formatPrice(total)}</span>
            </div>
          </Col>
          <Col lg={5}>
            <Form onSubmit={onCheckout} className="custom-panel">
              <h2 className="h5 mb-3">Vos coordonnées</h2>
              <Form.Group className="mb-3">
                <Form.Label>Nom</Form.Label>
                <Form.Control value={name} onChange={(e) => setName(e.target.value)} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>E-mail</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Téléphone</Form.Label>
                <Form.Control value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Note</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Form.Group>
              <Alert variant="info" className="small">
                Le paiement en ligne n’est pas encore activé. L’atelier vous recontactera pour la suite.
              </Alert>
              <Button type="submit" className="btn-brand w-100" disabled={loading}>
                {loading ? 'Envoi…' : 'Valider la commande'}
              </Button>
              {status && (
                <Alert
                  className={`mt-3 mb-0 ${status.type === 'ok' ? 'alert-soft' : ''}`}
                  variant={status.type === 'ok' ? undefined : 'warning'}
                >
                  {status.text}
                </Alert>
              )}
            </Form>
          </Col>
        </Row>
      )}
    </Container>
  );
}
