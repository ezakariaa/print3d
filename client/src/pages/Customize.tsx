import { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { COMPANY } from '../config/company';
import type { Product } from '../types';
import { getProductImage } from '../utils/productImages';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const STEPS = [
  {
    title: 'Choisissez un modèle',
    text: 'Parcourez les pièces ouvertes à la personnalisation.',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="m14.5 17.5 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Personnalisez-le',
    text: 'Texte ou prénom, couleurs, taille : selon le modèle.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    title: 'Recevez votre pièce',
    text: 'Imprimée à la commande dans notre atelier, puis livrée.',
    icon: (
      <svg {...iconProps}>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    ),
  },
];

export function Customize() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    fetchProducts({ category: 'customizable' })
      .then((list) => setProducts(list.filter((product) => product.active !== false)))
      .catch(() => setProducts([]));
  }, []);

  // Up to three photos for the collage of the hero.
  const collage = (products ?? [])
    .map((product) => ({ product, image: getProductImage(product.slug, product.images) }))
    .filter((entry): entry is { product: Product; image: string } => Boolean(entry.image))
    .slice(0, 3);

  const whatsapp = COMPANY.whatsapp
    ? `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent('Bonjour PrintMa3D, j’aimerais une pièce personnalisée :')}`
    : '';

  return (
    <Container className="page-hero pb-5">
      <section className="custom-hero">
        <div className="custom-hero-text">
          <span className="ways-kicker">Atelier sur mesure</span>
          <h1>Une pièce à votre image</h1>
          <p className="section-lead">
            Choisissez un modèle, ajoutez votre texte, vos couleurs et la taille : nous l’imprimons pour vous.
          </p>
          <div className="d-flex flex-wrap gap-2 mt-4">
            <a href="#modeles" className="btn btn-brand">Choisir un modèle</a>
            <Link to="/contact" className="btn btn-outline-secondary">Projet unique ? Demander un devis</Link>
          </div>
        </div>
        {collage.length > 0 && (
          <div className={`custom-collage is-${collage.length}`} aria-hidden="true">
            {collage.map(({ product, image }) => (
              <div className="custom-collage-item" key={product.id}>
                <img src={image} alt="" />
              </div>
            ))}
          </div>
        )}
      </section>

      <ol className="custom-steps">
        {STEPS.map((step, index) => (
          <li className="custom-step" key={step.title}>
            <span className="custom-step-icon" aria-hidden="true">{step.icon}</span>
            <span className="custom-step-number">Étape {index + 1}</span>
            <h2 className="custom-step-title">{step.title}</h2>
            <p className="custom-step-text">{step.text}</p>
          </li>
        ))}
      </ol>

      <section id="modeles" className="custom-models">
        <div className="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-4">
          <div>
            <h2 className="section-title mb-1">Modèles à personnaliser</h2>
            <p className="section-lead mb-0">
              {products === null
                ? 'Chargement des modèles…'
                : `${products.length} modèle${products.length > 1 ? 's' : ''} disponible${products.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <Link to="/boutique" className="shop-reset">Voir toute la boutique</Link>
        </div>
        <Row className="g-4">
          {products === null && Array.from({ length: 4 }, (_, index) => (
            <Col key={index} xs={6} lg={3}>
              <div className="product-skeleton" aria-hidden="true">
                <div className="product-skeleton-visual" />
                <div className="product-skeleton-line is-short" />
                <div className="product-skeleton-line" />
              </div>
            </Col>
          ))}
          {products?.map((p) => (
            <Col key={p.id} xs={6} lg={3}>
              <ProductCard product={p} />
            </Col>
          ))}
        </Row>
        {products?.length === 0 && (
          <p className="text-secondary">Aucun modèle personnalisable pour le moment.</p>
        )}
      </section>

      <section className="custom-cta">
        <div>
          <h2 className="h4 mb-1">Une idée qui n’est pas dans la liste ?</h2>
          <p className="mb-0">Envoyez-nous un croquis, une photo ou un fichier 3D : l’atelier imprime aussi vos créations.</p>
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
