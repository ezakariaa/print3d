import { useEffect, useMemo, useState } from 'react';
import { Col, Container, Form, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProducts, onCacheUpdate } from '../api/client';
import { Paginator, clampPage } from '../components/Paginator';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';

type Filter = 'all' | 'ready' | 'customizable';
type Sort = 'nouveautes' | 'prix-asc' | 'prix-desc' | 'nom';

const PAGE_SIZE = 40;
const POPULAR_TAG_COUNT = 8;

const CATEGORIES: Array<{ value: Filter; label: string; short: string }> = [
  { value: 'all', label: 'Tous les produits', short: 'Tous' },
  { value: 'ready', label: 'Prêts à commander', short: 'Prêts' },
  { value: 'customizable', label: 'À personnaliser', short: 'Personnalisables' },
];

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'nouveautes', label: 'Nouveautés' },
  { value: 'prix-asc', label: 'Prix croissant' },
  { value: 'prix-desc', label: 'Prix décroissant' },
  { value: 'nom', label: 'Nom (A → Z)' },
];

const isFilter = (value: string | null): value is Filter => value === 'ready' || value === 'customizable';
const isSort = (value: string | null): value is Sort => SORTS.some((sort) => sort.value === value);

export function Shop() {
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  // Filters live in the address (?categorie=…&q=…&tag=…&tri=…): shareable, kept on "back".
  const [params, setParams] = useSearchParams();
  const filter: Filter = isFilter(params.get('categorie')) ? params.get('categorie') as Filter : 'all';
  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';
  const sort: Sort = isSort(params.get('tri')) ? params.get('tri') as Sort : 'nouveautes';

  const setParam = (key: string, value: string, defaultValue = '') => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

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

  const active = useMemo(() => (allProducts ?? []).filter((product) => product.active !== false), [allProducts]);

  const countFor = (category: Filter) =>
    category === 'all' ? active.length : active.filter((product) => product.category === category).length;

  // Most used tags in the current category, as quick filters.
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    active
      .filter((product) => filter === 'all' || product.category === filter)
      .forEach((product) => product.tags.forEach((name) => {
        const key = name.trim().toLowerCase();
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }));
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
      .slice(0, POPULAR_TAG_COUNT)
      .map(([name]) => name);
  }, [active, filter]);

  // Filtering happens locally: the full catalogue is read once from the local cache.
  const products = useMemo(() => {
    let list = active;
    if (filter !== 'all') list = list.filter((product) => product.category === filter);
    if (tag) list = list.filter((product) => product.tags.some((name) => name.trim().toLowerCase() === tag));
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((product) =>
        product.name.toLowerCase().includes(term)
        || product.description.toLowerCase().includes(term)
        || product.tags.some((name) => name.toLowerCase().includes(term)));
    }
    const sorted = [...list];
    if (sort === 'prix-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'prix-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'nom') sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    else sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return sorted;
  }, [active, filter, tag, q, sort]);

  const loading = allProducts === null && !error;
  const hasFilters = filter !== 'all' || Boolean(q) || Boolean(tag);

  // A new filter, search or sort starts again from the first page.
  useEffect(() => setPage(1), [filter, q, tag, sort]);
  const currentPage = clampPage(page, products.length, PAGE_SIZE);
  const pageCount = Math.ceil(products.length / PAGE_SIZE);
  const pageProducts = products.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changePage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => setParams({}, { replace: true });

  const title = filter === 'ready' ? 'Produits prêts' : filter === 'customizable' ? 'À personnaliser' : 'Boutique';

  return (
    <Container className="page-hero pb-5">
      <header className="shop-header">
        <span className="ways-kicker">Boutique PrintMa3D</span>
        <h1 className="mb-2">{title}</h1>
        <p className="section-lead mb-0">
          Objets imprimés en atelier : collection prête à commander ou modèles à personnaliser.
        </p>
      </header>

      <div className="shop-toolbar">
        <div className="featured-tabs shop-tabs" role="tablist" aria-label="Catégorie">
          {CATEGORIES.map((category) => (
            <button
              key={category.value}
              type="button"
              role="tab"
              aria-selected={filter === category.value}
              className={`featured-tab${filter === category.value ? ' is-active' : ''}`}
              onClick={() => {
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  if (category.value === 'all') next.delete('categorie');
                  else next.set('categorie', category.value);
                  next.delete('tag');
                  return next;
                }, { replace: true });
              }}
            >
              <span className="d-none d-sm-inline">{category.label}</span>
              <span className="d-sm-none">{category.short}</span>
              <span className="featured-tab-count">{countFor(category.value)}</span>
            </button>
          ))}
        </div>

        <div className="shop-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Form.Control
            type="search"
            placeholder="Rechercher : lampe, porte-clés…"
            aria-label="Rechercher un produit"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
        </div>

        <Form.Select
          className="shop-sort"
          aria-label="Trier les produits"
          value={sort}
          onChange={(e) => setParam('tri', e.target.value, 'nouveautes')}
        >
          {SORTS.map((option) => <option key={option.value} value={option.value}>Trier : {option.label}</option>)}
        </Form.Select>
      </div>

      {popularTags.length > 0 && (
        <div className="shop-tags" aria-label="Thèmes populaires">
          {popularTags.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={tag === name}
              className={`shop-tag${tag === name ? ' is-active' : ''}`}
              onClick={() => setParam('tag', tag === name ? '' : name)}
            >
              #{name}
            </button>
          ))}
        </div>
      )}

      <div className="shop-results">
        <span>
          {loading ? 'Chargement…' : <><strong>{products.length}</strong> produit{products.length > 1 ? 's' : ''}</>}
          {tag && <> · thème <strong>#{tag}</strong></>}
          {q.trim() && <> · « {q.trim()} »</>}
        </span>
        {hasFilters && (
          <button type="button" className="shop-reset" onClick={reset}>Réinitialiser les filtres</button>
        )}
      </div>

      {error && <p className="text-warning mb-4">{error}</p>}

      <Row className="g-4">
        {loading && Array.from({ length: 8 }, (_, index) => (
          <Col key={index} xs={6} lg={3}>
            <div className="product-skeleton" aria-hidden="true">
              <div className="product-skeleton-visual" />
              <div className="product-skeleton-line is-short" />
              <div className="product-skeleton-line" />
              <div className="product-skeleton-line is-short" />
            </div>
          </Col>
        ))}
        {pageProducts.map((p) => (
          <Col key={p.id} xs={6} lg={3}>
            <ProductCard product={p} />
          </Col>
        ))}
      </Row>

      {!loading && !error && products.length === 0 && (
        <div className="shop-empty">
          <div className="shop-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M8.5 11h5" />
            </svg>
          </div>
          <h2 className="h5">Aucun produit ne correspond</h2>
          <p className="text-secondary mb-3">Essayez un autre mot, ou une pièce sur mesure : l’atelier imprime aussi vos idées.</p>
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            <button type="button" className="btn btn-brand" onClick={reset}>Voir tous les produits</button>
            <Link to="/contact" className="btn btn-outline-secondary">Demander une pièce sur mesure</Link>
          </div>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-5 d-flex flex-column align-items-center gap-2">
          <Paginator page={currentPage} pageCount={pageCount} onChange={changePage} />
          <small className="text-secondary">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, products.length)} sur {products.length} produits
          </small>
        </div>
      )}
    </Container>
  );
}
