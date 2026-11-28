import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import {
  fetchCarriers,
  fetchUserProfile,
  onCacheUpdate,
  placeOrder,
  type Carrier,
  type PaymentMethod,
  type UserProfile,
} from '../api/client';
import { COMPANY } from '../config/company';
import { useCart } from '../context/CartContext';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';
import { readCached, writeCached } from '../utils/localCache';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';
import { normalizeCity, shippingQuote } from '../utils/shipping';

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; detail: string }> = [
  {
    id: 'cash_on_delivery',
    label: 'Paiement à la livraison',
    detail: 'Vous payez en espèces au livreur à la réception du colis.',
  },
  {
    id: 'bank_transfer',
    label: 'Virement bancaire',
    detail: 'L’atelier vous envoie ses coordonnées bancaires ; la commande est préparée dès réception du virement.',
  },
  {
    id: 'wafacash',
    label: 'Transfert Wafacash',
    detail: cashTransferDetail('Wafacash'),
  },
  {
    id: 'cashplus',
    label: 'Transfert Cash Plus',
    detail: cashTransferDetail('Cash Plus'),
  },
];

/** How a Wafacash / Cash Plus transfer works, with the beneficiary when it is configured. */
function cashTransferDetail(network: string) {
  const { beneficiary, phone } = COMPANY.cashTransfer;
  const to = beneficiary
    ? `au nom de ${beneficiary}${phone ? ` (${phone})` : ''}`
    : 'au bénéficiaire que l’atelier vous communique après la commande';
  return `Envoyez le montant dans une agence ${network} ${to}, puis transmettez-nous le code du transfert sur WhatsApp. La commande est préparée dès réception.`;
}

