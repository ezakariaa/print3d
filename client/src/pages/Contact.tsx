import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { fetchServices, sendQuote } from '../api/client';
import { getUploadUser, uploadQuoteFile } from '../firebase';
import type { Service } from '../types';

export function Contact() {
  const [params] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
      const res = await sendQuote({
        name,
        email,
        message: [subject, serviceId, message].filter(Boolean).join('\n\n'),
        filePath,
        fileName: file?.name,
        fileSize: file?.size,
        token: await user.getIdToken(),
      });
      setStatus({ type: 'ok', text: res.message });
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadProgress(null);
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="page-hero pb-5">
      <Row className="gy-4">
        <Col lg={5}>
          <h1>Contact & devis</h1>
          <p className="section-lead">
            Fichier STL, croquis ou simple idée : décrivez votre projet. Réponse sous 24 h ouvrées.
          </p>
          <p className="small text-secondary mb-1">contact@3alam3d.local</p>
          <p className="small text-secondary">Atelier · Lun–Ven 9h–18h</p>
        </Col>
        <Col lg={7}>
          <Form onSubmit={onSubmit} className="custom-panel">
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Nom</Form.Label>
                <Form.Control value={name} onChange={(e) => setName(e.target.value)} required />
              </Col>
              <Col md={6}>
                <Form.Label>E-mail</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Col>
              <Col md={6}>
                <Form.Label>Sujet</Form.Label>
                <Form.Control value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Service</Form.Label>
                <Form.Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  <option value="">— Optionnel —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={12}>
                <Form.Label>Message</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  placeholder="Dimensions, matière, quantité, délai…"
                />
              </Col>
              <Col xs={12}>
                <Form.Label>Fichier 3D pour le devis (facultatif)</Form.Label>
                <Form.Control
                  ref={fileInputRef}
                  type="file"
                  accept=".stl,.obj,model/stl,application/sla"
                  onChange={(event) =>
                    setFile(
                      event.currentTarget instanceof HTMLInputElement
                        ? event.currentTarget.files?.[0] ?? null
                        : null,
                    )
                  }
                  disabled={loading}
                />
                <div className="form-text text-secondary">
                  Formats STL ou OBJ, 50 Mo maximum. Joins ton modèle pour recevoir un devis adapté.
                </div>
              </Col>
            </Row>
            <Button type="submit" className="btn-brand mt-3" disabled={loading}>
              {loading && uploadProgress !== null
                ? `Envoi du fichier… ${uploadProgress}%`
                : loading
                  ? 'Envoi…'
                  : file
                    ? 'Envoyer la demande de devis'
                    : 'Envoyer'}
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
