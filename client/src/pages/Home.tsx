import { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../api/client';
import { HeroVideoBackground } from '../components/HeroVideoBackground';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';

// Two rows of four cards on large screens.
const FEATURED_COUNT = 8;

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

export function Home() {
  const [featured, setFeatured] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((list) => {
        if (!cancelled) setFeatured(pickRandom(list, FEATURED_COUNT, featuredSeed));
      })
      .catch(() => {
        if (!cancelled) setFeatured([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          <h2 className="section-title">Trois façons de créer</h2>
          <p className="section-lead">
            Choisissez le parcours qui vous convient : service atelier, produit fini, ou personnalisation.
          </p>
          <Row className="gy-4">
            <Col md={4}>
              <h3 className="h5">Services d’impression</h3>
              <p className="text-secondary small mb-3">
                Envoyez votre fichier ou une idée. FDM, résine, modélisation et petites séries.
              </p>
              <Link to="/services">Demander un devis →</Link>
            </Col>
            <Col md={4}>
              <h3 className="h5">Produits prêts</h3>
              <p className="text-secondary small mb-3">
                Des designs déjà validés, imprimés avec soin, prêts à expédier.
              </p>
              <Link to="/boutique">Parcourir la boutique →</Link>
            </Col>
            <Col md={4}>
              <h3 className="h5">À personnaliser</h3>
              <p className="text-secondary small mb-3">
                Texte, couleur, taille : adaptez le modèle avant commande.
              </p>
              <Link to="/personnaliser">Personnaliser →</Link>
            </Col>
          </Row>
        </Container>
      </section>

      <section className="section pt-0">
        <Container>
          <div className="d-flex justify-content-between align-items-end mb-4 flex-wrap gap-2">
            <div>
              <h2 className="section-title mb-1">Sélection atelier</h2>
              <p className="section-lead mb-0">Quelques pièces phares de la collection.</p>
            </div>
            <Link to="/boutique">Toute la boutique →</Link>
          </div>
          <Row className="gy-4">
            {featured.map((p) => (
              <Col key={p.id} xs={6} lg={3}>
                <ProductCard product={p} />
              </Col>
            ))}
          </Row>
        </Container>
      </section>
    </>
  );
}
