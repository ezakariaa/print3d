import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import { fetchOptionCategories, fetchProduct } from '../api/client';
import { useCart } from '../context/CartContext';
import type { CartCustomization, Product, ProductOptionCategory, ProductOptionValue } from '../types';
import { compressImageToDataUrl } from '../utils/compressImage';
import { formatPrice } from '../utils/formatPrice';
import { getProductImage } from '../utils/productImages';

function isColorOptionCategory(category: ProductOptionCategory) {
  if (category.type !== undefined && category.type !== 'values') return false;
  const key = `${category.id} ${category.title}`.toLowerCase();
  return key.includes('couleur') || key.includes('color');
}

/** Extra price of an option value, or 0 when the category has no priced values. */
function valueExtra(category: ProductOptionCategory | undefined, value: ProductOptionValue | undefined) {
  if (!category?.pricedValues || !value || typeof value.price !== 'number' || !Number.isFinite(value.price)) return 0;
  return Math.max(0, value.price);
}

/** Label suffix shown next to a value with an extra price, e.g. " (+20,00 DH)". */
function extraLabel(category: ProductOptionCategory, value: ProductOptionValue) {
  const extra = valueExtra(category, value);
  return extra > 0 ? ` (+${formatPrice(extra)})` : '';
}

export function ProductDetail() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [optionCategories, setOptionCategories] = useState<ProductOptionCategory[]>([]);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [color, setColor] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [uploadedOptionImages, setUploadedOptionImages] = useState<Record<string, string>>({});
  const [optionImageError, setOptionImageError] = useState('');
  const [pendingImageUploads, setPendingImageUploads] = useState(0);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!slug) return;
    setAdded(false);
    setSelectedOptions({});
    setUploadedOptionImages({});
    setOptionImageError('');
    setQuantity(1);
    fetchProduct(slug)
      .then((p) => {
        if (p.active === false) {
          setError('Ce produit n’est plus disponible.');
          setProduct(null);
          return;
        }
        setProduct(p);
        setColor(p.colors[0] ?? '');
        setSelectedImage(getProductImage(p.slug, p.images) ?? '');
      })
      .catch((e: Error) => setError(e.message));
    fetchOptionCategories().then(setOptionCategories).catch(() => setOptionCategories([]));
  }, [slug]);

  const onSelectOptionImage = async (
    categoryId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setOptionImageError('Les images doivent être au format JPEG, PNG ou WebP.');
      return;
    }
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      setOptionImageError('Chaque image doit peser au maximum 8 Mo.');
      return;
    }

    setOptionImageError('');
    setPendingImageUploads((count) => count + 1);
    try {
      const imageUrl = await compressImageToDataUrl(file, { maxSize: 512, quality: 0.8 });
      const otherImageBytes = Object.entries(uploadedOptionImages).reduce(
        (total, [id, currentImage]) => total + (id === categoryId ? 0 : currentImage.length),
        0,
      );
      if (otherImageBytes + imageUrl.length > 700 * 1024) {
        throw new Error('Les images téléversées pour ce produit dépassent 700 Ko au total.');
      }
      setUploadedOptionImages((current) => ({ ...current, [categoryId]: imageUrl }));
      setSelectedOptions((current) => ({ ...current, [categoryId]: '' }));
    } catch (uploadError) {
      setOptionImageError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Impossible de traiter cette image.',
      );
    } finally {
      setPendingImageUploads((count) => Math.max(0, count - 1));
    }
  };

  // Product price plus the extra price of the chosen values (same rule as the server).
  const unitPrice = (() => {
    if (!product) return 0;
    const applicable = optionCategories.filter(
      (category) => category.productCategories?.includes(product.category) ?? true,
    );
    let extra = 0;
    for (const category of applicable) {
      if (isColorOptionCategory(category) || category.type === 'text') continue;
      extra += valueExtra(category, category.values.find((value) => value.id === selectedOptions[category.id]));
    }
    const colorCategory = applicable.find(isColorOptionCategory);
    if (color && colorCategory) {
      extra += valueExtra(colorCategory, colorCategory.values.find((value) => value.label === color));
    }
    return product.price + extra;
  })();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!product) return;

    if (pendingImageUploads > 0) {
      setOptionImageError('Attendez la fin du traitement des images avant de continuer.');
      return;
    }

    const optionSelections: NonNullable<CartCustomization['options']> = [];
    for (const category of optionCategories) {
      if (
        !(category.productCategories?.includes(product.category) ?? true) ||
        isColorOptionCategory(category)
      ) {
        continue;
      }

      if (category.type === 'text') {
        const value = selectedOptions[category.id]?.trim();
        if (value) {
          optionSelections.push({
            categoryId: category.id,
            categoryTitle: category.title,
            type: 'text',
            value,
          });
        }
        continue;
      }

      if (category.type === 'image' && uploadedOptionImages[category.id]) {
        optionSelections.push({
          categoryId: category.id,
          categoryTitle: category.title,
          type: 'image',
          value: 'Image téléversée',
          imageUrl: uploadedOptionImages[category.id],
        });
        continue;
      }

      const selectedValue = category.values.find((value) => value.id === selectedOptions[category.id]);
      if (selectedValue) {
        const extra = valueExtra(category, selectedValue);
        optionSelections.push({
          categoryId: category.id,
          categoryTitle: category.title,
          type: category.type ?? 'values',
          value: selectedValue.label,
          valueId: selectedValue.id,
          ...(extra > 0 ? { price: extra } : {}),
        });
      }
    }

    const customization = {
      color: color || undefined,
      options: optionSelections.length > 0 ? optionSelections : undefined,
    };

    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: unitPrice,
      imageGradient: product.imageGradient,
      imageUrl: getProductImage(product.slug, product.images),
      quantity: Math.max(1, quantity),
      customization,
    });
    setAdded(true);
  };

  // Slideshow: the next photo every 3 s, paused while the visitor points at or uses the gallery.
  const galleryImages = product?.images ?? [];
  const [galleryPaused, setGalleryPaused] = useState(false);
  useEffect(() => {
    if (galleryImages.length < 2 || galleryPaused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => {
      const current = Math.max(0, galleryImages.indexOf(selectedImage));
      setSelectedImage(galleryImages[(current + 1) % galleryImages.length]);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [galleryImages, selectedImage, galleryPaused]);

  // Keep the active thumbnail visible inside its strip (without scrolling the page).
  const thumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = thumbsRef.current;
    const active = strip?.querySelector<HTMLElement>('.is-active');
    if (!strip || !active) return;
    strip.scrollTo({
      top: active.offsetTop - (strip.clientHeight - active.offsetHeight) / 2,
      left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [selectedImage]);

  if (error) {
    return (
      <Container className="page-hero">
        <Alert variant="warning">{error}</Alert>
        <Link to="/boutique">Retour boutique</Link>
      </Container>
    );
  }

  if (!product) {
    return (
      <Container className="page-hero">
        <p className="text-secondary">Chargement…</p>
      </Container>
    );
  }

  const images = product.images?.length
    ? product.images
    : [getProductImage(product.slug)].filter((image): image is string => Boolean(image));
  const activeIndex = Math.max(0, images.indexOf(selectedImage));
  const activeImage = images[activeIndex];
  const colorCategories = optionCategories.filter(isColorOptionCategory);
  const showColors = product.colors.length > 0
    && (product.category === 'ready' || product.customOptions?.color)
    && (colorCategories.length === 0 || colorCategories.some(
      (category) => category.productCategories?.includes(product.category) ?? true,
    ));
  const applicableOptionCategories = optionCategories.filter(
    (category) => category.productCategories?.includes(product.category) ?? true,
  );
  const colorOptions = applicableOptionCategories.find(isColorOptionCategory)?.values ?? [];
  const selectableOptionCategories = applicableOptionCategories.filter((category) => {
    if (isColorOptionCategory(category)) return false;
    const customOpts = product.customOptions as Record<string, boolean | undefined> | undefined;
    const isExplicitlyEnabled = customOpts?.[`opt_${category.id}`];
    return Boolean(isExplicitlyEnabled);
  });

  const goTo = (index: number) => {
    if (images.length === 0) return;
    setSelectedImage(images[(index + images.length) % images.length]);
  };

  return (
    <Container className="page-hero pb-5 product-page">
      <nav className="product-breadcrumb" aria-label="Fil d’Ariane">
        <Link to="/boutique">Boutique</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>
      <Row className="gy-4 gx-lg-5">
        <Col lg={7}>
          <div
            className={`product-gallery${images.length > 1 ? '' : ' is-single'}`}
            onMouseEnter={() => setGalleryPaused(true)}
            onMouseLeave={() => setGalleryPaused(false)}
            onFocus={() => setGalleryPaused(true)}
            onBlur={() => setGalleryPaused(false)}
          >
            {images.length > 1 && (
              <div className="product-gallery-thumbs" role="tablist" aria-label="Photos du produit" ref={thumbsRef}>
                {images.map((image, index) => (
                  <button
                    key={`${index}-${image.slice(0, 32)}`}
                    type="button"
                    role="tab"
                    className={`product-gallery-thumb${index === activeIndex ? ' is-active' : ''}`}
                    aria-label={`Afficher la photo ${index + 1}`}
                    aria-selected={index === activeIndex}
                    onClick={() => setSelectedImage(image)}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            )}
            <div className="product-gallery-main" style={{ background: product.imageGradient }}>
              {activeImage && (
                <img
                  key={activeImage.slice(0, 64)}
                  className="product-gallery-image"
                  src={activeImage}
                  alt={`Photo ${activeIndex + 1} : ${product.name}`}
                />
              )}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="product-gallery-nav is-prev"
                    aria-label="Photo précédente"
                    onClick={() => goTo(activeIndex - 1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="product-gallery-nav is-next"
                    aria-label="Photo suivante"
                    onClick={() => goTo(activeIndex + 1)}
                  >
                    ›
                  </button>
                  <div className="product-gallery-dots" aria-hidden="true">
                    {images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        tabIndex={-1}
                        className={index === activeIndex ? 'is-active' : ''}
                        onClick={() => goTo(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </Col>
        <Col lg={5}>
          <Form onSubmit={onSubmit} className="product-summary">
            <span className={`product-badge${product.category === 'customizable' ? ' is-custom' : ''}`}>
              {product.category === 'ready' ? 'Prêt à commander' : 'À personnaliser'}
            </span>
            <h1 className="product-title">{product.name}</h1>
            <p className="product-subtitle">{product.description}</p>

            <div className="product-price-row">
              <span className="product-price-value">{formatPrice(unitPrice)}</span>
              {unitPrice > product.price && (
                <span className="product-price-note">dont options +{formatPrice(unitPrice - product.price)}</span>
              )}
              <span className="product-price-note">Impression {product.material} · fabriqué à la commande</span>
            </div>

            <p className="product-description">{product.longDescription}</p>

            {showColors && (
              <fieldset className="product-option">
                <legend className="product-option-label">
                  Couleur : <strong>{color}</strong>
                </legend>
                <div className="product-swatches">
                  {product.colors.map((c) => {
                    const option = colorOptions.find((item) => item.label === c);
                    const colorCategory = applicableOptionCategories.find(isColorOptionCategory);
                    const selected = c === color;
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`product-swatch${selected ? ' is-selected' : ''}`}
                        aria-pressed={selected}
                        title={c}
                        onClick={() => setColor(c)}
                      >
                        {option?.imageUrl
                          ? <img src={option.imageUrl} alt="" />
                          : <span className="product-swatch-fallback">{c.charAt(0).toUpperCase()}</span>}
                        <span className="product-swatch-label">{c}{colorCategory && option ? extraLabel(colorCategory, option) : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {optionImageError && (
              <Alert variant="warning" dismissible onClose={() => setOptionImageError('')}>
                {optionImageError}
              </Alert>
            )}

            {selectableOptionCategories.map((category) => {
              const selectedValue = category.values.find(
                (value) => value.id === selectedOptions[category.id],
              );
              return (
                <Form.Group className="product-option" key={category.id}>
                  <Form.Label className="product-option-label">{category.title}</Form.Label>
                  {category.type === 'text' ? (
                    <Form.Control
                      type="text"
                      maxLength={120}
                      value={selectedOptions[category.id] ?? ''}
                      onChange={(event) => setSelectedOptions((current) => ({
                        ...current,
                        [category.id]: event.target.value,
                      }))}
                    />
                  ) : (category.type === 'image' || (category.type === 'values' && category.values.some((v) => Boolean(v.imageUrl)))) && category.values.length > 0 ? (
                    <div className="product-swatches">
                      {category.values.map((value) => {
                        const selected = selectedOptions[category.id] === value.id;
                        return (
                          <button
                            key={value.id}
                            type="button"
                            className={`product-swatch${selected ? ' is-selected' : ''}`}
                            aria-pressed={selected}
                            title={value.label}
                            onClick={() => setSelectedOptions((current) => ({
                              ...current,
                              [category.id]: value.id,
                            }))}
                          >
                            {value.imageUrl ? (
                              <img src={value.imageUrl} alt="" />
                            ) : (
                              <span className="product-swatch-fallback">{value.label.charAt(0).toUpperCase()}</span>
                            )}
                            <span className="product-swatch-label">{value.label}{extraLabel(category, value)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <Form.Select
                        value={selectedOptions[category.id] ?? ''}
                        onChange={(event) => {
                          setSelectedOptions((current) => ({
                            ...current,
                            [category.id]: event.target.value,
                          }));
                          if (category.type === 'image') {
                            setUploadedOptionImages((current) => {
                              const next = { ...current };
                              delete next[category.id];
                              return next;
                            });
                          }
                        }}
                      >
                        <option value="">
                          {category.type === 'image' ? 'Choisir une image prédéfinie…' : 'Choisir une option…'}
                        </option>
                        {category.values.map((value) => (
                          <option key={value.id} value={value.id}>{value.label}{extraLabel(category, value)}</option>
                        ))}
                      </Form.Select>
                      {category.type === 'image' && (
                        <>
                          {selectedValue?.imageUrl && (
                            <img
                              className="product-option-image-preview"
                              src={selectedValue.imageUrl}
                              alt={`Image sélectionnée : ${selectedValue.label}`}
                            />
                          )}
                          <Form.Label className="product-option-upload-label">
                            Ou téléverser votre image
                          </Form.Label>
                          <input
                            className="form-control"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label={`Téléverser une image pour ${category.title}`}
                            disabled={pendingImageUploads > 0}
                            onChange={(event) => void onSelectOptionImage(category.id, event)}
                          />
                          {uploadedOptionImages[category.id] && (
                            <img
                              className="product-option-image-preview"
                              src={uploadedOptionImages[category.id]}
                              alt="Image téléversée pour cette option"
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                </Form.Group>
              );
            })}


            <Form.Group className="product-option mb-3">
              <Form.Label className="product-option-label mb-2">Quantité</Form.Label>
              <div>
                <div className="product-quantity-selector">
                  <button
                    type="button"
                    className="product-quantity-btn"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Diminuer la quantité"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    className="product-quantity-input"
                    value={quantity}
                    aria-label="Quantité"
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setQuantity(isNaN(val) ? 1 : Math.max(1, val));
                    }}
                  />
                  <button
                    type="button"
                    className="product-quantity-btn"
                    onClick={() => setQuantity((q) => q + 1)}
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
              </div>
            </Form.Group>

            <div className="product-actions">
              <Button
                type="submit"
                className="btn-brand product-cta"
                disabled={pendingImageUploads > 0}
              >
                {pendingImageUploads > 0 ? 'Traitement des images…' : 'Ajouter au panier'}
              </Button>
              <Link to="/panier" className="btn btn-outline-light btn-ghost product-cta">
                Voir le panier
              </Link>
            </div>
            {added && (
              <Alert className="alert-soft mt-3 mb-0 py-2">
                Ajouté au panier.
              </Alert>
            )}

            {product.tags.length > 0 && (
              <div className="product-tags">
                {product.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            )}
          </Form>
        </Col>
      </Row>
    </Container>
  );
}
