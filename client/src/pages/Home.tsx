import { useEffect, useMemo, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../api/client';
import { HeroVideoBackground } from '../components/HeroVideoBackground';
import { ProductCard } from '../components/ProductCard';
import { TestimonialsSection } from '../components/TestimonialsSection';
import type { Product, ProductCategory } from '../types';

// Two rows of four cards on large screens.
const FEATURED_COUNT = 8;

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** "Trois façons de créer": the three ways to order. */
const CREATION_PATHS = [
  {
    to: '/services',
    tone: 'service',
    title: 'Services d’impression',
    text: 'Envoyez votre fichier ou une simple idée : l’atelier imprime pour vous.',
    points: ['FDM et résine', 'Modélisation 3D', 'Petites séries'],
    cta: 'Demander un devis',
    icon: (
      <svg {...iconProps}>
        <path d="M6 9V3h12v6" />
        <rect x="3" y="9" width="18" height="9" rx="2" />
        <path d="M7 18v3h10v-3M7 13h.01" />
      </svg>
    ),
  },
  {
    to: '/boutique',
    tone: 'shop',
    title: 'Produits prêts',
    text: 'Des designs déjà validés, imprimés avec soin et prêts à être expédiés.',
    points: ['Qualité contrôlée', 'Expédition rapide', 'Partout au Maroc'],
    cta: 'Parcourir la boutique',
    icon: (
      <svg {...iconProps}>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    to: '/personnaliser',
    tone: 'custom',
    title: 'À personnaliser',
    text: 'Choisissez un modèle et adaptez-le à votre image avant de commander.',
    points: ['Texte et prénom', 'Couleurs au choix', 'Taille sur mesure'],
    cta: 'Personnaliser un modèle',
    icon: (
      <svg {...iconProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        <path d="m15 5 3 3" />
      </svg>
    ),
  },
];

// Seeded shuffle so the selection is stable for the whole page visit
// (StrictMode re-runs effects in dev; a plain Math.random would reshuffle).
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(items: T[], count: number, seed: number): T[] {
  const random = seededRandom(seed);
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const featuredSeed = Math.floor(Math.random() * 0xffffffff);

const FEATURED_TABS: Array<{ value: 'all' | ProductCategory; label: string; short: string }> = [
  { value: 'all', label: 'Tous', short: 'Tous' },
  { value: 'ready', label: 'Prêts à commander', short: 'Prêts' },
  { value: 'customizable', label: 'À personnaliser', short: 'Personnalisables' },
];

export function Home() {
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const [featuredTab, setFeaturedTab] = useState<'all' | ProductCategory>('all');

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((list) => {
        if (!cancelled) setCatalogue(list.filter((product) => product.active !== false));
      })
      .catch(() => {
        if (!cancelled) setCatalogue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seven products of the chosen kind; the eighth tile leads to the shop.
  const featured = useMemo(() => {
    const pool = featuredTab === 'all' ? catalogue : catalogue.filter((product) => product.category === featuredTab);
    return pickRandom(pool, FEATURED_COUNT - 1, featuredSeed);
  }, [catalogue, featuredTab]);
  const countFor = (tab: 'all' | ProductCategory) =>
    tab === 'all' ? catalogue.length : catalogue.filter((product) => product.category === tab).length;

  return (
    <>
      <section className="hero">
        <HeroVideoBackground />
        <Container>
          <Row className="justify-content-center text-center hero-row">
            <Col lg={8}>
              <div className="brand-mark">
                Print<span className="brand-red">Ma</span><span>3D</span>
              </div>
              <p className="hero-lead">
                Impression 3D sur mesure, objets déjà pensés, pièces à votre image. De l’idée à la couche finale.
              </p>
              <div className="hero-actions d-flex flex-wrap justify-content-center gap-3">
                <Link to="/boutique" className="btn btn-brand">
                  Voir la boutique
                </Link>
                <Link to="/services" className="btn btn-outline-light btn-ghost">
                  Nos services
                </Link>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="ways-header">
            <span className="ways-kicker">Comment ça marche</span>
            <h2 className="section-title">Trois façons de créer</h2>
            <p className="section-lead">
              Choisissez le parcours qui vous convient : service atelier, produit fini, ou personnalisation.
            </p>
          </div>
          <Row className="g-4">
            {CREATION_PATHS.map((path, index) => (
              <Col md={4} key={path.to}>
                <Link to={path.to} className={`way-card is-${path.tone}`}>
                  <span className="way-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <span className="way-icon" aria-hidden="true">{path.icon}</span>
                  <h3 className="way-title">{path.title}</h3>
                  <p className="way-text">{path.text}</p>
                  <ul className="way-points">
                    {path.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                  <span className="way-cta">
                    {path.cta}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="section featured-section">
        <Container>
          <div className="featured-header">
            <div>
              <span className="ways-kicker">Coups de cœur de l’atelier</span>
              <h2 className="section-title mb-1">Sélection atelier</h2>
              <p className="section-lead mb-0">Des pièces imprimées chez nous, choisies parmi toute la collection.</p>
            </div>
            <div className="featured-tabs" role="tablist" aria-label="Type de produits">
              {FEATURED_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={featuredTab === tab.value}
                  className={`featured-tab${featuredTab === tab.value ? ' is-active' : ''}`}
                  onClick={() => setFeaturedTab(tab.value)}
                >
                  <span className="d-none d-sm-inline">{tab.label}</span>
                  <span className="d-sm-none">{tab.short}</span>
                  <span className="featured-tab-count">{countFor(tab.value)}</span>
                </button>
              ))}
            </div>
          </div>
          <Row className="g-4">
            {featured.map((p) => (
              <Col key={p.id} xs={6} lg={3}>
                <ProductCard product={p} />
              </Col>
            ))}
            {catalogue.length > 0 && (
              <Col xs={6} lg={3}>
                <Link
                  to={featuredTab === 'customizable' ? '/personnaliser' : '/boutique'}
                  className="featured-more"
                >
                  <span className="featured-more-count">{countFor(featuredTab)}</span>
                  <span className="featured-more-label">
                    {featuredTab === 'customizable' ? 'modèles à personnaliser' : 'produits dans la boutique'}
                  </span>
                  <span className="featured-more-cta">
                    Tout voir
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </Col>
            )}
          </Row>
        </Container>
      </section>

      <TestimonialsSection />
    </>
  );
}
