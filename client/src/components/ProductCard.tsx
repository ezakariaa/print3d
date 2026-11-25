import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  const image = getProductImage(product.slug, product.images);
  return (
    <Link to={`/produit/${product.slug}`} className="product-tile">
      <div className="product-visual" style={{ background: product.imageGradient }}>
        {image && (
          <img
            className="product-image"
            src={image}
            alt={`Photo illustrative : ${product.name}`}
            loading="lazy"
            decoding="async"
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
