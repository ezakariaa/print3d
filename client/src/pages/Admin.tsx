import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Col, Container, Form, Modal, Row, Table } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  deleteAdminOrder,
  deleteAdminProduct,
  fetchAdminExpenses,
  fetchAdminOptionCategories,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchAdminQuoteFile,
  fetchAdminQuotes,
  fetchAdminUsers,
  fetchUserProfile,
  saveAdminProduct,
  fetchAdminUsers as _fetchAdminUsers,
  updateAdminProductStatus,
  updateAdminOrder,
  updateAdminOrderDelivery,
  updateAdminQuote,
  updateAdminUserStatus,
  type AdminOrder,
  type AdminQuote,
  type Expense,
  type AdminUser,
  type UserProfile,
} from '../api/client';
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  onAuthStateChanged,
  signOutAdmin,
} from '../firebase';
import type { Product, ProductOptionCategory } from '../types';
import { compressImageToDataUrl } from '../utils/compressImage';
import { formatPrice } from '../utils/formatPrice';
import { invalidateCache, readCached, writeCached } from '../utils/localCache';
import { flushCartSync } from '../context/CartContext';
import { getProductImage } from '../utils/productImages';
import { slugify } from '../utils/slugify';
import { AuthModal } from '../components/AuthModal';
import { useWishlist } from '../context/WishlistContext';
import { Paginator, clampPage } from '../components/Paginator';
import { AdminCarriers } from './AdminCarriers';
import { AdminOptions } from './AdminOptions';
import { AdminOrdersTable } from './AdminOrdersTable';
import { AdminServices } from './AdminServices';
import { AdminUsers } from './AdminUsers';
import { AdminSales } from './AdminSales';
import { AdminExpenses } from './AdminExpenses';
import { ClientDashboard } from '../components/ClientDashboard';

type AdminSection = 'users' | 'orders' | 'products' | 'options' | 'quotes' | 'services' | 'carriers' | 'sales' | 'expenses';

// Each management card opens its own page (route), never below the cards.
const ADMIN_SECTIONS: Record<AdminSection, { path: string; title: string; description: string }> = {
  users: { path: '/admin/utilisateurs', title: 'Gestion des utilisateurs', description: 'Consultez les comptes créés et gérez leur accès.' },
  orders: { path: '/admin/commandes', title: 'Gestion des commandes', description: 'Suivez les commandes reçues et mettez à jour leur statut.' },
  products: { path: '/admin/produits', title: 'Gestion des produits', description: 'Ajoutez, modifiez ou retirez les produits de la boutique.' },
  options: { path: '/admin/options', title: 'Gestion des options', description: 'Gérez les catégories et les valeurs des options réutilisables.' },
  quotes: { path: '/admin/devis', title: 'Gestion des devis', description: 'Consultez les demandes de devis et les fichiers envoyés.' },
  services: { path: '/admin/services', title: 'Gestion des services', description: 'Mettez à jour les services proposés par l’atelier.' },
  carriers: { path: '/admin/livraison', title: 'Transporteurs & Livraison', description: 'Gérez les transporteurs, les frais et les zones de livraison.' },
  sales: { path: '/admin/ventes', title: 'Ventes', description: 'Chiffre d’affaires, panier moyen, produits les plus vendus et résultat.' },
  expenses: { path: '/admin/charges', title: 'Charges', description: 'Achats, consommables, électricité, entretien… et leur répartition.' },
};

const emptyProduct = (): Product => ({
  id: '',
  name: '',
  slug: '',
  description: '',
  longDescription: '',
  price: 0,
  category: 'ready',
  material: 'PLA',
  colors: [],
  imageGradient: 'linear-gradient(145deg, #1a2332 0%, #0d9488 55%, #134e4a 100%)',
  tags: [],
  active: true,
});

// Splits raw input on commas and appends new, de-duplicated tags (case-insensitive).
function mergeTags(existing: string[], raw: string): string[] {
  const result = [...existing];
  raw.split(',').forEach((part) => {
    const tag = part.trim();
    if (tag && !result.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      result.push(tag);
    }
  });
  return result;
}

const emptyProfile: UserProfile = {
  firstName: '',
  lastName: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  email: '',
};

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('fr-FR') : '—';
}

type ProductSortField = 'name' | 'category' | 'material' | 'price' | 'createdAt';
const PRODUCT_PAGE_SIZES = [25, 50, 100];
const createdAtFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatCreatedAt(value?: string) {
  return value ? createdAtFormat.format(new Date(value)) : '—';
}

