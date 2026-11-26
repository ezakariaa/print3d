import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
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

export function AdminOptions() {
  const [categories, setCategories] = useState<ProductOptionCategory[]>([]);
  const [draft, setDraft] = useState<ProductOptionCategory>(emptyCategory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const optionType: ProductOptionType = draft.type ?? 'values';
  const showValues = optionType === 'values';
  const isImageType = optionType === 'image';

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await fetchAdminOptionCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les catégories d’options.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminOptionCategories()
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
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
        <h2 className="h4 mb-0">Catalogue des options</h2>
        <div className="d-flex gap-2">
          <Button variant="outline-light" onClick={() => void loadCategories()} disabled={loading}>
            Actualiser
          </Button>
          <Button className="btn-brand" onClick={openNewCategory}>Ajouter une catégorie</Button>
        </div>
      </div>
      {error && !showModal && (
        <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>
      )}
      {notice && (
        <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>
      )}
      {loading && categories.length === 0 ? (
        <p className="text-secondary">Chargement des catégories…</p>
      ) : categories.length === 0 ? (
        <div className="custom-panel text-secondary">Aucune catégorie d’options enregistrée.</div>
      ) : (
        <div className="option-category-list">
          {categories.map((category) => {
            const typeLabel =
              category.type === 'text'
                ? 'Champ de texte'
                : category.type === 'image'
                  ? 'Images'
                  : 'Liste de valeurs';
            const targets = category.productCategories ?? ['ready', 'customizable'];
            const targetLabels = targets.map((t) => (t === 'ready' ? 'Prêt à commander' : 'À personnaliser'));
            return (
            <article className="custom-panel option-category-row" key={category.id}>
              <div className="option-category-info">
                <h3 className="h5 option-category-title mb-1">{category.title}</h3>
                <div className="d-flex flex-wrap gap-2 small text-secondary">
                  <span className="badge bg-secondary bg-opacity-15 text-body">{typeLabel}</span>
                  <span>{targetLabels.join(' · ')}</span>
                </div>
              </div>
              <div className="option-values-list">
                {category.type === 'text' ? (
                  <div className="option-value-card">Champ de texte libre</div>
                ) : category.type === 'image' ? (
                  <div className="option-value-card text-secondary">Images (choix et téléversement)</div>
                ) : (
                  category.values.map((value) => (
                    <div className="option-value-card" key={value.id}>
                      {value.imageUrl && <img src={value.imageUrl} alt="" />}
                      <span>{value.label}</span>
                      {category.pricedValues && value.price ? (
                        <span className="option-value-extra">+{formatPrice(value.price)}</span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <div className="option-category-actions">
                <Button
                  type="button"
                  size="sm"
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
                  size="sm"
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
                  size="sm"
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
            </article>
          );})}
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
                      <div className="d-flex align-items-center gap-2">
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
                            variant="outline-danger"
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
                            ×
                          </Button>
                        )}
                      </div>
                      <div className="option-image-control">
                        {value.imageUrl && (
                          <img src={value.imageUrl} alt={`Image pour ${value.label || 'cette valeur'}`} />
                        )}
                        <input
                          className="form-control"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          required={isImageType && !value.imageUrl && !imageFiles[value.id]}
                          aria-label={`${isImageType ? 'Image requise' : 'Image facultative'} pour ${value.label || `la valeur ${index + 1}`}`}
                          onChange={(event) => onSelectImage(value.id, event)}
                        />
                        {imageFiles[value.id] && (
                          <span className="small text-secondary">{imageFiles[value.id].name}</span>
                        )}
                        {value.imageUrl && (
                          <Button
                            type="button"
                            size="sm"
                            variant="link"
                            className="p-0"
                            onClick={() => {
                              updateValue(value.id, { imageUrl: undefined });
                              setImageFiles((current) => {
                                const next = { ...current };
                                delete next[value.id];
                                return next;
                              });
                            }}
                          >
                            Retirer l’image
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Form.Text>
                  {isImageType
                    ? 'Chaque valeur doit avoir une image · JPEG, PNG ou WebP.'
                    : 'Images facultatives · JPEG, PNG ou WebP · optimisées automatiquement.'}
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
