import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Table } from 'react-bootstrap';
import {
  deleteAdminTestimonial,
  fetchAdminTestimonials,
  saveAdminTestimonial,
  type Testimonial,
} from '../api/client';
import { SAMPLE_TESTIMONIALS } from '../config/testimonials';

const TEXT_MAX = 600;

const emptyTestimonial = (order: number): Testimonial => ({
  id: '',
  name: '',
  place: '',
  text: '',
  rating: 5,
  published: false,
  order,
});

function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars" role="img" aria-label={`${rating} étoiles sur 5`}>
      {Array.from({ length: 5 }, (_, star) => (
        <svg key={star} viewBox="0 0 24 24" className={star < rating ? 'is-on' : ''} aria-hidden="true">
          <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" />
        </svg>
      ))}
    </span>
  );
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

/** "Avis clients": the reviews of the home page section "Ils nous recommandent". */
export function AdminTestimonials() {
  const [items, setItems] = useState<Testimonial[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAdminTestimonials()
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Impossible de charger les avis.'));
  }, []);

  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => a.order - b.order), [items]);
  const publishedCount = sorted.filter((item) => item.published).length;
  const nextOrder = sorted.length ? Math.max(...sorted.map((item) => item.order)) + 1 : 1;

  const report = (err: unknown) => setError(err instanceof Error ? err.message : 'Une erreur est survenue.');

  const save = async (testimonial: Testimonial) => {
    const saved = await saveAdminTestimonial(testimonial);
    setItems((current) => {
      const list = current ?? [];
      return list.some((item) => item.id === saved.id)
        ? list.map((item) => (item.id === saved.id ? saved : item))
        : [...list, saved];
    });
    return saved;
  };

  const togglePublished = async (testimonial: Testimonial) => {
    setError('');
    try {
      await save({ ...testimonial, published: !testimonial.published });
      setNotice(testimonial.published ? 'Avis retiré de la page d’accueil.' : 'Avis publié sur la page d’accueil.');
    } catch (err) {
      report(err);
    }
  };

  /** Swaps the display order with the neighbour above (-1) or below (+1). */
  const move = async (index: number, step: -1 | 1) => {
    const other = sorted[index + step];
    const current = sorted[index];
    if (!other || !current) return;
    setError('');
    setBusy(true);
    try {
      await Promise.all([
        save({ ...current, order: other.order }),
        save({ ...other, order: current.order === other.order ? current.order + step : current.order }),
      ]);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (testimonial: Testimonial) => {
    if (!window.confirm(`Supprimer l’avis de « ${testimonial.name} » ?`)) return;
    setError('');
    try {
      await deleteAdminTestimonial(testimonial.id);
      setItems((current) => (current ?? []).filter((item) => item.id !== testimonial.id));
      setNotice('Avis supprimé.');
    } catch (err) {
      report(err);
    }
  };

  const importSamples = async () => {
    setError('');
    setBusy(true);
    try {
      for (const [index, sample] of SAMPLE_TESTIMONIALS.entries()) {
        await save({ ...emptyTestimonial(nextOrder + index), ...sample });
      }
      setNotice('Exemples ajoutés en brouillon : remplacez-les par de vrais avis avant de les publier.');
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>}

      <div className="prod-stats">
        <div className="prod-stat is-all">
          <span className="prod-stat-value">{sorted.length}</span>
          <span className="prod-stat-label">Avis</span>
        </div>
        <div className="prod-stat is-active">
          <span className="prod-stat-value">{publishedCount}</span>
          <span className="prod-stat-label">Publiés</span>
        </div>
        <div className="prod-stat is-inactive">
          <span className="prod-stat-value">{sorted.length - publishedCount}</span>
          <span className="prod-stat-label">Brouillons</span>
        </div>
      </div>

      <div className="prod-toolbar">
        <p className="admin-order-muted mb-0">
          Seuls les avis <strong>publiés</strong> apparaissent sur la page d’accueil, dans l’ordre ci-dessous.
          La section est masquée tant qu’aucun avis n’est publié.
        </p>
        <Button className="btn-brand" onClick={() => setEditing(emptyTestimonial(nextOrder))}>
          + Ajouter un avis
        </Button>
      </div>

      {items === null && !error && <p className="text-secondary">Chargement des avis…</p>}

      {items !== null && sorted.length === 0 && (
        <div className="custom-panel text-center py-5">
          <p className="text-secondary mb-3">Aucun avis pour le moment.</p>
          <div className="d-flex flex-wrap justify-content-center gap-2">
            <Button className="btn-brand" onClick={() => setEditing(emptyTestimonial(nextOrder))}>Ajouter un avis</Button>
            <Button variant="outline-secondary" disabled={busy} onClick={() => void importSamples()}>
              {busy ? 'Ajout…' : 'Ajouter les 8 exemples (brouillons)'}
            </Button>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="table-responsive custom-panel admin-product-panel">
          <Table hover className="align-middle mb-0 admin-product-table testi-table">
            <thead>
              <tr>
                <th className="text-center">Ordre</th>
                <th>Client</th>
                <th>Avis</th>
                <th className="text-center">Publié</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, index) => (
                <tr key={item.id} className={item.published ? '' : 'is-draft'}>
                  <td className="text-center">
                    <div className="testi-order">
                      <Button variant="link" className="admin-icon-btn" title="Monter" aria-label={`Monter l’avis de ${item.name}`} disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                        {icon(<path d="m6 15 6-6 6 6" />)}
                      </Button>
                      <Button variant="link" className="admin-icon-btn" title="Descendre" aria-label={`Descendre l’avis de ${item.name}`} disabled={busy || index === sorted.length - 1} onClick={() => void move(index, 1)}>
                        {icon(<path d="m6 9 6 6 6-6" />)}
                      </Button>
                    </div>
                  </td>
                  <td>
                    <div className="fw-semibold">{item.name}</div>
                    <div className="admin-order-muted">{item.place || '—'}</div>
                  </td>
                  <td className="testi-text-cell">
                    <Stars rating={item.rating} />
                    <div className="testi-text" dir="auto">{item.text}</div>
                  </td>
                  <td className="text-center">
                    <Form.Check
                      type="switch"
                      id={`testi-published-${item.id}`}
                      className="d-inline-flex align-items-center gap-2"
                      label={item.published ? 'Publié' : 'Brouillon'}
                      checked={item.published}
                      onChange={() => void togglePublished(item)}
                    />
                  </td>
                  <td className="text-center">
                    <div className="user-actions">
                      <Button variant="link" className="admin-icon-btn" title="Modifier" aria-label={`Modifier l’avis de ${item.name}`} onClick={() => setEditing(item)}>
                        {icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>)}
                      </Button>
                      <Button variant="link" className="admin-icon-btn admin-icon-btn-danger" title="Supprimer" aria-label={`Supprimer l’avis de ${item.name}`} onClick={() => void remove(item)}>
                        {icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>)}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {editing && (
        <TestimonialModal
          testimonial={editing}
          onHide={() => setEditing(null)}
          onSave={async (testimonial) => {
            await save(testimonial);
            setNotice(testimonial.id ? 'Avis mis à jour.' : 'Avis ajouté.');
          }}
        />
      )}
    </section>
  );
}

function TestimonialModal({ testimonial, onHide, onSave }: {
  testimonial: Testimonial;
  onHide: () => void;
  onSave: (testimonial: Testimonial) => Promise<void>;
}) {
  const [form, setForm] = useState(testimonial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Testimonial>(key: K, value: Testimonial[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={onHide} centered size="lg" className="user-modal">
      <Form onSubmit={onSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{testimonial.id ? 'Modifier l’avis' : 'Ajouter un avis'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Row className="g-3">
            <Col sm={6}>
              <Form.Label htmlFor="testi-name">Nom du client</Form.Label>
              <Form.Control id="testi-name" required maxLength={80} placeholder="Ex. : Yassine B." value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Col>
            <Col sm={6}>
              <Form.Label htmlFor="testi-place">Ville ou profession</Form.Label>
              <Form.Control id="testi-place" maxLength={80} placeholder="Ex. : Commerçant, Salé" value={form.place} onChange={(e) => set('place', e.target.value)} />
            </Col>
            <Col xs={12}>
              <Form.Label htmlFor="testi-text">Avis</Form.Label>
              <Form.Control
                id="testi-text"
                as="textarea"
                rows={4}
                required
                dir="auto"
                maxLength={TEXT_MAX}
                placeholder="En français, en darija ou en arabe…"
                value={form.text}
                onChange={(e) => set('text', e.target.value)}
              />
              <Form.Text>{form.text.length} / {TEXT_MAX} caractères</Form.Text>
            </Col>
            <Col sm={6}>
              <Form.Label as="div" id="testi-rating-label">Note</Form.Label>
              <div className="testi-rating" role="radiogroup" aria-labelledby="testi-rating-label">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.rating === value}
                    aria-label={`${value} étoile${value > 1 ? 's' : ''}`}
                    className={value <= form.rating ? 'is-on' : ''}
                    onClick={() => set('rating', value)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" />
                    </svg>
                  </button>
                ))}
              </div>
            </Col>
            <Col sm={6} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                id="testi-published"
                label="Publier sur la page d’accueil"
                checked={form.published}
                onChange={(e) => set('published', e.target.checked)}
              />
            </Col>
          </Row>
          <p className="admin-order-muted mt-3 mb-0">
            Publiez uniquement de vrais avis, avec l’accord du client.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide}>Annuler</Button>
          <Button type="submit" className="btn-brand" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