export function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = (Object.keys(ADMIN_SECTIONS) as AdminSection[])
    .find((key) => ADMIN_SECTIONS[key].path === location.pathname) ?? null;
  const isProductPage = section === 'products';
  const isOptionsPage = section === 'options';
  const isUsersPage = section === 'users';
  const isManagementPage = section !== null;
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [showAuth, setShowAuth] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const { count: wishlistCount } = useWishlist();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [optionCategories, setOptionCategories] = useState<ProductOptionCategory[]>([]);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [draft, setDraft] = useState<Product>(emptyProduct);
  const [imagesProcessing, setImagesProcessing] = useState(false);
  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productMaterialFilter, setProductMaterialFilter] = useState('all');
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [productSortField, setProductSortField] = useState<ProductSortField | null>('createdAt');
  const [productSortDirection, setProductSortDirection] = useState<'asc' | 'desc'>('desc');
  const [productPageSize, setProductPageSize] = useState<number>(PRODUCT_PAGE_SIZES[0]);
  const [productPage, setProductPage] = useState(1);
  const [productView, setProductView] = useState<'table' | 'grid'>(() =>
    (localStorage.getItem('admin-product-view') === 'grid' ? 'grid' : 'table'));
  const changeProductView = (view: 'table' | 'grid') => {
    setProductView(view);
    try {
      localStorage.setItem('admin-product-view', view);
    } catch {
      // Ignore storage errors
    }
  };

  // Filtered then sorted catalogue, shared by the table, the counters and the pagination.
  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase();
    const list = products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(term) ||
        product.description.toLowerCase().includes(term);
      const matchesCategory = productCategoryFilter === 'all' || product.category === productCategoryFilter;
      const matchesMaterial = productMaterialFilter === 'all' || product.material === productMaterialFilter;
      const matchesStatus =
        productStatusFilter === 'all' ||
        (productStatusFilter === 'active' && product.active !== false) ||
        (productStatusFilter === 'inactive' && product.active === false);
      return matchesSearch && matchesCategory && matchesMaterial && matchesStatus;
    });
    if (!productSortField) return list;
    const direction = productSortDirection === 'asc' ? 1 : -1;
    const valueOf = (product: Product): string | number => {
      const value = product[productSortField];
      // Products without a date sort as the oldest.
      if (productSortField === 'createdAt') return value ?? '';
      return typeof value === 'string' ? value.toLowerCase() : (value ?? 0);
    };
    return [...list].sort((a, b) => {
      const valA = valueOf(a);
      const valB = valueOf(b);
      if (valA < valB) return -direction;
      if (valA > valB) return direction;
      return 0;
    });
  }, [products, productSearch, productCategoryFilter, productMaterialFilter, productStatusFilter, productSortField, productSortDirection]);

  // Any filter, sort or page-size change starts again from the first page.
  useEffect(() => {
    setProductPage(1);
  }, [productSearch, productCategoryFilter, productMaterialFilter, productStatusFilter, productSortField, productSortDirection, productPageSize]);

  const currentProductPage = clampPage(productPage, filteredProducts.length, productPageSize);
  const productPageCount = Math.ceil(filteredProducts.length / productPageSize);
  const pageProducts = filteredProducts.slice(
    (currentProductPage - 1) * productPageSize,
    currentProductPage * productPageSize,
  );

  const toggleProductSort = (field: ProductSortField) => {
    if (productSortField === field) {
      setProductSortDirection(productSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setProductSortField(field);
      // Dates read most naturally newest first.
      setProductSortDirection(field === 'createdAt' ? 'desc' : 'asc');
    }
  };
  const sortArrow = (field: ProductSortField) => (
    productSortField === field ? (productSortDirection === 'asc' ? '▲' : '▼') : '↕'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      setSignedIn(Boolean(user && !user.isAnonymous));
      setAuthReady(true);
    });
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Profile first: show the cached copy instantly, then refresh it from the server.
      const currentUser = getFirebaseAuth().currentUser;
      const profileKey = currentUser ? `profile:${currentUser.uid}` : null;
      const cachedProfile = profileKey ? readCached<UserProfile>(profileKey) : null;
      if (cachedProfile) setProfile(cachedProfile);

      let userProfile: UserProfile | null = cachedProfile;
      try {
        const fresh = await fetchUserProfile();
        userProfile = { ...fresh, email: fresh.email || currentUser?.email || '' };
        setProfile(userProfile);
        if (profileKey) writeCached(profileKey, userProfile);
      } catch (err) {
        if (!cachedProfile) throw err;
      }

      // 2. Admin data only for the administrator: regular users would get a 403.
      if (userProfile?.role !== 'Administrateur') return;
      const [productList, orderList, quoteList, userList, categoryList, expenseList] = await Promise.all([
        fetchAdminProducts(),
        fetchAdminOrders(),
        fetchAdminQuotes(),
        fetchAdminUsers(),
        fetchAdminOptionCategories(),
        fetchAdminExpenses(),
      ]);
      setProducts(productList);
      setOrders(orderList);
      setQuotes(quoteList);
      setUsers(userList);
      setOptionCategories(categoryList);
      setExpenses(expenseList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les données admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (signedIn) void loadData();
  }, [signedIn]);

  const isAdmin = profile.role === 'Administrateur';

  // Management pages are for the administrator only: send other accounts back to their space.
  useEffect(() => {
    if (signedIn && section && profile.role && profile.role !== 'Administrateur') {
      navigate('/admin', { replace: true });
    }
  }, [signedIn, section, profile.role, navigate]);

  useEffect(() => {
    if (!signedIn) return;
    const previousTitle = document.title;
    document.title = isAdmin ? 'Espace Administrateur' : 'Mon profil';
    return () => { document.title = previousTitle; };
  }, [signedIn, isAdmin]);

  const onLogout = async () => {
    try {
      // Save the last cart change to the account while the session is still valid.
      await flushCartSync();
      await signOutAdmin();
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err);
    } finally {
      setSignedIn(false);
      setShowAuth(false);
      setProducts([]);
      setUsers([]);
      setOrders([]);
      setQuotes([]);
      setProfile(emptyProfile);
      invalidateCache('profile:');
      navigate('/admin', { replace: true });
    }
  };

  const showError = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
  };

  const onSaveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const isNew = editingId === null;
      const productId = editingId === null ? draft.slug.trim() : draft.id;
      const product = {
        ...draft,
        id: productId,
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        tags: mergeTags(draft.tags, tagInput),
        images: draft.images ?? [],
        active: draft.active !== false,
      };
      await saveAdminProduct(product, isNew);
      setDraft(emptyProduct());
      setTagInput('');
      setEditingId(null);
      setShowProductModal(false);
      setNotice('Produit enregistré.');
      await loadData();
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  // Options may have been added or changed in "Gestion des options" since the page loaded.
  const refreshOptionCategories = () => {
    fetchAdminOptionCategories()
      .then(setOptionCategories)
      .catch((err: unknown) => console.warn('Rechargement des options impossible :', err));
  };

  const openNewProductModal = () => {
    setDraft(emptyProduct());
    setTagInput('');
    setEditingId(null);
    setError('');
    refreshOptionCategories();
    setShowProductModal(true);
  };

  const openEditProductModal = (product: Product) => {
    setDraft({ ...product, active: product.active !== false });
    setTagInput('');
    setEditingId(product.id);
    setError('');
    refreshOptionCategories();
    setShowProductModal(true);
  };

  const onSelectProductImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError('Les images doivent être au format JPEG, PNG ou WebP.');
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > 8 * 1024 * 1024)) {
      setError('Chaque image doit peser au maximum 8 Mo.');
      return;
    }
    if ((draft.images?.length ?? 0) + files.length > 8) {
      setError('Vous pouvez ajouter jusqu’à 8 images par produit.');
      return;
    }
    setError('');
    setImagesProcessing(true);
    try {
      const encoded = await Promise.all(
        files.map((file) => compressImageToDataUrl(file, { maxSize: 1200, quality: 0.82 })),
      );
      setDraft((current) => ({ ...current, images: [...(current.images ?? []), ...encoded] }));
    } catch (err) {
      showError(err);
    } finally {
      setImagesProcessing(false);
    }
  };

  const moveProductImage = (from: number, to: number) => {
    setDraft((current) => {
      const images = [...(current.images ?? [])];
      if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return current;
      const [moved] = images.splice(from, 1);
      images.splice(to, 0, moved);
      return { ...current, images };
    });
  };

  const onDuplicateProduct = async (product: Product) => {
    setLoading(true);
    setError('');
    try {
      const baseSlug = `${product.slug}-copie`;
      const existingSlugs = new Set(products.map((p) => p.slug));
      let newSlug = baseSlug;
      if (existingSlugs.has(newSlug)) {
        newSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }
      const duplicated: Product = {
        ...product,
        id: newSlug,
        slug: newSlug,
        name: `${product.name} (Copie)`,
        active: product.active !== false,
      };
      await saveAdminProduct(duplicated, true);
      setNotice('Produit dupliqué.');
      await loadData();
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleProductStatus = async (id: string, active: boolean) => {
    try {
      await updateAdminProductStatus(id, active);
      setProducts((current) => current.map((item) => (item.id === id ? { ...item, active } : item)));
      setNotice(active ? 'Produit activé (visible en boutique).' : 'Produit désactivé (masqué en boutique).');
      await loadData();
    } catch (err) {
      showError(err);
    }
  };

  const onDeleteProduct = async (product: Product) => {
    if (!window.confirm(`Supprimer « ${product.name} » de la boutique ?`)) return;
    setError('');
    try {
      await deleteAdminProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setNotice('Produit retiré de la boutique.');
    } catch (err) {
      showError(err);
    }
  };

  const toggleUserStatus = async (uid: string, disabled: boolean) => {
    try {
      await updateAdminUserStatus(uid, disabled);
      setUsers((current) => current.map((item) => item.uid === uid ? { ...item, disabled } : item));
      setNotice('Statut de l’utilisateur mis à jour.');
    } catch (err) {
      showError(err);
    }
  };

  const changeOrderStatus = async (id: string, status: string) => {
    const previous = orders.find((item) => item.orderId === id)?.status;
    // Show the new status right away; put the old one back if the server refuses.
    setOrders((current) => current.map((item) => item.orderId === id ? { ...item, status } : item));
    try {
      await updateAdminOrder(id, status);
    } catch (err) {
      if (previous) {
        setOrders((current) => current.map((item) => item.orderId === id ? { ...item, status: previous } : item));
      }
      showError(err);
    }
  };

  const changeOrderDelivered = async (id: string, delivered: boolean) => {
    const previous = orders.find((item) => item.orderId === id);
    // Show it right away; put the previous state back if the server refuses.
    setOrders((current) => current.map((item) => item.orderId === id
      ? { ...item, delivered, deliveredAt: delivered ? new Date().toISOString() : null }
      : item));
    try {
      const result = await updateAdminOrderDelivery(id, delivered);
      setOrders((current) => current.map((item) => item.orderId === id
        ? { ...item, delivered, deliveredAt: result.deliveredAt ?? null }
        : item));
    } catch (err) {
      if (previous) setOrders((current) => current.map((item) => item.orderId === id ? previous : item));
      showError(err);
    }
  };

  const removeOrder = async (order: AdminOrder) => {
    const confirmed = window.confirm(
      `Supprimer définitivement la commande ${order.orderId} de ${order.customer.name} (${formatPrice(order.total)}) ?\n\nElle disparaîtra aussi de l’espace du client.`,
    );
    if (!confirmed) return;
    try {
      await deleteAdminOrder(order.orderId);
      setOrders((current) => current.filter((item) => item.orderId !== order.orderId));
    } catch (err) {
      showError(err);
    }
  };

  const changeQuoteStatus = async (id: string, status: string) => {
    try {
      await updateAdminQuote(id, status);
      setQuotes((current) => current.map((item) => item.quoteId === id ? { ...item, status } : item));
    } catch (err) {
      showError(err);
    }
  };

  const openQuoteFile = async (quote: AdminQuote) => {
    const newTab = window.open('about:blank', '_blank');
    if (!newTab) {
      setError('Autorise les fenêtres pop-up pour ouvrir le fichier.');
      return;
    }
    try {
      const { url } = await fetchAdminQuoteFile(quote.quoteId);
      newTab.location.href = url;
    } catch (err) {
      newTab.close();
      showError(err);
    }
  };

  const colorCategory = optionCategories.find((category) => {
    const key = `${category.id} ${category.title}`.toLowerCase();
    const appliesToProduct = category.productCategories?.includes(draft.category) ?? true;
    const isValueList = category.type === undefined || category.type === 'values';
    return isValueList && appliesToProduct && (key.includes('couleur') || key.includes('color'));
  });
  const colorOptions = colorCategory?.values ?? [];
  // Options that can be shown on this product's page: those set for its category
  // ("Prêt à commander" or "À personnaliser"). Colours have their own picker above.
  const productOptionChoices = optionCategories.filter((category) => {
    const key = `${category.id} ${category.title}`.toLowerCase();
    const isValueList = category.type === undefined || category.type === 'values';
    const isColor = isValueList && (key.includes('couleur') || key.includes('color'));
    return !isColor && (category.productCategories?.includes(draft.category) ?? true);
  });
  const availableColors = colorOptions.filter((option) => !draft.colors.includes(option.label));

  const profileInitials = `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`
    .toUpperCase() || (profile.email.charAt(0).toUpperCase() || 'U');
  const profileName = `${profile.firstName} ${profile.lastName}`.trim();
  const profileEmail = profile.email || '—';

  if (!isFirebaseConfigured) {
    return (
      <Container className="page-hero pb-5">
        <h1>Espace Client</h1>
        <Alert variant="warning">
          Firebase n’est pas encore configuré. Ajoute les paramètres du projet dans les variables
          d’environnement du client, puis active Authentication, Firestore et Storage.
        </Alert>
      </Container>
    );
  }

  if (!authReady) {
    return <Container className="page-hero pb-5"><p className="text-secondary">Vérification de la session…</p></Container>;
  }

  if (!signedIn) {
    return (
      <Container className="page-hero pb-5">
        <h1>Espace Client</h1>
        <p className="section-lead mb-4">Connectez-vous ou créez un compte pour accéder à votre espace.</p>
        <Button className="btn-brand px-4" onClick={() => setShowAuth(true)}>Se connecter</Button>
        <AuthModal show={showAuth} onHide={() => setShowAuth(false)} />
      </Container>
    );
  }

  return (
    <Container className="page-hero pb-5">
      <header className="admin-header">
        <div className="admin-header-text">
          {isManagementPage && (
            <nav className="admin-breadcrumb" aria-label="Fil d’Ariane">
              <Link to="/admin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Espace {isAdmin ? 'administrateur' : 'client'}
              </Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{section ? ADMIN_SECTIONS[section].title : ''}</span>
            </nav>
          )}
          <h1 className="mb-1">
            {section
              ? ADMIN_SECTIONS[section].title
              : isAdmin
                ? 'Espace Administrateur'
                : 'Mon profil'}
          </h1>
          <p className="text-secondary mb-0">
            {section
              ? ADMIN_SECTIONS[section].description
              : isAdmin
                ? 'Gestion des produits, commandes, devis, services et livraisons.'
                : 'Consultez et gérez vos informations personnelles.'}
          </p>
        </div>
        <div className="admin-header-actions">
          {/* Options, services and carriers load their own data (and have their own refresh). */}
          {!(section === 'options' || section === 'services' || section === 'carriers') && (
          <button
            type="button"
            className={`admin-header-btn${loading ? ' is-loading' : ''}`}
            onClick={() => void loadData()}
            disabled={loading}
            title="Actualiser les données"
            aria-label="Actualiser les données"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 4v5h-5" />
            </svg>
          </button>
          )}
          <button type="button" className="admin-header-btn is-logout" onClick={onLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Déconnexion</span>
          </button>
        </div>
      </header>
      {error && !showProductModal && (
        <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>
      )}
      {notice && <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
      {!isManagementPage && (
        <ClientDashboard
          isAdmin={isAdmin}
          profile={profile}
          profileName={profileName}
          profileEmail={profileEmail}
          profileInitials={profileInitials}
          wishlistCount={wishlistCount}
          orders={orders}
          products={products}
          quotes={quotes}
          users={users}
          expenses={expenses}
          sections={ADMIN_SECTIONS}
        />
      )}

      {loading && <p className="text-secondary">Chargement…</p>}
      {isUsersPage && (
        <AdminUsers users={users} onToggle={(uid, disabled) => void toggleUserStatus(uid, disabled)} />
      )}

      {section === 'orders' && (
        <AdminOrdersTable
          orders={orders}
          products={products}
          onStatusChange={(orderId, status) => void changeOrderStatus(orderId, status)}
          onDeliveredChange={(orderId, delivered) => void changeOrderDelivered(orderId, delivered)}
          onOrderSaved={(saved) => setOrders((current) => current.map((item) => item.orderId === saved.orderId ? saved : item))}
          onDelete={(order) => void removeOrder(order)}
        />
      )}

      {section === 'quotes' && (
        <div className="table-responsive custom-panel admin-product-panel">
          <Table hover className="align-middle mb-0 admin-product-table">
            <thead><tr><th>Client</th><th>Projet</th><th>Fichier</th><th>Date</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.quoteId}>
                  <td>{quote.name}<br /><small>{quote.email}</small></td>
                  <td>{quote.message}</td>
                  <td>{quote.fileName || 'Sans fichier'}<br />{quote.fileSize > 0 && <small>{(quote.fileSize / (1024 * 1024)).toFixed(1)} Mo</small>}</td>
                  <td>{dateLabel(quote.createdAt)}</td>
                  <td>
                    <Form.Select value={quote.status} onChange={(event) => void changeQuoteStatus(quote.quoteId, event.target.value)}>
                      <option value="new">Nouveau</option>
                      <option value="reviewing">En étude</option>
                      <option value="quoted">Devis envoyé</option>
                      <option value="closed">Clôturé</option>
                    </Form.Select>
                  </td>
                  <td>{quote.fileName && <Button size="sm" variant="outline-light" onClick={() => void openQuoteFile(quote)}>Télécharger</Button>}</td>
                </tr>
              ))}
              {quotes.length === 0 && <tr><td colSpan={6} className="text-secondary">Aucune demande de devis.</td></tr>}
            </tbody>
          </Table>
        </div>
      )}

      {isProductPage && (
        <section>
          <div className="prod-stats">
            {([
              { key: 'all', label: 'Produits', value: products.length, onClick: () => { setProductStatusFilter('all'); setProductCategoryFilter('all'); } },
              { key: 'active', label: 'Actifs', value: products.filter((p) => p.active !== false).length, onClick: () => setProductStatusFilter('active') },
              { key: 'inactive', label: 'Inactifs', value: products.filter((p) => p.active === false).length, onClick: () => setProductStatusFilter('inactive') },
              { key: 'custom', label: 'À personnaliser', value: products.filter((p) => p.category === 'customizable').length, onClick: () => setProductCategoryFilter('customizable') },
            ]).map((stat) => (
              <button key={stat.key} type="button" className={`prod-stat is-${stat.key}`} onClick={stat.onClick}>
                <span className="prod-stat-value">{stat.value}</span>
                <span className="prod-stat-label">{stat.label}</span>
              </button>
            ))}
          </div>

          <div className="prod-toolbar">
            <div className="shop-search prod-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <Form.Control
                type="search"
                placeholder="Rechercher par nom ou description…"
                aria-label="Rechercher un produit"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="featured-tabs" role="tablist" aria-label="Statut">
              {([
                { value: 'all', label: 'Tous', count: products.length },
                { value: 'active', label: 'Actifs', count: products.filter((p) => p.active !== false).length },
                { value: 'inactive', label: 'Inactifs', count: products.filter((p) => p.active === false).length },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={productStatusFilter === tab.value}
                  className={`featured-tab${productStatusFilter === tab.value ? ' is-active' : ''}`}
                  onClick={() => setProductStatusFilter(tab.value)}
                >
                  {tab.label}
                  <span className="featured-tab-count">{tab.count}</span>
                </button>
              ))}
            </div>
            <Button className="btn-brand prod-add" onClick={openNewProductModal}>+ Ajouter un produit</Button>
          </div>

          <div className="prod-filters">
            <Form.Select
              size="sm"
              aria-label="Catégorie"
              value={productCategoryFilter}
              onChange={(e) => setProductCategoryFilter(e.target.value)}
            >
              <option value="all">Toutes les catégories</option>
              <option value="ready">Prêt à l’emploi</option>
              <option value="customizable">Personnalisable</option>
            </Form.Select>
            <Form.Select
              size="sm"
              aria-label="Matériau"
              value={productMaterialFilter}
              onChange={(e) => setProductMaterialFilter(e.target.value)}
            >
              <option value="all">Tous les matériaux</option>
              {Array.from(new Set(products.map((p) => p.material))).filter(Boolean).map((mat) => (
                <option key={mat} value={mat}>{mat}</option>
              ))}
            </Form.Select>
            <Form.Select
              size="sm"
              aria-label="Nombre de produits par page"
              value={productPageSize}
              onChange={(e) => setProductPageSize(Number(e.target.value))}
            >
              {PRODUCT_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} par page</option>
              ))}
            </Form.Select>
            <span className="prod-count">{filteredProducts.length} résultat{filteredProducts.length > 1 ? 's' : ''}</span>
            <div className="prod-view" role="group" aria-label="Affichage">
              <button
                type="button"
                className={productView === 'table' ? 'is-active' : ''}
                aria-pressed={productView === 'table'}
                title="Tableau"
                onClick={() => changeProductView('table')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                <span>Tableau</span>
              </button>
              <button
                type="button"
                className={productView === 'grid' ? 'is-active' : ''}
                aria-pressed={productView === 'grid'}
                title="Grille"
                onClick={() => changeProductView('grid')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
                </svg>
                <span>Grille</span>
              </button>
            </div>
          </div>

          {productView === 'grid' && (
            <div className="prod-grid">
              {filteredProducts.length === 0 && (
                <div className="custom-panel text-secondary text-center py-5">Aucun produit ne correspond aux critères de recherche.</div>
              )}
              {pageProducts.map((product) => {
                const image = getProductImage(product.slug, product.images);
                return (
                  <article key={product.id} className={`prod-card${product.active === false ? ' is-inactive' : ''}`}>
                    <button
                      type="button"
                      className="prod-card-visual"
                      style={{ background: product.imageGradient }}
                      onClick={() => setPreviewProduct(product)}
                      aria-label={`Aperçu de ${product.name}`}
                    >
                      {image && <img src={image} alt="" loading="lazy" />}
                      {(product.images?.length ?? 0) > 1 && <span className="prod-card-count">{product.images!.length} photos</span>}
                      <span className={`admin-product-category prod-card-category${product.category === 'customizable' ? ' is-custom' : ''}`}>
                        {product.category === 'ready' ? 'Prêt à l’emploi' : 'Personnalisable'}
                      </span>
                    </button>
                    <div className="prod-card-body">
                      <h3 className="prod-card-name">{product.name}</h3>
                      <div className="prod-card-meta">
                        <span className="admin-product-price">{formatPrice(product.price)}</span>
                        <span>{product.material} · {formatCreatedAt(product.createdAt)}</span>
                      </div>
                    </div>
                    <div className="prod-card-foot">
                      <Form.Check
                        type="switch"
                        id={`product-grid-status-${product.id}`}
                        label={product.active !== false ? 'Actif' : 'Inactif'}
                        checked={product.active !== false}
                        onChange={(e) => void toggleProductStatus(product.id, e.target.checked)}
                      />
                      <div>
                        <Button variant="link" className="admin-icon-btn" title="Modifier" aria-label={`Modifier ${product.name}`} onClick={() => openEditProductModal(product)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </Button>
                        <Button variant="link" className="admin-icon-btn" title="Dupliquer" aria-label={`Dupliquer ${product.name}`} onClick={() => void onDuplicateProduct(product)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </Button>
                        <Button variant="link" className="admin-icon-btn admin-icon-btn-danger" title="Supprimer" aria-label={`Supprimer ${product.name}`} onClick={() => void onDeleteProduct(product)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {productView === 'table' && (
          <div className="table-responsive custom-panel admin-product-panel">
            <Table hover className="align-middle mb-0 admin-product-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleProductSort('name')}
                  >
                    Produit {sortArrow('name')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleProductSort('category')}
                  >
                    Catégorie {sortArrow('category')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleProductSort('material')}
                  >
                    Matériau {sortArrow('material')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleProductSort('price')}
                  >
                    Prix {sortArrow('price')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleProductSort('createdAt')}
                  >
                    Créé le {sortArrow('createdAt')}
                  </th>
                  <th>Statut</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageProducts
                  .map((product) => {
                  const image = getProductImage(product.slug, product.images);
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="admin-product-thumb" style={{ background: product.imageGradient }}>
                          {image && <img src={image} alt="" />}
                          {(product.images?.length ?? 0) > 0 && (
                            <span
                              className="admin-product-thumb-count"
                              title={`${product.images!.length} image(s)`}
                            >
                              {product.images!.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">{product.name}</div>
                        <small className="text-secondary">{product.slug}</small>
                        {product.tags.length > 0 && (
                          <div className="prod-tags">
                            {product.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                            {product.tags.length > 3 && <span>+{product.tags.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`admin-product-category${product.category === 'customizable' ? ' is-custom' : ''}`}>
                          {product.category === 'ready' ? 'Prêt à l’emploi' : 'Personnalisable'}
                        </span>
                      </td>
                      <td className="text-secondary">{product.material}</td>
                      <td className="admin-product-price">{formatPrice(product.price)}</td>
                      <td className="text-secondary text-nowrap">{formatCreatedAt(product.createdAt)}</td>
                      <td>
                        <Form.Check
                          type="switch"
                          id={`product-status-${product.id}`}
                          label={product.active !== false ? 'Actif' : 'Inactif'}
                          checked={product.active !== false}
                          onChange={(e) => void toggleProductStatus(product.id, e.target.checked)}
                        />
                      </td>
                      <td className="text-end text-nowrap">
                        <Button
                          size="sm"
                          variant="link"
                          className="admin-icon-btn"
                          title="Modifier"
                          aria-label={`Modifier ${product.name}`}
                          onClick={() => openEditProductModal(product)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </Button>
                        <Button
                          size="sm"
                          variant="link"
                          className="admin-icon-btn"
                          title="Dupliquer"
                          aria-label={`Dupliquer ${product.name}`}
                          onClick={() => void onDuplicateProduct(product)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </Button>
                        <Button
                          size="sm"
                          variant="link"
                          className="admin-icon-btn"
                          title="Aperçu"
                          aria-label={`Aperçu de ${product.name}`}
                          onClick={() => setPreviewProduct(product)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Button>
                        <Button
                          size="sm"
                          variant="link"
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Supprimer"
                          aria-label={`Supprimer ${product.name}`}
                          onClick={() => void onDeleteProduct(product)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={8} className="text-secondary">Aucun produit ne correspond aux critères de recherche.</td></tr>
                )}
              </tbody>
            </Table>
          </div>
          )}
          {filteredProducts.length > 0 && (
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
              <small className="text-secondary">
                {(currentProductPage - 1) * productPageSize + 1}–{Math.min(currentProductPage * productPageSize, filteredProducts.length)} sur {filteredProducts.length} produits
              </small>
              <Paginator page={currentProductPage} pageCount={productPageCount} onChange={setProductPage} />
            </div>
          )}
        </section>
      )}
      <Modal
        show={previewProduct !== null}
        onHide={() => setPreviewProduct(null)}
        size="lg"
        centered
        scrollable
      >
        {previewProduct && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>{previewProduct.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="product-preview-gallery mb-4" style={{ background: previewProduct.imageGradient }}>
                {(previewProduct.images?.length ?? 0) > 0 ? (
                  previewProduct.images!.map((image, index) => (
                    <img key={index} src={image} alt={`${previewProduct.name} – photo ${index + 1}`} />
                  ))
                ) : (
                  <span className="product-preview-empty">Aucune photo</span>
                )}
              </div>
              <dl className="product-preview-details">
                <dt>Identifiant</dt>
                <dd><code>{previewProduct.id}</code></dd>
                <dt>Slug</dt>
                <dd><code>{previewProduct.slug}</code></dd>
                <dt>Statut</dt>
                <dd>
                  <span className={`badge ${previewProduct.active !== false ? 'bg-success' : 'bg-secondary'}`}>
                    {previewProduct.active !== false ? 'Actif (affiché en boutique)' : 'Inactif (masqué)'}
                  </span>
                </dd>
                <dt>Prix</dt>
                <dd className="fw-semibold">{formatPrice(previewProduct.price)}</dd>
                <dt>Catégorie</dt>
                <dd>
                  <span className={`admin-product-category${previewProduct.category === 'customizable' ? ' is-custom' : ''}`}>
                    {previewProduct.category === 'ready' ? 'Prêt à l’emploi' : 'Personnalisable'}
                  </span>
                </dd>
                <dt>Matière</dt>
                <dd>{previewProduct.material}</dd>
                <dt>Couleurs</dt>
                <dd>
                  {previewProduct.colors.length === 0 ? (
                    <span className="text-secondary">—</span>
                  ) : (
                    <div className="color-tag-list">
                      {previewProduct.colors.map((color) => {
                        const option = colorOptions.find((item) => item.label === color);
                        return (
                          <span key={color} className="color-tag color-tag-static">
                            {option?.imageUrl && <img src={option.imageUrl} alt="" />}
                            {color}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </dd>
                <dt>Tags</dt>
                <dd>
                  {previewProduct.tags.length === 0 ? (
                    <span className="text-secondary">—</span>
                  ) : (
                    <div className="color-tag-list">
                      {previewProduct.tags.map((tag) => (
                        <span key={tag} className="color-tag color-tag-static tag-neutral">{tag}</span>
                      ))}
                    </div>
                  )}
                </dd>
                {previewProduct.customOptions && (
                  <>
                    <dt>Personnalisation</dt>
                    <dd>
                      {[
                        previewProduct.customOptions.text && 'Texte',
                        previewProduct.customOptions.color && 'Couleur',
                        previewProduct.customOptions.size && 'Taille',
                      ].filter(Boolean).join(', ') || <span className="text-secondary">—</span>}
                    </dd>
                  </>
                )}
                <dt>Description courte</dt>
                <dd>{previewProduct.description || <span className="text-secondary">—</span>}</dd>
                <dt>Description détaillée</dt>
                <dd className="product-preview-long">{previewProduct.longDescription || <span className="text-secondary">—</span>}</dd>
              </dl>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-light" onClick={() => navigate(`/produit/${previewProduct.slug}`)}>
                Voir sur la boutique
              </Button>
              <Button
                className="btn-brand"
                onClick={() => {
                  const product = previewProduct;
                  setPreviewProduct(null);
                  openEditProductModal(product);
                }}
              >
                Modifier
              </Button>
            </Modal.Footer>
          </>
        )}
      </Modal>
      <Modal
        show={showProductModal}
        onHide={() => setShowProductModal(false)}
        size="lg"
        centered
        scrollable
      >
        <Form onSubmit={onSaveProduct}>
          <Modal.Header closeButton>
            <Modal.Title>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && (
              <Alert variant="warning" dismissible onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Nom</Form.Label>
              <Form.Control
                required
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft({ ...draft, name, ...(editingId === null ? { slug: slugify(name) } : {}) });
                }}
              />
              <Form.Text>
                Identifiant URL :{' '}
                {draft.slug ? <code>{draft.slug}</code> : <span className="text-secondary">généré à partir du nom</span>}
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description courte</Form.Label>
              <Form.Control required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description détaillée</Form.Label>
              <Form.Control as="textarea" rows={6} required value={draft.longDescription} onChange={(event) => setDraft({ ...draft, longDescription: event.target.value })} />
              <Form.Text>Les retours à la ligne sont conservés sur la fiche produit.</Form.Text>
            </Form.Group>
            <Row className="g-3">
              <Col xs={6}>
                <Form.Label>Prix (DH)</Form.Label>
                <Form.Control type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} required />
              </Col>
              <Col xs={6}>
                <Form.Label>Matière</Form.Label>
                <Form.Control required value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} />
              </Col>
              <Col xs={12}>
                <Form.Label>Catégorie</Form.Label>
                <Form.Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Product['category'] })}>
                  <option value="ready">Prêt à commander</option>
                  <option value="customizable">À personnaliser</option>
                </Form.Select>
              </Col>
              <Col xs={12}>
                <Form.Label>Statut</Form.Label>
                <Form.Check
                  type="switch"
                  id="draft-product-active"
                  label={draft.active !== false ? 'Actif (affiché en boutique)' : 'Inactif (masqué en boutique)'}
                  checked={draft.active !== false}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
              </Col>
              <Col xs={12}>
                <Form.Label>Couleurs</Form.Label>
                {colorOptions.length === 0 ? (
                  <div className="form-text">
                    Aucune couleur disponible. Créez d’abord une catégorie « Couleurs » dans{' '}
                    <Link to="/admin/options">Gestion des options</Link>.
                  </div>
                ) : (
                  <>
                    <Form.Select
                      value=""
                      aria-label="Ajouter une couleur"
                      onChange={(event) => {
                        const label = event.target.value;
                        if (label && !draft.colors.includes(label)) {
                          setDraft({ ...draft, colors: [...draft.colors, label] });
                        }
                      }}
                    >
                      <option value="">
                        {availableColors.length === 0 ? 'Toutes les couleurs sont sélectionnées' : 'Ajouter une couleur…'}
                      </option>
                      {availableColors.map((option) => (
                        <option key={option.id} value={option.label}>{option.label}</option>
                      ))}
                    </Form.Select>
                    {draft.colors.length > 0 && (
                      <div className="color-tag-list mt-2">
                        {draft.colors.map((color) => {
                          const option = colorOptions.find((item) => item.label === color);
                          return (
                            <span key={color} className="color-tag">
                              {option?.imageUrl && <img src={option.imageUrl} alt="" />}
                              {color}
                              <button
                                type="button"
                                aria-label={`Retirer ${color}`}
                                onClick={() => setDraft({ ...draft, colors: draft.colors.filter((item) => item !== color) })}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </Col>
              <Col xs={12}>
                <Form.Label>Tags</Form.Label>
                <Form.Control
                  value={tagInput}
                  placeholder="Ex. cadeau, bureau, déco"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.includes(',')) {
                      setDraft({ ...draft, tags: mergeTags(draft.tags, value) });
                      setTagInput('');
                    } else {
                      setTagInput(value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (tagInput.trim()) {
                        setDraft({ ...draft, tags: mergeTags(draft.tags, tagInput) });
                        setTagInput('');
                      }
                    } else if (event.key === 'Backspace' && tagInput === '' && draft.tags.length > 0) {
                      setDraft({ ...draft, tags: draft.tags.slice(0, -1) });
                    }
                  }}
                  onBlur={() => {
                    if (tagInput.trim()) {
                      setDraft({ ...draft, tags: mergeTags(draft.tags, tagInput) });
                      setTagInput('');
                    }
                  }}
                />
                <Form.Text>Tapez une virgule ou Entrée pour ajouter un tag.</Form.Text>
                {draft.tags.length > 0 && (
                  <div className="color-tag-list mt-2">
                    {draft.tags.map((tag) => (
                      <span key={tag} className="color-tag tag-neutral">
                        {tag}
                        <button
                          type="button"
                          aria-label={`Retirer ${tag}`}
                          onClick={() => setDraft({ ...draft, tags: draft.tags.filter((item) => item !== tag) })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Col>
              <Col xs={12}>
                <Form.Group>
                  <Form.Label>Photos du produit</Form.Label>
                  <Form.Control
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={onSelectProductImages}
                  />
                  <Form.Text>
                    JPEG, PNG ou WebP · jusqu’à 8 photos · optimisées automatiquement.
                    {' '}Glissez-déposez pour réordonner : la première photo est la photo principale.
                  </Form.Text>
                </Form.Group>
                {imagesProcessing && <p className="small text-secondary mt-2 mb-0">Optimisation des images…</p>}
                {(draft.images?.length ?? 0) > 0 && (
                  <div className="admin-product-image-list mt-3" role="list">
                    {draft.images?.map((image, index) => {
                      const total = draft.images?.length ?? 0;
                      return (
                        <div
                          key={`${index}-${image.slice(-40)}`}
                          role="listitem"
                          className={`admin-product-image-item${index === 0 ? ' is-primary' : ''}${dragImageIndex === index ? ' is-dragging' : ''}`}
                          draggable
                          onDragStart={(event) => {
                            setDragImageIndex(index);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragImageIndex !== null) moveProductImage(dragImageIndex, index);
                            setDragImageIndex(null);
                          }}
                          onDragEnd={() => setDragImageIndex(null)}
                        >
                          <div className="admin-product-image-frame">
                            <img src={image} alt={`Photo ${index + 1} de ${draft.name || 'ce produit'}`} />
                            {index === 0 && <span className="admin-product-image-badge">Principale</span>}
                            <span className="admin-product-image-order">{index + 1}</span>
                          </div>
                          <div className="admin-product-image-actions">
                            <button
                              type="button"
                              className="admin-icon-btn btn btn-link"
                              aria-label="Déplacer vers la gauche"
                              title="Déplacer vers la gauche"
                              disabled={index === 0}
                              onClick={() => moveProductImage(index, index - 1)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn btn btn-link"
                              aria-label="Déplacer vers la droite"
                              title="Déplacer vers la droite"
                              disabled={index === total - 1}
                              onClick={() => moveProductImage(index, index + 1)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-danger btn btn-link"
                              aria-label="Retirer cette photo"
                              title="Retirer"
                              onClick={() => setDraft({
                                ...draft,
                                images: draft.images?.filter((_, imageIndex) => imageIndex !== index),
                              })}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Col>
                <Col xs={12}>
                  <Form.Label>Options du produit (Gestion des options)</Form.Label>
                  <div className="form-text mb-2">
                    Cochez les options issues de <Link to="/admin/options">Gestion des options</Link> à afficher sur la fiche de ce produit :
                  </div>
                  {productOptionChoices.length === 0 ? (
                    <div className="text-secondary small mb-3">
                      Aucune option configurée pour « {draft.category === 'ready' ? 'Prêt à commander' : 'À personnaliser'} » dans Gestion des options.
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2 mb-3">
                      {productOptionChoices
                        .map((category) => {
                          const customOpts = draft.customOptions as Record<string, unknown> | undefined;
                          const optionKey = `opt_${category.id}`;
                          const isChecked = Boolean(customOpts?.[optionKey]);
                          return (
                            <Form.Check
                              key={category.id}
                              id={`product-option-${category.id}`}
                              type="checkbox"
                              label={`${category.title} (${category.type === 'text' ? 'Texte' : category.type === 'image' ? 'Images' : 'Liste'})`}
                              checked={isChecked}
                              onChange={(event) => setDraft({
                                ...draft,
                                customOptions: {
                                  ...draft.customOptions,
                                  [optionKey]: event.target.checked,
                                },
                              })}
                            />
                          );
                        })}
                    </div>
                  )}
                </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-light" type="button" onClick={() => setShowProductModal(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand" disabled={loading || imagesProcessing || !draft.slug}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
      {isOptionsPage && <AdminOptions />}
      {section === 'carriers' && <AdminCarriers />}
      {section === 'services' && <AdminServices />}
      {section === 'sales' && <AdminSales orders={orders} expenses={expenses} />}
      {section === 'expenses' && <AdminExpenses expenses={expenses} onChange={setExpenses} />}
    </Container>
  );
}
