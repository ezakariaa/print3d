import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProduct } from '../api/client';
import { useWishlist } from '../context/WishlistContext';
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
  const wishlist = useWishlist();
  const liked = wishlist.has(product.id);

  const loadHoverImage = () => {
    if (hoverImage || requested.current) return;
    requested.current = true;
    fetchProduct(product.slug)
      .then((full) => setHoverImage(full.images?.[1]))
      .catch(() => undefined);
  };

  return (
    <div className="product-tile-wrap">
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
      {/* Outside the link, so a click toggles the favourite without opening the product. */}
      <button
        type="button"
        className={`wishlist-toggle${liked ? ' is-active' : ''}`}
        aria-pressed={liked}
        aria-label={liked ? `Retirer ${product.name} de ma wishlist` : `Ajouter ${product.name} à ma wishlist`}
        title={liked ? 'Retirer de ma wishlist' : 'Ajouter à ma wishlist'}
        onClick={() => wishlist.toggle(product.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z" />
        </svg>
      </button>
    </div>
  );
}
