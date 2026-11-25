import { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchServices } from '../api/client';
import type { Service } from '../types';
import { formatPrice } from '../utils/formatPrice';

export function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Container className="page-hero pb-5">
      <h1>Services d’impression</h1>
      <p className="section-lead">
        De la pièce unique à la petite série. Dites-nous ce dont vous avez besoin — on vous répond sous 24 h.
      </p>

      {error && <p className="text-warning">{error} (démarrez l’API sur le port 4000)</p>}

      {services.map((s) => (
        <div key={s.id} className="service-block">
          <Row className="align-items-start gy-3">
            <Col lg={7}>
              <h2 className="h4 mb-2">{s.title}</h2>
              <p className="text-secondary mb-3">{s.summary}</p>
              <ul className="small text-secondary mb-0">
                {s.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </Col>
            <Col lg={5} className="text-lg-end">
              <div className="service-price mb-3">
                dès {formatPrice(s.fromPrice, 0)} / {s.unit}
              </div>
              <Link to={`/contact?service=${s.id}`} className="btn btn-brand">
                Demander un devis
              </Link>
            </Col>
          </Row>
        </div>
      ))}
    </Container>
  );
}
