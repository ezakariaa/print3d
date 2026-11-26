import { useEffect, useMemo, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchProducts, onCacheUpdate } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { useWishlist } from '../context/WishlistContext';
import type { Product } from '../types';

export function Wishlist() {
  const { ids } = useWishlist();
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchProducts()
      .then((list) => {
        if (!cancelled) setCatalogue(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    void load();
    const unsubscribe = onCacheUpdate(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Wishlist order (latest first); products removed from the shop are skipped.
  const products = useMemo(() => {
    const byId = new Map((catalogue ?? []).filter((p) => p.active !== false).map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  }, [catalogue, ids]);

  const loading = catalogue === null && !error;

  return (
    <Container className="page-hero pb-5">
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
        <div>
          <h1>Ma wishlist</h1>
          <p className="section-lead mb-0">
            Les produits que vous avez mis de côté. Touchez le cœur d’un produit pour le retirer.
          </p>
        </div>
        <Link to="/admin" className="btn btn-outline-secondary">Retour à l’Espace Client</Link>
      </div>

      {error && <p className="text-warning mb-4">{error}</p>}

      <Row className="gy-4">
        {loading && ids.length > 0 && ids.slice(0, 4).map((id) => (
          <Col key={id} xs={6} lg={3}>
            <div className="product-skeleton" aria-hidden="true">
              <div className="product-skeleton-visual" />
              <div className="product-skeleton-line is-short" />
              <div className="product-skeleton-line" />
            </div>
          </Col>
        ))}
        {products.map((p) => (
          <Col key={p.id} xs={6} lg={3}>
            <ProductCard product={p} />
          </Col>
        ))}
      </Row>

      {!loading && products.length === 0 && (
        <div className="custom-panel text-center py-5">
          <p className="mb-3 text-secondary">Votre wishlist est vide pour le moment.</p>
          <Link to="/boutique" className="btn btn-brand">Découvrir la boutique</Link>
        </div>
      )}
    </Container>
  );
}
