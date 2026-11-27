import React, { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Form, InputGroup, Modal } from 'react-bootstrap';
import {
  deleteAdminOptionCategory,
  fetchAdminOptionCategories,
  invalidateCache,
  saveAdminOptionCategory,
} from '../api/client';
import type {
  ProductCategory,
  ProductOptionCategory,
  ProductOptionType,
  ProductOptionValue,
} from '../types';
import { compressImageToDataUrl } from '../utils/compressImage';
import { formatPrice } from '../utils/formatPrice';
import { slugify } from '../utils/slugify';

const emptyCategory = (): ProductOptionCategory => ({
  id: '',
  title: '',
  values: [{ id: crypto.randomUUID(), label: '' }],
  productCategories: ['ready', 'customizable'],
  type: 'values',
});

const productCategoryOptions: Array<{ value: ProductCategory; label: string }> = [
  { value: 'ready', label: 'Prêt à commander' },
  { value: 'customizable', label: 'À personnaliser' },
];

const TYPE_LABELS: Record<ProductOptionType, string> = {
  values: 'Liste de valeurs',
  text: 'Champ de texte',
  image: 'Images',
};

const TYPE_FILTERS: Array<{ value: 'all' | ProductOptionType; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'values', label: 'Listes' },
  { value: 'text', label: 'Texte' },
  { value: 'image', label: 'Images' },
];

