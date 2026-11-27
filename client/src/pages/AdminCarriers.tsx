import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import {
  deleteAdminCarrier,
  fetchAdminCarriers,
  saveAdminCarrier,
  type Carrier,
  type CarrierZone,
} from '../api/client';
import { formatPrice } from '../utils/formatPrice';
import { shippingQuote } from '../utils/shipping';
import { slugify } from '../utils/slugify';

/** Zone being edited: the cities are kept as free text ("Rabat, Salé, Témara"). */
interface ZoneDraft {
  id: string;
  citiesText: string;
  price: number;
  delay: string;
}

type CarrierDraft = Omit<Carrier, 'zones'> & { zones: ZoneDraft[] };

const emptyZone = (): ZoneDraft => ({ id: crypto.randomUUID(), citiesText: '', price: 0, delay: '' });

const emptyCarrier = (): CarrierDraft => ({
  id: '',
  name: '',
  description: '',
  delay: '',
  freeFrom: null,
  zones: [emptyZone()],
  trackingUrl: '',
  active: true,
});

/** Splits "Rabat, Salé\nTémara" into unique, trimmed city names. */
function parseCities(text: string): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const city = raw.trim().replace(/\s+/g, ' ');
    if (city && !seen.has(city.toLowerCase())) {
      seen.add(city.toLowerCase());
      cities.push(city);
    }
  }
  return cities;
}

function toDraft(carrier: Carrier): CarrierDraft {
  return {
    ...carrier,
    zones: carrier.zones.length
      ? carrier.zones.map((zone) => ({ id: zone.id, citiesText: zone.cities.join(', '), price: zone.price, delay: zone.delay }))
      : [emptyZone()],
  };
}

function priceLabel(price: number) {
  return price === 0 ? 'Gratuit' : formatPrice(price, 0);
}

function countCities(carrier: Carrier) {
  return carrier.zones.reduce((sum, zone) => sum + zone.cities.length, 0);
}

