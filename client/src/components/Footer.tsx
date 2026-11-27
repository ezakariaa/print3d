import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { COMPANY } from '../config/company';

const EXPLORE = [
  { to: '/boutique', label: 'Boutique' },
  { to: '/personnaliser', label: 'Personnaliser' },
  { to: '/services', label: 'Services d’impression' },
  { to: '/contact', label: 'Contact & devis' },
];

const ACCOUNT = [
  { to: '/admin', label: 'Espace client' },
  { to: '/mes-commandes', label: 'Mes commandes' },
  { to: '/wishlist', label: 'Ma wishlist' },
  { to: '/panier', label: 'Panier' },
];

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function Footer() {
  const whatsapp = COMPANY.whatsapp
    ? `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(COMPANY.whatsappMessage)}`
    : '';
  const whatsappLabel = COMPANY.whatsapp
    ? `+${COMPANY.whatsapp.slice(0, 3)} ${COMPANY.whatsapp.slice(3, 6)} ${COMPANY.whatsapp.slice(6, 9)} ${COMPANY.whatsapp.slice(9)}`
    : '';

  return (
    <footer className="site-footer">
      <Container>
        <Row className="gy-4 gx-lg-5">
          <Col lg={4}>
            <Link to="/" className="footer-brand">
              Print<span className="brand-red">Ma</span><span>3D</span>
            </Link>
            <p className="footer-about">
              Atelier d’impression 3D : services sur devis, objets prêts à l’emploi et pièces à personnaliser.
            </p>
          </Col>

          <Col xs={6} md={4} lg={2}>
            <h2 className="footer-title">Explorer</h2>
            <ul className="footer-links">
              {EXPLORE.map((link) => <li key={link.to}><Link to={link.to}>{link.label}</Link></li>)}
            </ul>
          </Col>

          <Col xs={6} md={4} lg={2}>
            <h2 className="footer-title">Mon compte</h2>
            <ul className="footer-links">
              {ACCOUNT.map((link) => <li key={link.to}><Link to={link.to}>{link.label}</Link></li>)}
            </ul>
          </Col>

          <Col md={4} lg={4}>
            <h2 className="footer-title">L’atelier</h2>
            <ul className="footer-contact">
              <li>
                <svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
              </li>
              {whatsapp && (
                <li>
                  <svg {...iconProps}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">{whatsappLabel}</a>
                </li>
              )}
              <li>
                <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>Lun – Ven · 9 h – 18 h</span>
              </li>
              <li>
                <svg {...iconProps}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
                <span>Livraison partout au Maroc</span>
              </li>
            </ul>
          </Col>
        </Row>

        <div className="footer-bottom">
          <p className="mb-0">© {new Date().getFullYear()} PrintMa3D — Impression &amp; création.</p>
          <div className="footer-bottom-links">
            <a href="/products/credits.html">Crédits photos</a>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Retour en haut ↑
            </button>
          </div>
        </div>
      </Container>
    </footer>
  );
}
