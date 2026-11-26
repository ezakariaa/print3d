import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, InputGroup, Modal, Row, Table } from 'react-bootstrap';
import { deleteAdminService, fetchAdminServices, saveAdminService } from '../api/client';
import type { Service } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { slugify } from '../utils/slugify';

/** Service type (stored in "icon"): a category shown as a badge. */
const SERVICE_TYPES = [
  { value: 'fdm', label: 'Impression FDM' },
  { value: 'resin', label: 'Impression résine' },
  { value: 'model', label: 'Modélisation 3D' },
  { value: 'series', label: 'Petites séries' },
  { value: 'other', label: 'Autre' },
];

const UNITS = ['pièce', 'heure', 'lot', 'projet', 'cm³', 'gramme'];

const emptyService = (): Service => ({
  id: '',
  title: '',
  summary: '',
  details: [''],
  fromPrice: 0,
  unit: 'pièce',
  icon: 'fdm',
});

const typeLabel = (icon: string) => SERVICE_TYPES.find((type) => type.value === icon)?.label ?? icon;

/** "Gestion des services": table of the services shown on the public page, edited in a window. */
export function AdminServices({
  loadServices = fetchAdminServices,
}: {
  /** Where the list comes from (the admin API by default). */
  loadServices?: () => Promise<Service[]>;
} = {}) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Service | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setServices(await loadServices());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setDraft(emptyService());
    setEditingId(null);
    setModalError('');
  };

  const openEdit = (service: Service) => {
    setDraft({ ...service, details: service.details.length ? [...service.details] : [''] });
    setEditingId(service.id);
    setModalError('');
  };

  const close = () => setDraft(null);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const id = editingId ?? slugify(draft.title);
    if (!id) {
      setModalError('Le nom doit contenir au moins une lettre ou un chiffre.');
      return;
    }
    if (!editingId && services.some((service) => service.id === id)) {
      setModalError('Un service porte déjà ce nom. Choisissez un autre nom.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      await saveAdminService({
        ...draft,
        id,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        unit: draft.unit.trim(),
        details: draft.details.map((detail) => detail.trim()).filter(Boolean),
      }, editingId === null);
      setNotice(editingId ? 'Service mis à jour.' : 'Service ajouté.');
      close();
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Impossible d’enregistrer ce service.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (service: Service) => {
    if (!window.confirm(`Retirer « ${service.title} » de la page Services ?`)) return;
    setError('');
    try {
      await deleteAdminService(service.id);
      setServices((current) => current.filter((item) => item.id !== service.id));
      setNotice('Service retiré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de retirer ce service.');
    }
  };

  const setDetail = (index: number, value: string) =>
    draft && setDraft({ ...draft, details: draft.details.map((detail, i) => (i === index ? value : detail)) });

  return (
    <div className="admin-services">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
        <div>
          <h2 className="h4 mb-1">Services publiés</h2>
          <p className="text-secondary small mb-0">
            {services.length} service{services.length > 1 ? 's' : ''} affiché{services.length > 1 ? 's' : ''} sur la page Services.
          </p>
        </div>
        <Button className="btn-brand" onClick={openNew}>+ Ajouter un service</Button>
      </div>

      {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>}

      <div className="table-responsive custom-panel admin-product-panel">
        <Table hover className="align-middle mb-0 admin-product-table admin-services-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Type</th>
              <th>Points inclus</th>
              <th className="text-end">À partir de</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && services.length === 0 && (
              <tr><td colSpan={5} className="text-secondary">Chargement des services…</td></tr>
            )}
            {!loading && services.length === 0 && (
              <tr><td colSpan={5} className="text-secondary">Aucun service publié. Ajoutez-en un.</td></tr>
            )}
            {services.map((service) => (
              <tr key={service.id}>
                <td>
                  <div className="fw-semibold">{service.title}</div>
                  <div className="admin-service-summary">{service.summary}</div>
                </td>
                <td>
                  <span className={`admin-service-type is-${service.icon}`}>{typeLabel(service.icon)}</span>
                </td>
                <td>
                  {service.details.length > 0 ? (
                    <ul className="admin-service-points">
                      {service.details.slice(0, 3).map((detail) => <li key={detail}>{detail}</li>)}
                      {service.details.length > 3 && (
                        <li className="is-more">+ {service.details.length - 3} autre{service.details.length - 3 > 1 ? 's' : ''}</li>
                      )}
                    </ul>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </td>
                <td className="text-end text-nowrap">
                  <span className="admin-service-price">{formatPrice(service.fromPrice, 0)}</span>
                  <div className="text-secondary small">/ {service.unit}</div>
                </td>
                <td className="text-center text-nowrap">
                  <Button
                    variant="link"
                    className="admin-icon-btn"
                    title="Modifier"
                    aria-label={`Modifier le service ${service.title}`}
                    onClick={() => openEdit(service)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </Button>
                  <Button
                    variant="link"
                    className="admin-icon-btn admin-icon-btn-danger"
                    title="Retirer"
                    aria-label={`Retirer le service ${service.title}`}
                    onClick={() => void onDelete(service)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal show={draft !== null} onHide={close} size="lg" centered scrollable className="admin-service-modal">
        {draft && (
          <Form onSubmit={onSave} className="d-flex flex-column overflow-hidden">
            <Modal.Header closeButton>
              <Modal.Title>{editingId ? 'Modifier le service' : 'Ajouter un service'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {modalError && <Alert variant="warning" dismissible onClose={() => setModalError('')}>{modalError}</Alert>}
              <Row className="g-3">
                <Col md={8}>
                  <Form.Group controlId="service-title">
                    <Form.Label>Nom du service</Form.Label>
                    <Form.Control
                      required
                      maxLength={120}
                      placeholder="Ex. Impression résine"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                    <Form.Text>Identifiant : {editingId ?? (slugify(draft.title) || '—')}</Form.Text>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group controlId="service-type">
                    <Form.Label>Type</Form.Label>
                    <Form.Select value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })}>
                      {SERVICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      {!SERVICE_TYPES.some((type) => type.value === draft.icon) && <option value={draft.icon}>{draft.icon}</option>}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group controlId="service-summary">
                    <Form.Label>Description courte</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      required
                      maxLength={300}
                      placeholder="Ce que le client obtient, en une ou deux phrases."
                      value={draft.summary}
                      onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="service-price">
                    <Form.Label>Prix à partir de</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type="number"
                        min={0}
                        step="0.01"
                        required
                        value={draft.fromPrice}
                        onChange={(e) => setDraft({ ...draft, fromPrice: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <InputGroup.Text>DH</InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="service-unit">
                    <Form.Label>Par</Form.Label>
                    <Form.Control
                      required
                      maxLength={40}
                      list="service-units"
                      placeholder="pièce, heure, lot…"
                      value={draft.unit}
                      onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    />
                    <datalist id="service-units">
                      {UNITS.map((unit) => <option key={unit} value={unit} />)}
                    </datalist>
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Form.Label className="mb-0">Points inclus</Form.Label>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={draft.details.length >= 12}
                      onClick={() => setDraft({ ...draft, details: [...draft.details, ''] })}
                    >
                      + Ajouter un point
                    </Button>
                  </div>
                  <div className="d-grid gap-2">
                    {draft.details.map((detail, index) => (
                      <div className="d-flex gap-2" key={index}>
                        <Form.Control
                          maxLength={160}
                          aria-label={`Point ${index + 1}`}
                          placeholder={`Point ${index + 1} (ex. Devis sous 24 h)`}
                          value={detail}
                          onChange={(e) => setDetail(index, e.target.value)}
                        />
                        <Button
                          variant="link"
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Retirer ce point"
                          aria-label={`Retirer le point ${index + 1}`}
                          onClick={() => setDraft({ ...draft, details: draft.details.filter((_, i) => i !== index) })}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Form.Text>Affichés en liste sur la page Services. Les lignes vides sont ignorées.</Form.Text>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={close}>Annuler</Button>
              <Button type="submit" className="btn-brand" disabled={saving}>
                {saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Ajouter le service'}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
