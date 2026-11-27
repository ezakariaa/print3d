import { useEffect, useState, type ReactNode } from 'react';
import { Container } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchServices } from '../api/client';
import { COMPANY } from '../config/company';
import type { Service } from '../types';
import { formatPrice } from '../utils/formatPrice';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Icon per service type (the "icon" field set in Gestion des services). */
const TYPE_ICONS: Record<string, ReactNode> = {
  fdm: (
    <svg {...iconProps}>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <path d="M7 18v3h10v-3M7 13h.01" />
    </svg>
  ),
  resin: (
    <svg {...iconProps}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  ),
  model: (
    <svg {...iconProps}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  ),
  series: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  other: (
    <svg {...iconProps}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  ),
};

/** "À partir de … DH" on the cards: hidden for now (prices stay editable in Gestion des services). */
const SHOW_PRICES = false;

const PROCESS = [
  { title: 'Votre demande', text: 'Un fichier STL, un croquis ou une simple idée, via le formulaire de devis.' },
  { title: 'Le devis', text: 'L’atelier étudie votre projet et vous répond sous 24 h.' },
  { title: 'L’impression', text: 'Votre pièce est imprimée et contrôlée dans notre atelier.' },
  { title: 'La livraison', text: 'Expédition à votre adresse avec le transporteur de votre choix.' },
];

export function Services() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch(() => {
        setServices([]);
        setError('Les services ne peuvent pas être affichés pour le moment. Réessayez dans un instant.');
      });
  }, []);

  const whatsapp = COMPANY.whatsapp
    ? `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent('Bonjour PrintMa3D, j’aimerais un devis pour une impression 3D :')}`
    : '';

  return (
    <Container className="page-hero pb-5">
      <header className="services-header">
        <span className="ways-kicker">Atelier d’impression 3D</span>
        <h1>Services d’impression</h1>
        <p className="section-lead">
          De la pièce unique à la petite série : dites-nous ce dont vous avez besoin, on vous répond sous 24 h.
        </p>
        <ul className="services-facts">
          <li>Réponse sous 24 h</li>
          <li>Pièce unique ou petite série</li>
          <li>Fichier, croquis ou simple idée</li>
        </ul>
      </header>

      {error && <p className="text-warning">{error}</p>}

      <div className="services-grid">
        {services === null && Array.from({ length: 2 }, (_, index) => (
          <div className="service-card is-loading" key={index} aria-hidden="true" />
        ))}
        {services?.map((service) => (
          <article className={`service-card is-${service.icon}`} key={service.id}>
            <div className="service-card-head">
              <span className="service-card-icon" aria-hidden="true">{TYPE_ICONS[service.icon] ?? TYPE_ICONS.other}</span>
              <div>
                <h2 className="service-card-title">{service.title}</h2>
                <p className="service-card-summary">{service.summary}</p>
              </div>
            </div>
            {service.details.length > 0 && (
              <ul className="service-card-points">
                {service.details.map((detail) => (
                  <li key={detail}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                    {detail}
                  </li>
                ))}
              </ul>
            )}
            <footer className={`service-card-foot${SHOW_PRICES ? '' : ' is-cta-only'}`}>
              {SHOW_PRICES && (
                <div>
                  <span className="service-card-from">À partir de</span>
                  <div className="service-card-price">
                    {formatPrice(service.fromPrice, 0)} <span>/ {service.unit}</span>
                  </div>
                </div>
              )}
              <Link to={`/contact?service=${service.id}`} className="btn btn-brand">Demander un devis</Link>
            </footer>
          </article>
        ))}
      </div>

      <section className="services-process">
        <h2 className="section-title">Comment ça se passe</h2>
        <ol className="services-steps">
          {PROCESS.map((step, index) => (
            <li key={step.title}>
              <span className="services-step-number" aria-hidden="true">{index + 1}</span>
              <h3 className="services-step-title">{step.title}</h3>
              <p className="services-step-text">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="custom-cta">
        <div>
          <h2 className="h4 mb-1">Un projet en tête ?</h2>
          <p className="mb-0">Décrivez-le en quelques lignes : nous revenons vers vous avec un devis.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to="/contact" className="btn btn-light">Demander un devis</Link>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn custom-cta-whatsapp">
              Écrire sur WhatsApp
            </a>
          )}
        </div>
      </section>
    </Container>
  );
}
