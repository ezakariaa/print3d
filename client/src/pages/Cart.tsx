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
                <div key={key} className="cart-row d-flex gap-3">
                  <div
                    className="cart-product-visual"
                    style={{
                      width: 72,
                      height: 72,
                      flexShrink: 0,
                      borderRadius: 4,
                      background: item.imageGradient,
                    }}
                  >
                    {(item.imageUrl || getProductImage(item.slug)) && (
                      <img src={item.imageUrl || getProductImage(item.slug)} alt={`Photo illustrative : ${item.name}`} />
                    )}
                  </div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold">{item.name}</div>
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
                    <div className="product-price small mt-1">
                      {formatPrice(item.price * item.quantity)}
                    </div>
                    <div className="d-flex align-items-center gap-2 mt-2">
                      <Form.Control
                        type="number"
                        min={1}
                        style={{ width: 72 }}
                        value={item.quantity}
                        onChange={(e) => updateQty(key, Number(e.target.value))}
                      />
                      <Button
                        variant="link"
                        className="text-secondary p-0"
                        onClick={() => removeItem(key)}
                      >
                        Retirer
                      </Button>
                    </div>
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
