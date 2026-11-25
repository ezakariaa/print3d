import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <Container>
        <Row className="gy-4">
          <Col md={5}>
            <div className="footer-brand mb-2">
              Print<span className="brand-red">Ma</span><span>3D</span>
            </div>
            <p className="mb-0 small">
              Atelier d’impression 3D : services sur devis, objets prêts à l’emploi et pièces à personnaliser.
            </p>
          </Col>
          <Col md={3}>
            <div className="text-white fw-semibold mb-2">Explorer</div>
            <ul className="list-unstyled small mb-0">
              <li className="mb-1">
                <Link to="/services">Services</Link>
              </li>
              <li className="mb-1">
                <Link to="/boutique">Boutique</Link>
              </li>
              <li className="mb-1">
                <Link to="/personnaliser">Personnaliser</Link>
              </li>
            </ul>
          </Col>
          <Col md={4}>
            <div className="text-white fw-semibold mb-2">Atelier</div>
            <p className="small mb-1">contact@3alam3d.local</p>
            <p className="small mb-0">Lun–Ven · 9h–18h</p>
          </Col>
        </Row>
        <hr className="border-secondary opacity-25 my-4" />
        <div className="d-flex justify-content-between flex-wrap gap-2">
          <p className="small mb-0">© {new Date().getFullYear()} PrintMa3D — Impression & création.</p>
          <a className="small" href="/products/credits.html">Crédits photos</a>
        </div>
      </Container>
    </footer>
  );
}
