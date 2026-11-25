import { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';

export function Customize() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts({ category: 'customizable' })
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  return (
    <Container className="page-hero pb-5">
      <h1>Personnaliser</h1>
      <p className="section-lead">
        Choisissez un modèle, ajoutez votre texte, vos couleurs et la taille — puis ajoutez au panier.
      </p>

      <div className="custom-panel mb-5">
        <Row className="gy-3">
          <Col md={4}>
            <h2 className="h6 text-uppercase text-secondary">1. Modèle</h2>
            <p className="small mb-0">Sélectionnez un produit ouvert à la personnalisation.</p>
          </Col>
          <Col md={4}>
            <h2 className="h6 text-uppercase text-secondary">2. Options</h2>
            <p className="small mb-0">Texte, couleur, format selon le produit.</p>
          </Col>
          <Col md={4}>
            <h2 className="h6 text-uppercase text-secondary">3. Commande</h2>
            <p className="small mb-0">
              Validez dans le <Link to="/panier">panier</Link> — nous imprimons ensuite.
            </p>
          </Col>
        </Row>
      </div>

      <Row className="gy-4">
        {products.map((p) => (
          <Col key={p.id} sm={6} lg={3}>
            <ProductCard product={p} />
          </Col>
        ))}
      </Row>
    </Container>
  );
}