const typeIcon = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const TYPE_ICONS: Record<ProductOptionType, React.ReactNode> = {
  values: typeIcon(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>),
  text: typeIcon(<><path d="M4 7V5h16v2M12 5v14M9 19h6" /></>),
  image: typeIcon(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-4.5-4.5L8 20" /></>),
};

interface OptionImagePickerProps {
  imageUrl?: string;
  file?: File;
  label: string;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

/** Square thumbnail: click to choose an image, preview of the current or new one, small remove button. */
function OptionImagePicker({ imageUrl, file, label, onSelect, onRemove }: OptionImagePickerProps) {
  const [filePreview, setFilePreview] = useState<string>();

  useEffect(() => {
    if (!file) {
      setFilePreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const preview = filePreview ?? imageUrl;
  return (
    <div className={`option-image-picker${preview ? ' has-image' : ''}`}>
      <label className="option-image-picker-tile" title={preview ? 'Changer l’image' : 'Ajouter une image'}>
        <input
          type="file"
          className="visually-hidden"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`${preview ? 'Changer l’image' : 'Ajouter une image'} pour ${label}`}
          onChange={onSelect}
        />
        {preview ? (
          <>
            <img src={preview} alt="" />
            <span className="option-image-picker-overlay" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </span>
          </>
        ) : (
          <svg className="option-image-picker-empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m21 16-4.5-4.5L8 20" />
          </svg>
        )}
      </label>
      {preview && (
        <button
          type="button"
          className="option-image-picker-remove"
          title="Retirer l’image"
          aria-label={`Retirer l’image de ${label}`}
          onClick={onRemove}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function AdminOptions({
  fetchCategories = fetchAdminOptionCategories,
}: {
  /** Where the list comes from (the admin API by default). */
  fetchCategories?: () => Promise<ProductOptionCategory[]>;
} = {}) {
  const [categories, setCategories] = useState<ProductOptionCategory[]>([]);
  const [draft, setDraft] = useState<ProductOptionCategory>(emptyCategory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProductOptionType>('all');
  const [search, setSearch] = useState('');
  const optionType: ProductOptionType = draft.type ?? 'values';
  const showValues = optionType === 'values';
  const isImageType = optionType === 'image';

  const visibleCategories = categories.filter((category) => {
    const term = search.trim().toLowerCase();
    const matchesType = typeFilter === 'all' || (category.type ?? 'values') === typeFilter;
    const matchesSearch = !term || category.title.toLowerCase().includes(term) ||
      category.values.some((value) => value.label.toLowerCase().includes(term));
    return matchesType && matchesSearch;
  });

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await fetchCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les catégories d’options.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Impossible de charger les catégories d’options.');
      })
      .finally(() => setLoading(false));
  }, []);

  const openNewCategory = () => {
    setDraft(emptyCategory());
    setEditingId(null);
    setImageFiles({});
    setError('');
    setShowModal(true);
  };

  const openEditCategory = (category: ProductOptionCategory) => {
    setDraft({
      ...category,
      productCategories: category.productCategories ?? ['ready', 'customizable'],
      type: category.type ?? 'values',
    });
    setEditingId(category.id);
    setImageFiles({});
    setError('');
    setShowModal(true);
  };

  const updateValue = (valueId: string, updates: Partial<ProductOptionValue>) => {
    setDraft((current) => ({
      ...current,
      values: current.values.map((value) => (
        value.id === valueId ? { ...value, ...updates } : value
      )),
    }));
  };

  const onSelectImage = (valueId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Les images doivent être au format JPEG, PNG ou WebP.');
      return;
    }
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      setError('Chaque image doit peser au maximum 8 Mo.');
      return;
    }
    setError('');
    setImageFiles((current) => ({ ...current, [valueId]: file }));
  };

  const onSaveCategory = async (event: FormEvent) => {
    event.preventDefault();
    const id = editingId ?? slugify(draft.title);
    if (!id) {
      setError('Le titre doit contenir au moins une lettre ou un chiffre.');
      return;
    }
    if (!draft.productCategories?.length) {
      setError('Choisissez au moins une catégorie de produits.');
      return;
    }
    if (isImageType && draft.values.some((value) => !value.imageUrl && !imageFiles[value.id])) {
      setError('Chaque valeur doit avoir une image.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const pricedValues = showValues && Boolean(draft.pricedValues);
      const values = await Promise.all(draft.values.map(async ({ price, ...value }) => {
        // Prices are kept only while "Prix supplémentaire" is ticked; an empty price means no extra.
        const priced = pricedValues && typeof price === 'number' && Number.isFinite(price) && price > 0
          ? { ...value, price: Math.round(price * 100) / 100 }
          : value;
        const file = imageFiles[value.id];
        if (!file) return priced;
        return { ...priced, imageUrl: await compressImageToDataUrl(file, { maxSize: 256, quality: 0.85 }) };
      }));
      await saveAdminOptionCategory({
        ...draft,
        id,
        title: draft.title.trim(),
        values,
        pricedValues,
      }, editingId === null);
      invalidateCache('options');
      setShowModal(false);
      setDraft(emptyCategory());
      setEditingId(null);
      setImageFiles({});
      setNotice('Catégorie d’options enregistrée.');
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer cette catégorie.');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteCategory = async (category: ProductOptionCategory) => {
    if (!window.confirm(`Supprimer la catégorie « ${category.title} » ?`)) return;
    setError('');
    try {
      await deleteAdminOptionCategory(category.id);
      invalidateCache('options');
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setNotice('Catégorie d’options supprimée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de supprimer cette catégorie.');
    }
  };

  const onDuplicateCategory = async (category: ProductOptionCategory) => {
    setError('');
    const baseTitle = `${category.title} (Copie)`;
    let newId = slugify(baseTitle);
    const existingIds = new Set(categories.map((c) => c.id));
    if (existingIds.has(newId)) {
      newId = `${newId}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const duplicated: ProductOptionCategory = {
      ...category,
      id: newId,
      title: baseTitle,
      values: category.values.map((v) => ({ ...v, id: crypto.randomUUID() })),
    };

    setLoading(true);
    try {
      await saveAdminOptionCategory(duplicated, true);
      invalidateCache('options');
      setNotice('Option dupliquée avec succès.');
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de dupliquer cette option.');
      setLoading(false);
    }
  };

  return (
    <div className="admin-options">
      <div className="opt-toolbar">
        <div className="featured-tabs" role="tablist" aria-label="Type d’option">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={typeFilter === filter.value}
              className={`featured-tab${typeFilter === filter.value ? ' is-active' : ''}`}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
              <span className="featured-tab-count">
                {filter.value === 'all' ? categories.length : categories.filter((c) => (c.type ?? 'values') === filter.value).length}
              </span>
            </button>
          ))}
        </div>
        <div className="shop-search opt-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Form.Control
            type="search"
            placeholder="Rechercher une option ou une valeur…"
            aria-label="Rechercher une option"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button
          type="button"
          className={`admin-header-btn${loading ? ' is-loading' : ''}`}
          onClick={() => void loadCategories()}
          disabled={loading}
          title="Actualiser les options"
          aria-label="Actualiser les options"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>
        <Button className="btn-brand" onClick={openNewCategory}>+ Ajouter une catégorie</Button>
      </div>

      {error && !showModal && (
        <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>
      )}
      {notice && (
        <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>
      )}

      {loading && categories.length === 0 ? (
        <p className="text-secondary">Chargement des catégories…</p>
      ) : visibleCategories.length === 0 ? (
        <div className="custom-panel text-secondary text-center py-5">
          {categories.length === 0 ? 'Aucune catégorie d’options enregistrée.' : 'Aucune option ne correspond à ces critères.'}
        </div>
      ) : (
        <div className="opt-grid">
          {visibleCategories.map((category) => {
            const type = category.type ?? 'values';
            const targets = category.productCategories ?? ['ready', 'customizable'];
            return (
              <article className={`opt-card is-${type}`} key={category.id}>
                <header className="opt-card-head">
                  <span className="opt-card-icon" aria-hidden="true">{TYPE_ICONS[type]}</span>
                  <div className="opt-card-titles">
                    <h3 className="opt-card-title">{category.title}</h3>
                    <div className="opt-card-badges">
                      <span className="opt-badge">{TYPE_LABELS[type]}</span>
                      {type === 'values' && (
                        <span className="opt-badge is-muted">{category.values.length} valeur{category.values.length > 1 ? 's' : ''}</span>
                      )}
                      {category.pricedValues && <span className="opt-badge is-price">Prix supplémentaire</span>}
                    </div>
                  </div>
                  <div className="opt-card-actions">
                    <Button
                      type="button"
                      variant="link"
                      className="admin-icon-btn"
                      title="Modifier"
                      aria-label={`Modifier la catégorie ${category.title}`}
                      onClick={() => openEditCategory(category)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="admin-icon-btn"
                      title="Dupliquer"
                      aria-label={`Dupliquer la catégorie ${category.title}`}
                      onClick={() => void onDuplicateCategory(category)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="admin-icon-btn admin-icon-btn-danger"
                      title="Supprimer"
                      aria-label={`Supprimer la catégorie ${category.title}`}
                      onClick={() => void onDeleteCategory(category)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </Button>
                  </div>
                </header>

                <div className="opt-card-body">
                  <div className="opt-targets">
                    <span className="opt-label">Affichée pour</span>
                    {targets.map((target) => (
                      <span key={target} className="opt-target">{target === 'ready' ? 'Prêt à commander' : 'À personnaliser'}</span>
                    ))}
                  </div>

                  {type === 'text' ? (
                    <p className="opt-note">Le client saisit un texte libre (prénom, message…).</p>
                  ) : type === 'image' ? (
                    <p className="opt-note">Le client choisit une image ou téléverse la sienne.</p>
                  ) : (
                    <ul className="opt-values">
                      {category.values.map((value) => (
                        <li key={value.id} className="opt-value">
                          {value.imageUrl && <img src={value.imageUrl} alt="" />}
                          <span>{value.label}</span>
                          {category.pricedValues && value.price ? (
                            <span className="opt-value-price">+{formatPrice(value.price)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        size="lg"
        centered
        scrollable
        className="admin-options-modal"
      >
        <Form onSubmit={onSaveCategory}>
          <Modal.Header closeButton>
            <Modal.Title>{editingId ? 'Modifier la catégorie' : 'Ajouter une catégorie'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && (
              <Alert variant="warning" dismissible onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            <Form.Group className="mb-4">
              <Form.Label>Titre de la catégorie</Form.Label>
              <Form.Control
                required
                maxLength={120}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Ex. Couleurs"
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Type d’option</Form.Label>
              <Form.Select
                value={optionType}
                onChange={(event) => {
                  const type = event.target.value as ProductOptionType;
                  setDraft((current) => ({
                    ...current,
                    type,
                    values: type === 'values'
                      ? (current.values.length > 0 ? current.values : [{ id: crypto.randomUUID(), label: '' }])
                      : [],
                  }));
                }}
              >
                <option value="values">Liste de valeurs</option>
                <option value="text">Champ de texte</option>
                <option value="image">Images (choix et téléversement client)</option>
              </Form.Select>
              <Form.Text>
                {optionType === 'text'
                  ? 'Le client pourra saisir un texte libre.'
                  : isImageType
                    ? 'Ajoutez une image à chaque valeur ; le client pourra aussi téléverser la sienne.'
                    : 'Le client choisira une valeur dans une liste.'}
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Afficher cette option pour</Form.Label>
              {productCategoryOptions.map((option) => (
                <Form.Check
                  key={option.value}
                  type="checkbox"
                  label={option.label}
                  checked={draft.productCategories?.includes(option.value) ?? false}
                  onChange={(event) => setDraft((current) => {
                    const selectedCategories = current.productCategories ?? [];
                    return {
                      ...current,
                      productCategories: event.target.checked
                        ? [...selectedCategories, option.value]
                        : selectedCategories.filter((category) => category !== option.value),
                    };
                  })}
                />
              ))}
            </Form.Group>
            {showValues && (
              <>
                <div className="d-flex justify-content-between align-items-center gap-3 mb-2">
                  <h3 className="h6 mb-0 me-auto">Valeurs de l’option</h3>
                  <Form.Check
                    type="checkbox"
                    id="option-priced-values"
                    className="mb-0"
                    label="Prix supplémentaire"
                    checked={Boolean(draft.pricedValues)}
                    onChange={(event) => setDraft((current) => ({ ...current, pricedValues: event.target.checked }))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-light"
                    disabled={draft.values.length >= 50}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      values: [...current.values, { id: crypto.randomUUID(), label: '' }],
                    }))}
                  >
                    Ajouter une valeur
                  </Button>
                </div>
                <div className="d-grid gap-3">
                  {draft.values.map((value, index) => (
                    <div className="option-value-editor" key={value.id}>
                      <div className="option-value-row">
                        <OptionImagePicker
                          imageUrl={value.imageUrl}
                          file={imageFiles[value.id]}
                          label={value.label || `la valeur ${index + 1}`}
                          onSelect={(event) => onSelectImage(value.id, event)}
                          onRemove={() => {
                            updateValue(value.id, { imageUrl: undefined });
                            setImageFiles((current) => {
                              const next = { ...current };
                              delete next[value.id];
                              return next;
                            });
                          }}
                        />
                        <Form.Control
                          required
                          maxLength={120}
                          value={value.label}
                          onChange={(event) => updateValue(value.id, { label: event.target.value })}
                          placeholder={`Valeur ${index + 1} (ex. Rouge)`}
                        />
                        {draft.pricedValues && (
                          <InputGroup className="option-value-price">
                            <InputGroup.Text>+</InputGroup.Text>
                            <Form.Control
                              type="number"
                              min={0}
                              max={100000}
                              step="0.01"
                              inputMode="decimal"
                              value={value.price ?? ''}
                              placeholder="0"
                              aria-label={`Prix supplémentaire pour ${value.label || `la valeur ${index + 1}`}`}
                              onChange={(event) => updateValue(value.id, {
                                price: event.target.value === '' ? undefined : Number(event.target.value),
                              })}
                            />
                            <InputGroup.Text>DH</InputGroup.Text>
                          </InputGroup>
                        )}
                        {draft.values.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="link"
                            className="admin-icon-btn admin-icon-btn-danger"
                            title="Supprimer la valeur"
                            aria-label={`Supprimer la valeur ${index + 1}`}
                            onClick={() => {
                              setDraft((current) => ({
                                ...current,
                                values: current.values.filter((item) => item.id !== value.id),
                              }));
                              setImageFiles((current) => {
                                const next = { ...current };
                                delete next[value.id];
                                return next;
                              });
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Form.Text>
                  {isImageType
                    ? 'Chaque valeur doit avoir une image · JPEG, PNG ou WebP.'
                    : 'Cliquez sur le carré pour ajouter une image (facultatif) · JPEG, PNG ou WebP · optimisée automatiquement.'}
                </Form.Text>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-light" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand" disabled={loading}>
              {loading ? 'Enregistrement…' : 'Enregistrer la catégorie'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
