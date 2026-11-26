import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProduct } from '../api/client';
import type { Product } from '../types';
import { readCached } from '../utils/localCache';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  const image = getProductImage(product.slug, product.images);
  // The catalogue list only carries the first photo, so the second one is fetched on first hover.
  const [hoverImage, setHoverImage] = useState<string | undefined>(
    () => product.images?.[1] ?? readCached<Product>(`product:${product.slug}`)?.images?.[1],
  );
  const [hoverImageReady, setHoverImageReady] = useState(false);
  const requested = useRef(false);

  const loadHoverImage = () => {
    if (hoverImage || requested.current) return;
    requested.current = true;
    fetchProduct(product.slug)
      .then((full) => setHoverImage(full.images?.[1]))
      .catch(() => undefined);
  };

  return (
    <Link
      to={`/produit/${product.slug}`}
      className="product-tile"
      onMouseEnter={loadHoverImage}
      onFocus={loadHoverImage}
    >
      <div
        className={`product-visual${hoverImageReady ? ' has-hover-image' : ''}`}
        style={{ background: product.imageGradient }}
      >
        {image && (
          <img
            className="product-image"
            src={image}
            alt={`Photo illustrative : ${product.name}`}
            loading="lazy"
            decoding="async"
          />
        )}
        {hoverImage && (
          <img
            className="product-image product-image-hover"
            src={hoverImage}
            alt=""
            aria-hidden="true"
            decoding="async"
            onLoad={() => setHoverImageReady(true)}
          />
        )}
      </div>
      <div className="product-meta">
        <div className="product-tag mb-1">
          {product.category === 'ready' ? 'Prêt à commander' : 'À personnaliser'} · {product.material}
        </div>
        <h3 className="h5 mb-1">{product.name}</h3>
        <p className="small text-secondary mb-2">{product.description}</p>
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
    </Link>
  );
}