export function Cart() {
  const { items, total, updateQty, removeItem, clear, itemKey } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [carriers, setCarriers] = useState<Carrier[] | null>(null);
  const [carrierId, setCarrierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchCarriers()
      .then((list) => {
        if (!cancelled) setCarriers(list.filter((carrier) => carrier.active));
      })
      .catch(() => {
        if (!cancelled) setCarriers([]);
      });
    void load();
    const unsubscribe = onCacheUpdate(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Every city served by at least one carrier, for the suggestions of the "Ville" field.
  const knownCities = useMemo(() => {
    const byKey = new Map<string, string>();
    (carriers ?? []).forEach((carrier) => carrier.zones.forEach((zone) => zone.cities.forEach((name) => {
      const key = normalizeCity(name);
      if (key && !byKey.has(key)) byKey.set(key, name.trim());
    })));
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [carriers]);

  const quotes = useMemo(
    () => new Map((carriers ?? []).map((carrier) => [carrier.id, shippingQuote(carrier, city, total)])),
    [carriers, city, total],
  );

  // Only one carrier: choose it for the customer.
  useEffect(() => {
    if (carriers?.length === 1 && !carrierId) setCarrierId(carriers[0].id);
  }, [carriers, carrierId]);

  const selectedCarrier = carriers?.find((carrier) => carrier.id === carrierId);
  const selectedQuote = selectedCarrier ? quotes.get(selectedCarrier.id) ?? null : null;
  const needsCarrier = (carriers?.length ?? 0) > 0;
  const shippingPrice = selectedQuote?.price ?? 0;
  const canOrder = !needsCarrier || Boolean(selectedQuote);

  // Signed-in customer: fill the form from the account profile (only fields still empty,
  // so nothing typed is overwritten). Cached copy first, then the server copy.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    const fill = (profile: Partial<UserProfile>, user: User) => {
      if (cancelled) return;
      const fullName = [profile.firstName, profile.lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
      setName((current) => current || fullName || user.displayName || '');
      setEmail((current) => current || profile.email || user.email || '');
      setPhone((current) => current || profile.phone || '');
      setAddress((current) => current || profile.address?.trim() || '');
      setCity((current) => current || profile.city?.trim() || '');
    };
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (!user || user.isAnonymous) return;
      const cacheKey = `profile:${user.uid}`;
      const cachedProfile = readCached<UserProfile>(cacheKey);
      fill(cachedProfile ?? {}, user);
      fetchUserProfile()
        .then((profile) => {
          writeCached(cacheKey, { ...profile, email: profile.email || user.email || '' });
          fill(profile, user);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const onCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!canOrder) {
      setStatus({
        type: 'err',
        text: selectedCarrier
          ? `${selectedCarrier.name} ne livre pas encore à « ${city || '—'} ». Vérifiez la ville ou choisissez un autre transporteur.`
          : 'Choisissez un transporteur.',
      });
      return;
    }
    if (!paymentMethod) {
      setStatus({ type: 'err', text: 'Choisissez un mode de paiement.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await placeOrder({
        items,
        customer: { name, email, phone, address, city, note },
        carrierId: selectedCarrier?.id,
        paymentMethod,
      });
      setStatus({ type: 'ok', text: res.message });
      clear();
      // Contact details stay filled in for a next order; only the note is per order.
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
            <div className="cart-summary">
              <div className="cart-summary-row">
                <span>Sous-total</span>
                <span>{formatPrice(total)}</span>
              </div>
              <div className="cart-summary-row">
                <span>Livraison{selectedCarrier ? ` · ${selectedCarrier.name}` : ''}</span>
                <span>
                  {!needsCarrier
                    ? '—'
                    : selectedQuote
                      ? (selectedQuote.price === 0 ? 'Gratuite' : formatPrice(selectedQuote.price))
                      : 'À calculer'}
                </span>
              </div>
              <div className="cart-summary-row is-total">
                <span>Total</span>
                <span className="product-price">{formatPrice(total + shippingPrice)}</span>
              </div>
            </div>
          </Col>
          <Col lg={5}>
            <Form onSubmit={onCheckout} className="custom-panel checkout-panel">
              <section className="checkout-step" aria-labelledby="checkout-step-1">
                <h2 className="checkout-step-title" id="checkout-step-1">
                  <span className="checkout-step-number" aria-hidden="true">1</span>
                  Informations personnelles
                </h2>
                <Form.Group className="mb-3" controlId="checkout-name">
                  <Form.Label>Nom</Form.Label>
                  <Form.Control autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </Form.Group>
                <Row className="g-3 mb-3">
                  <Col sm={6}>
                    <Form.Group controlId="checkout-email">
                      <Form.Label>E-mail</Form.Label>
                      <Form.Control
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col sm={6}>
                    <Form.Group controlId="checkout-phone">
                      <Form.Label>Téléphone</Form.Label>
                      <Form.Control type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-3" controlId="checkout-address">
                  <Form.Label>Adresse de livraison</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    required
                    maxLength={500}
                    autoComplete="street-address"
                    placeholder="N°, rue, quartier"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </Form.Group>
                <Form.Group controlId="checkout-city">
                  <Form.Label>Ville</Form.Label>
                  <Form.Control
                    required
                    maxLength={120}
                    autoComplete="address-level2"
                    list="checkout-cities"
                    placeholder="Ex. Casablanca"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <datalist id="checkout-cities">
                    {knownCities.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </Form.Group>
              </section>

              <section className="checkout-step" aria-labelledby="checkout-step-2">
                <h2 className="checkout-step-title" id="checkout-step-2">
                  <span className="checkout-step-number" aria-hidden="true">2</span>
                  Transporteur et prix de livraison
                </h2>
                {carriers === null ? (
                  <p className="text-secondary small mb-0">Chargement des transporteurs…</p>
                ) : carriers.length === 0 ? (
                  <p className="text-secondary small mb-0">
                    Aucun transporteur configuré : l’atelier vous contactera pour organiser la livraison.
                  </p>
                ) : (
                  <>
                    <div className="checkout-carriers" role="radiogroup" aria-label="Transporteur">
                      {carriers.map((carrier) => {
                        const quote = quotes.get(carrier.id);
                        const selected = carrier.id === carrierId;
                        return (
                          <label
                            key={carrier.id}
                            className={`checkout-carrier${selected ? ' is-selected' : ''}${city && !quote ? ' is-unavailable' : ''}`}
                          >
                            <Form.Check.Input
                              type="radio"
                              name="carrier"
                              value={carrier.id}
                              checked={selected}
                              onChange={() => setCarrierId(carrier.id)}
                            />
                            <span className="checkout-carrier-body">
                              <span className="checkout-carrier-name">{carrier.name}</span>
                              <span className="checkout-carrier-detail">
                                {quote?.delay || carrier.delay ? `Délai : ${quote?.delay || carrier.delay}` : ''}
                              </span>
                            </span>
                            <span className="checkout-carrier-price">
                              {!city.trim()
                                ? '—'
                                : quote
                                  ? (quote.price === 0 ? 'Gratuite' : formatPrice(quote.price))
                                  : 'Non desservie'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="checkout-shipping-result" aria-live="polite">
                      {!city.trim() ? (
                        'Saisissez votre ville pour connaître le prix de livraison.'
                      ) : !selectedCarrier ? (
                        'Choisissez un transporteur.'
                      ) : selectedQuote ? (
                        <>
                          Livraison à <strong>{city.trim()}</strong> :{' '}
                          <strong>{selectedQuote.price === 0 ? 'gratuite' : formatPrice(selectedQuote.price)}</strong>
                          {selectedQuote.delay ? ` · ${selectedQuote.delay}` : ''}
                          {selectedQuote.free && selectedCarrier.freeFrom !== null && (
                            <> (offerte dès {formatPrice(selectedCarrier.freeFrom)} d’achat)</>
                          )}
                        </>
                      ) : (
                        <>
                          {selectedCarrier.name} ne livre pas encore à « {city.trim()} ». Vérifiez l’orthographe
                          (suggestions dans la liste) ou choisissez un autre transporteur.
                        </>
                      )}
                    </div>
                  </>
                )}
              </section>

              <section className="checkout-step" aria-labelledby="checkout-step-3">
                <h2 className="checkout-step-title" id="checkout-step-3">
                  <span className="checkout-step-number" aria-hidden="true">3</span>
                  Paiement
                </h2>
                <div className="checkout-carriers mb-3" role="radiogroup" aria-label="Mode de paiement">
                  {PAYMENT_METHODS.map((method) => {
                    const selected = paymentMethod === method.id;
                    return (
                      <label key={method.id} className={`checkout-carrier${selected ? ' is-selected' : ''}`}>
                        <Form.Check.Input
                          type="radio"
                          name="payment"
                          value={method.id}
                          checked={selected}
                          onChange={() => setPaymentMethod(method.id)}
                        />
                        <span className="checkout-carrier-body">
                          <span className="checkout-carrier-name">{method.label}</span>
                          <span className="checkout-carrier-detail">{method.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Form.Group className="mb-3" controlId="checkout-note">
                  <Form.Label>
                    Note ou commentaire <span className="fw-normal text-secondary">(facultatif)</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    maxLength={2000}
                    placeholder="Une précision pour l’atelier ou le livreur ?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Form.Group>
                <Button type="submit" className="btn-brand w-100" disabled={loading || !canOrder}>
                  {loading ? 'Envoi…' : `Valider la commande · ${formatPrice(total + shippingPrice)}`}
                </Button>
                {status && (
                  <Alert
                    className={`mt-3 mb-0 ${status.type === 'ok' ? 'alert-soft' : ''}`}
                    variant={status.type === 'ok' ? undefined : 'warning'}
                  >
                    {status.text}
                  </Alert>
                )}
              </section>
            </Form>
          </Col>
        </Row>
      )}
    </Container>
  );
}
