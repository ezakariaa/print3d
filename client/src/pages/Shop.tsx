import { useEffect, useMemo, useState } from 'react';
import { Col, Container, Form, Row } from 'react-bootstrap';
import { fetchProducts, onCacheUpdate } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';

type Filter = 'all' | 'ready' | 'customizable';

export function Shop() {
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchProducts()
      .then((list) => {
        if (!cancelled) setAllProducts(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    void load();
    // Re-read when a background refresh brings newer data from the server.
    const unsubscribe = onCacheUpdate(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Filtering happens locally: the full catalogue is read once from the local cache.
  const products = useMemo(() => {
    let list = (allProducts ?? []).filter((product) => product.active !== false);
    if (filter !== 'all') list = list.filter((product) => product.category === filter);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((product) =>
        product.name.toLowerCase().includes(term)
        || product.description.toLowerCase().includes(term)
        || product.tags.some((tag) => tag.toLowerCase().includes(term)));
    }
    return list;
  }, [allProducts, filter, q]);

  const loading = allProducts === null && !error;

  const title = useMemo(() => {
    if (filter === 'ready') return 'Produits prêts';
    if (filter === 'customizable') return 'À personnaliser';
    return 'Boutique';
  }, [filter]);

  return (
    <Container className="page-hero pb-5">
      <h1>{title}</h1>
      <p className="section-lead">
        Objets imprimés en atelier : collection figée ou modèles ouverts à la personnalisation.
      </p>

      <Row className="g-3 mb-4 align-items-end">
        <Col md={4}>
          <Form.Label>Catégorie</Form.Label>
          <Form.Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">Tous les produits</option>
            <option value="ready">Prêts à commander</option>
            <option value="customizable">À personnaliser</option>
          </Form.Select>
        </Col>
        <Col md={5}>
          <Form.Label>Recherche</Form.Label>
          <Form.Control
            placeholder="Ex. lampe, porte-clés…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
      </Row>

      {error && <p className="text-warning mb-4">{error}</p>}

      <Row className="gy-4">
        {loading && Array.from({ length: 8 }, (_, index) => (
          <Col key={index} sm={6} lg={3}>
            <div className="product-skeleton" aria-hidden="true">
              <div className="product-skeleton-visual" />
              <div className="product-skeleton-line is-short" />
              <div className="product-skeleton-line" />
              <div className="product-skeleton-line is-short" />
            </div>
          </Col>
        ))}
        {products.map((p) => (
          <Col key={p.id} sm={6} lg={3}>
            <ProductCard product={p} />
          </Col>
        ))}
        {!loading && !error && products.length === 0 && (
          <Col>
            <p className="text-secondary">Aucun produit ne correspond.</p>
          </Col>
        )}
      </Row>
    </Container>
  );
}