export function AdminCarriers({
  fetchCarriers = fetchAdminCarriers,
}: {
  /** Where the list comes from (the admin API by default). */
  fetchCarriers?: () => Promise<Carrier[]>;
} = {}) {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [draft, setDraft] = useState<CarrierDraft>(emptyCarrier);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testCity, setTestCity] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [formInfo, setFormInfo] = useState('');
  const filterTerm = zoneFilter.trim().toLowerCase();
  const visibleZones = filterTerm
    ? draft.zones.filter((zone) => zone.citiesText.toLowerCase().includes(filterTerm))
    : draft.zones;

  // Every city served, for the "Tester une ville" suggestions.
  const allCities = [...new Set(carriers.flatMap((carrier) => carrier.zones.flatMap((zone) => zone.cities)))]
    .sort((a, b) => a.localeCompare(b, 'fr'));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setCarriers(await fetchCarriers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les transporteurs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setDraft(emptyCarrier());
    setEditingId(null);
    setZoneFilter('');
    setFormError('');
    setFormInfo('');
  };

  const openNew = () => {
    setDraft(emptyCarrier());
    setEditingId(null);
    setZoneFilter('');
    setFormError('');
    setNotice('');
    setShowModal(true);
  };

  const onEdit = (carrier: Carrier) => {
    setDraft(toDraft(carrier));
    setEditingId(carrier.id);
    setZoneFilter('');
    setFormError('');
    setNotice('');
    setShowModal(true);
  };

  // ----- Zones -----
  const updateZone = (id: string, changes: Partial<ZoneDraft>) => {
    setDraft((current) => ({
      ...current,
      zones: current.zones.map((zone) => (zone.id === id ? { ...zone, ...changes } : zone)),
    }));
  };

  const addZone = () => {
    setZoneFilter('');
    setDraft((current) => ({ ...current, zones: [emptyZone(), ...current.zones] }));
  };

  const removeZone = (id: string) => {
    setDraft((current) => ({ ...current, zones: current.zones.filter((zone) => zone.id !== id) }));
  };

  /** Merges zones that share the same price and delay into a single zone. */
  const mergeSamePrice = () => {
    setDraft((current) => {
      const groups = new Map<string, ZoneDraft>();
      for (const zone of current.zones) {
        const key = `${zone.price}|${zone.delay.trim().toLowerCase()}`;
        const existing = groups.get(key);
        if (existing) {
          existing.citiesText = parseCities(`${existing.citiesText}, ${zone.citiesText}`).join(', ');
        } else {
          groups.set(key, { ...zone, citiesText: parseCities(zone.citiesText).join(', ') });
        }
      }
      const zones = [...groups.values()];
      setFormInfo(`${current.zones.length - zones.length} zone(s) fusionnée(s). Pensez à enregistrer.`);
      return { ...current, zones };
    });
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    const isNew = editingId === null;
    const zones: CarrierZone[] = draft.zones
      .map((zone) => ({ id: zone.id, cities: parseCities(zone.citiesText), price: zone.price, delay: zone.delay.trim() }))
      .filter((zone) => zone.cities.length > 0);
    const carrier: Carrier = { ...draft, id: isNew ? slugify(draft.name) : draft.id, zones };

    if (!carrier.id) {
      setFormError('Indiquez un nom de transporteur valide.');
      return;
    }
    if (zones.length === 0) {
      setFormError('Ajoutez au moins une zone avec ses villes et son prix.');
      return;
    }
    const seen = new Set<string>();
    for (const zone of zones) {
      for (const city of zone.cities) {
        if (seen.has(city.toLowerCase())) {
          setFormError(`« ${city} » figure dans deux zones. Gardez-la dans une seule zone.`);
          return;
        }
        seen.add(city.toLowerCase());
      }
    }

    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      await saveAdminCarrier(carrier, isNew);
      setNotice(isNew ? `Transporteur « ${carrier.name} » ajouté.` : `Transporteur « ${carrier.name} » mis à jour.`);
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (carrier: Carrier) => {
    setError('');
    try {
      await saveAdminCarrier({ ...carrier, active: !carrier.active }, false);
      setCarriers((list) => list.map((c) => (c.id === carrier.id ? { ...c, active: !c.active } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    }
  };

  const onDelete = async (carrier: Carrier) => {
    if (!window.confirm(`Supprimer définitivement le transporteur « ${carrier.name} » ?`)) return;
    setError('');
    try {
      await deleteAdminCarrier(carrier.id);
      setCarriers((list) => list.filter((c) => c.id !== carrier.id));
            setNotice(`Transporteur « ${carrier.name} » supprimé.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  return (
    <>
      {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
      <div className="car-toolbar">
        <div className="car-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <Form.Control
            type="search"
            list="carrier-cities"
            placeholder="Tester une ville : prix et délai par transporteur…"
            aria-label="Tester une ville"
            value={testCity}
            onChange={(event) => setTestCity(event.target.value)}
          />
          <datalist id="carrier-cities">
            {allCities.map((city) => <option key={city} value={city} />)}
          </datalist>
        </div>
        <button
          type="button"
          className={`admin-header-btn${loading ? ' is-loading' : ''}`}
          onClick={() => void load()}
          disabled={loading}
          title="Actualiser les transporteurs"
          aria-label="Actualiser les transporteurs"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>
        <Button className="btn-brand" onClick={openNew}>+ Nouveau transporteur</Button>
      </div>

      {testCity.trim() && carriers.length > 0 && (
        <div className="car-test" aria-live="polite">
          <span className="car-test-title">Livraison à <strong>{testCity.trim()}</strong></span>
          <ul>
            {carriers.map((carrier) => {
              const quote = shippingQuote(carrier, testCity, 0);
              return (
                <li key={carrier.id} className={quote ? '' : 'is-none'}>
                  <span>{carrier.name}{!carrier.active && <small> (inactif)</small>}</span>
                  <strong>{quote ? `${priceLabel(quote.price)}${quote.delay ? ` · ${quote.delay}` : ''}` : 'Non desservie'}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading && carriers.length === 0 && <p className="text-secondary">Chargement…</p>}
      {!loading && carriers.length === 0 && (
        <div className="custom-panel text-secondary text-center py-5">
          Aucun transporteur pour le moment. Cliquez sur « Nouveau transporteur » pour en ajouter un.
        </div>
      )}

      <div className="car-list">
        {carriers.map((carrier) => {
          const expanded = expandedId === carrier.id;
          const prices = carrier.zones.map((zone) => zone.price);
          const minPrice = prices.length ? Math.min(...prices) : 0;
          const maxPrice = prices.length ? Math.max(...prices) : 0;
          return (
            <article className={`car-card${carrier.active ? '' : ' is-inactive'}`} key={carrier.id}>
              <header className="car-head">
                <span className="car-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" />
                    <circle cx="6" cy="18" r="2" />
                    <circle cx="17" cy="18" r="2" />
                  </svg>
                </span>
                <div className="car-title">
                  <h3>{carrier.name}</h3>
                  {carrier.description && <p>{carrier.description}</p>}
                </div>
                <div className="car-actions">
                  <Form.Check
                    type="switch"
                    id={`carrier-active-${carrier.id}`}
                    className="car-switch"
                    label={carrier.active ? 'Actif' : 'Inactif'}
                    checked={carrier.active}
                    onChange={() => void onToggle(carrier)}
                  />
                  <Button
                    variant="link"
                    className="admin-icon-btn"
                    title="Modifier"
                    aria-label={`Modifier ${carrier.name}`}
                    onClick={() => onEdit(carrier)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </Button>
                  <Button
                    variant="link"
                    className="admin-icon-btn admin-icon-btn-danger"
                    title="Supprimer"
                    aria-label={`Supprimer ${carrier.name}`}
                    onClick={() => void onDelete(carrier)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </Button>
                </div>
              </header>

              <dl className="car-facts">
                <div><dt>Tarifs</dt><dd>{carrier.zones.length ? (minPrice === maxPrice ? priceLabel(minPrice) : `${formatPrice(minPrice, 0)} – ${formatPrice(maxPrice, 0)}`) : '—'}</dd></div>
                <div><dt>Zones</dt><dd>{carrier.zones.length}</dd></div>
                <div><dt>Villes</dt><dd>{countCities(carrier)}</dd></div>
                <div><dt>Délai</dt><dd>{carrier.delay || '—'}</dd></div>
                <div><dt>Gratuite dès</dt><dd>{carrier.freeFrom !== null ? formatPrice(carrier.freeFrom, 0) : '—'}</dd></div>
              </dl>

              {carrier.zones.length === 0 ? (
                <p className="car-warning">Aucune zone : ce transporteur ne peut pas être proposé aux clients.</p>
              ) : (
                <ul className="car-zones">
                  {[...carrier.zones].sort((a, b) => a.price - b.price).map((zone) => {
                    const shown = expanded ? zone.cities : zone.cities.slice(0, 8);
                    const more = zone.cities.length - shown.length;
                    return (
                      <li key={zone.id} className="car-zone">
                        <div className="car-zone-head">
                          <span className="car-zone-price">{priceLabel(zone.price)}</span>
                          <span className="car-zone-meta">
                            {zone.delay || carrier.delay || 'délai non précisé'} · {zone.cities.length} ville{zone.cities.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="car-cities">
                          {shown.map((city) => <span key={city}>{city}</span>)}
                          {more > 0 && <span className="is-more">+{more}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {carrier.zones.some((zone) => zone.cities.length > 8) && (
                <button type="button" className="shop-reset car-expand" onClick={() => setExpandedId(expanded ? null : carrier.id)}>
                  {expanded ? 'Réduire' : 'Voir toutes les villes'}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <Modal show={showModal} onHide={closeModal} size="lg" centered scrollable backdrop="static">
        {/* display: contents keeps header/body/footer as direct children so the body scrolls. */}
        <Form onSubmit={onSave} style={{ display: 'contents' }}>
          <Modal.Header closeButton>
            <Modal.Title className="h5">
              {editingId ? `Modifier « ${draft.name} »` : 'Nouveau transporteur'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {formError && <Alert variant="warning" dismissible onClose={() => setFormError('')}>{formError}</Alert>}
            {formInfo && <Alert className="alert-soft" dismissible onClose={() => setFormInfo('')}>{formInfo}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Nom du transporteur</Form.Label>
              <Form.Control
                required
                maxLength={120}
                value={draft.name}
                placeholder="Ex. Amana, CTM Messagerie, Livreur local…"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              {!editingId && draft.name && (
                <Form.Text>Identifiant : {slugify(draft.name) || '—'}</Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={1000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col sm={6}>
                <Form.Label>Délai par défaut</Form.Label>
                <Form.Control
                  maxLength={120}
                  value={draft.delay}
                  placeholder="Ex. 24 à 48 h"
                  onChange={(event) => setDraft({ ...draft, delay: event.target.value })}
                />
              </Col>
              <Col sm={6}>
                <Form.Label>Livraison gratuite dès (DH)</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Jamais"
                  value={draft.freeFrom ?? ''}
                  onChange={(event) => setDraft({
                    ...draft,
                    freeFrom: event.target.value === '' ? null : Number(event.target.value),
                  })}
                />
              </Col>
            </Row>

            <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
              <Form.Label className="mb-0">
                Zones tarifaires
                <span className="text-secondary small ms-2">
                  ({draft.zones.length} zone{draft.zones.length > 1 ? 's' : ''},{' '}
                  {draft.zones.reduce((sum, zone) => sum + parseCities(zone.citiesText).length, 0)} villes)
                </span>
              </Form.Label>
              <div className="d-flex gap-2">
                {draft.zones.length > 1 && (
                  <Button size="sm" variant="outline-secondary" type="button" onClick={mergeSamePrice}
                    title="Fusionne les zones qui ont le même prix et le même délai">
                    Regrouper par prix
                  </Button>
                )}
                <Button size="sm" variant="outline-secondary" type="button" onClick={addZone}>
                  + Ajouter une zone
                </Button>
              </div>
            </div>
            {draft.zones.length > 4 && (
              <Form.Control
                size="sm"
                type="search"
                className="mb-2"
                placeholder="Rechercher une ville…"
                value={zoneFilter}
                onChange={(event) => setZoneFilter(event.target.value)}
              />
            )}
            <div className="d-grid gap-2 mb-1">
              {visibleZones.map((zone, index) => {
                const cityCount = parseCities(zone.citiesText).length;
                return (
                  <div key={zone.id} className="border rounded p-2">
                    <Form.Group className="mb-2">
                      <Form.Label className="small mb-1">
                        Villes (séparées par des virgules)
                        <span className="text-secondary ms-1">· {cityCount}</span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        size="sm"
                        rows={cityCount > 15 ? 4 : 2}
                        value={zone.citiesText}
                        placeholder="Ex. Rabat, Salé, Témara, Kénitra"
                        aria-label={`Villes de la zone ${index + 1}`}
                        onChange={(event) => updateZone(zone.id, { citiesText: event.target.value })}
                      />
                    </Form.Group>
                    <div className="d-flex gap-2 align-items-end">
                      <Form.Group style={{ width: '8rem' }}>
                        <Form.Label className="small mb-1">Prix (DH)</Form.Label>
                        <Form.Control
                          size="sm"
                          type="number"
                          min="0"
                          step="0.01"
                          required={cityCount > 0}
                          value={zone.price}
                          aria-label={`Prix de la zone ${index + 1}`}
                          onChange={(event) => updateZone(zone.id, { price: Number(event.target.value) })}
                        />
                      </Form.Group>
                      <Form.Group className="flex-grow-1">
                        <Form.Label className="small mb-1">Délai</Form.Label>
                        <Form.Control
                          size="sm"
                          maxLength={120}
                          value={zone.delay}
                          placeholder={draft.delay || 'Par défaut'}
                          aria-label={`Délai de la zone ${index + 1}`}
                          onChange={(event) => updateZone(zone.id, { delay: event.target.value })}
                        />
                      </Form.Group>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        type="button"
                        title="Supprimer cette zone"
                        aria-label={`Supprimer la zone ${index + 1}`}
                        onClick={() => removeZone(zone.id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                );
              })}
              {visibleZones.length === 0 && (
                <div className="text-secondary small">
                  {filterTerm ? 'Aucune zone ne contient cette ville.' : 'Aucune zone. Cliquez sur « Ajouter une zone ».'}
                </div>
              )}
            </div>
            <Form.Text className="d-block mb-3">
              Mettez dans une même zone toutes les villes qui ont le même prix. Une ville ne peut être que dans une seule zone.
              Laissez le délai vide pour utiliser le délai par défaut.
            </Form.Text>

            <Form.Group className="mb-3">
              <Form.Label>Lien de suivi des colis</Form.Label>
              <Form.Control
                maxLength={500}
                value={draft.trackingUrl}
                placeholder="https://exemple.ma/suivi?colis={tracking}"
                onChange={(event) => setDraft({ ...draft, trackingUrl: event.target.value })}
              />
              <Form.Text>{'{tracking}'} sera remplacé par le numéro du colis.</Form.Text>
            </Form.Group>
            <Form.Check
              type="switch"
              id="carrier-active"
              className="mb-3"
              label="Proposé aux clients"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" type="button" onClick={closeModal}>Annuler</Button>
            <Button type="submit" className="btn-brand" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
