import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { fetchServices, sendQuote } from '../api/client';
import { WhatsAppIcon } from '../components/WhatsAppButton';
import { COMPANY } from '../config/company';
import { getFirebaseAuth, getUploadUser, isFirebaseConfigured, onAuthStateChanged, uploadQuoteFile } from '../firebase';
import type { Service } from '../types';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const FILE_PATTERN = /\.(stl|obj)$/i;

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function ContactCard({ icon, title, children, href, tone }: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  href?: string;
  tone?: 'whatsapp';
}) {
  const content = (
    <>
      <span className="contact-card-icon" aria-hidden="true">{icon}</span>
      <span>
        <span className="contact-card-title">{title}</span>
        <span className="contact-card-text">{children}</span>
      </span>
    </>
  );
  const className = `contact-card${tone ? ` is-${tone}` : ''}${href ? ' is-link' : ''}`;
  return href ? (
    <a className={className} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function Contact() {
  const [params] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchServices().then(setServices).catch(() => setServices([]));
  }, []);

  useEffect(() => {
    const s = params.get('service');
    if (s) setServiceId(s);
  }, [params]);

  // Signed-in visitor: name and e-mail filled in (only if still empty).
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (!user || user.isAnonymous) return;
      setName((current) => current || user.displayName || '');
      setEmail((current) => current || user.email || '');
    });
  }, []);

  const pickFile = (candidate: File | undefined | null) => {
    setFileError('');
    if (!candidate) return;
    if (!FILE_PATTERN.test(candidate.name)) {
      setFileError('Formats acceptés : STL ou OBJ.');
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setFileError('Le fichier dépasse 50 Mo.');
      return;
    }
    setFile(candidate);
  };

  const clearFile = () => {
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!loading) pickFile(event.dataTransfer.files?.[0]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const user = await getUploadUser();
      const filePath = file
        ? await (async () => {
            setUploadProgress(0);
            return uploadQuoteFile(file, user.uid, setUploadProgress);
          })()
        : undefined;
      const serviceTitle = services.find((service) => service.id === serviceId)?.title;
      const res = await sendQuote({
        name,
        email,
        message: [
          subject && `Sujet : ${subject}`,
          serviceTitle && `Service : ${serviceTitle}`,
          message,
        ].filter(Boolean).join('\n\n'),
        filePath,
        fileName: file?.name,
        fileSize: file?.size,
        token: await user.getIdToken(),
      });
      setStatus({ type: 'ok', text: res.message });
      setSubject('');
      setMessage('');
      clearFile();
      setUploadProgress(null);
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setLoading(false);
    }
  };

  const whatsapp = COMPANY.whatsapp
    ? `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(COMPANY.whatsappMessage)}`
    : '';
  const whatsappLabel = COMPANY.whatsapp
    ? `+${COMPANY.whatsapp.slice(0, 3)} ${COMPANY.whatsapp.slice(3, 6)} ${COMPANY.whatsapp.slice(6, 9)} ${COMPANY.whatsapp.slice(9)}`
    : '';

  return (
    <Container className="page-hero pb-5">
      <Row className="gy-5 gx-lg-5">
        <Col lg={5}>
          <span className="ways-kicker">Parlons de votre projet</span>
          <h1>Contact &amp; devis</h1>
          <p className="section-lead">
            Fichier STL, croquis ou simple idée : décrivez votre projet, nous vous répondons sous 24 h ouvrées.
          </p>

          <div className="contact-cards">
            {whatsapp && (
              <ContactCard
                tone="whatsapp"
                href={whatsapp}
                title="WhatsApp"
                icon={<WhatsAppIcon />}
              >
                {whatsappLabel} · réponse rapide
              </ContactCard>
            )}
            <ContactCard
              href={`mailto:${COMPANY.email}`}
              title="E-mail"
              icon={<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>}
            >
              {COMPANY.email}
            </ContactCard>
            <ContactCard
              title="Horaires de l’atelier"
              icon={<svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
            >
              Du lundi au vendredi, 9 h – 18 h
            </ContactCard>
            <ContactCard
              title="Délai de réponse"
              icon={<svg {...iconProps}><path d="M4 12.5 9 17.5 20 6.5" /></svg>}
            >
              Sous 24 h ouvrées, avec un devis adapté
            </ContactCard>
          </div>
        </Col>

        <Col lg={7}>
          <Form onSubmit={onSubmit} className="custom-panel contact-form">
            <h2 className="h4 mb-1">Demande de devis</h2>
            <p className="text-secondary small mb-4">Les champs marqués * sont obligatoires.</p>

            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="contact-name">
                  <Form.Label>Nom *</Form.Label>
                  <Form.Control autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="contact-email">
                  <Form.Label>E-mail *</Form.Label>
                  <Form.Control
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>

              {services.length > 0 && (
                <Col xs={12}>
                  <span className="form-label d-block">Service concerné</span>
                  <div className="contact-services" role="radiogroup" aria-label="Service concerné">
                    {[{ id: '', title: 'Je ne sais pas encore' }, ...services].map((service) => (
                      <button
                        key={service.id || 'none'}
                        type="button"
                        role="radio"
                        aria-checked={serviceId === service.id}
                        className={`contact-service${serviceId === service.id ? ' is-active' : ''}`}
                        onClick={() => setServiceId(service.id)}
                      >
                        {service.title}
                      </button>
                    ))}
                  </div>
                </Col>
              )}

              <Col xs={12}>
                <Form.Group controlId="contact-subject">
                  <Form.Label>Sujet</Form.Label>
                  <Form.Control
                    placeholder="Ex. Support de casque, 3 pièces en PETG"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group controlId="contact-message">
                  <Form.Label>Votre projet *</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    placeholder="Dimensions, matière, couleur, quantité, délai souhaité…"
                  />
                </Form.Group>
              </Col>

              <Col xs={12}>
                <span className="form-label d-block">Fichier 3D (facultatif)</span>
                {file ? (
                  <div className="contact-file">
                    <span className="contact-file-icon" aria-hidden="true">
                      <svg {...iconProps}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>
                    </span>
                    <span className="contact-file-name">
                      {file.name}
                      <small>{formatSize(file.size)}</small>
                    </span>
                    {!loading && (
                      <button type="button" className="contact-file-remove" onClick={clearFile} aria-label="Retirer le fichier">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <label
                    className={`contact-drop${dragging ? ' is-dragging' : ''}`}
                    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="visually-hidden"
                      accept=".stl,.obj,model/stl,application/sla"
                      disabled={loading}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => pickFile(event.currentTarget.files?.[0])}
                    />
                    <svg {...iconProps} aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                    <span><strong>Glissez votre fichier ici</strong> ou cliquez pour le choisir</span>
                    <small>STL ou OBJ · 50 Mo maximum · pour un devis plus précis</small>
                  </label>
                )}
                {fileError && <div className="text-danger small mt-2">{fileError}</div>}
              </Col>
            </Row>

            <Button type="submit" className="btn-brand w-100 mt-4" disabled={loading}>
              {loading && uploadProgress !== null
                ? `Envoi du fichier… ${uploadProgress} %`
                : loading
                  ? 'Envoi…'
                  : 'Envoyer ma demande'}
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
    </Container>
  );
}
