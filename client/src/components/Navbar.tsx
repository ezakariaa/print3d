import { useEffect, useState, type MouseEvent } from 'react';
import { Container, Nav, Navbar as BsNavbar, Badge } from 'react-bootstrap';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';
import { AuthModal } from './AuthModal';
import { formatPrice } from '../utils/formatPrice';

export function Navbar() {
  const { count, total } = useCart();
  const { count: wishlistCount } = useWishlist();
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => setSignedIn(Boolean(user && !user.isAnonymous)));
  }, []);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('site-theme') === 'dark' ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('site-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const close = () => setExpanded(false);

  return (
    <BsNavbar
      expand="lg"
      fixed="top"
      className={`site-nav${scrolled || expanded ? ' is-solid' : ''}`}
      expanded={expanded}
      onToggle={setExpanded}
    >
      <Container>
        <BsNavbar.Brand as={Link} to="/" onClick={close}>
          Print<span className="brand-red">Ma</span><span>3D</span>
        </BsNavbar.Brand>
        <BsNavbar.Toggle aria-controls="main-nav" />
        <BsNavbar.Collapse id="main-nav">
          <Nav className="ms-auto align-items-lg-center gap-lg-1">
            <Nav.Link as={NavLink} to="/boutique" onClick={close}>
              Boutique
            </Nav.Link>
            <Nav.Link as={NavLink} to="/personnaliser" onClick={close}>
              Personnaliser
            </Nav.Link>
            <Nav.Link as={NavLink} to="/services" onClick={close}>
              Services
            </Nav.Link>
            <Nav.Link as={NavLink} to="/contact" onClick={close}>
              Contact
            </Nav.Link>
            <Nav.Link
              as={NavLink}
              to="/admin"
              onClick={(event: MouseEvent) => {
                close();
                // Not signed in: open the login window instead of leaving the current page.
                if (isFirebaseConfigured && !signedIn) {
                  event.preventDefault();
                  setShowAuth(true);
                }
              }}
              className="nav-action"
            >
              <span className="nav-action-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.15em"
                  height="1.15em"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  focusable="false"
                >
                  <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6" />
                </svg>
              </span>
              <span className="nav-action-copy">
                <span className="nav-action-title">Espace Client</span>
                <span className="nav-action-detail">Compte et gestion</span>
              </span>
            </Nav.Link>
            <Nav.Link
              as={NavLink}
              to="/wishlist"
              onClick={close}
              className="nav-action nav-wishlist"
              aria-label={`Wishlist, ${wishlistCount} produit${wishlistCount > 1 ? 's' : ''}`}
              title="Ma wishlist"
            >
              <span className="nav-action-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.15em"
                  height="1.15em"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  focusable="false"
                >
                  <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15" />
                </svg>
                <Badge pill bg="danger" className="nav-action-count">
                  {wishlistCount}
                </Badge>
              </span>
              <span className="nav-action-copy d-lg-none" aria-hidden="true">
                <span className="nav-action-title">Wishlist</span>
              </span>
            </Nav.Link>
            <Nav.Link as={NavLink} to="/panier" onClick={close} className="nav-action nav-cart">
              <span className="nav-action-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.15em"
                  height="1.15em"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  focusable="false"
                >
                  <path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .49.598l-1.5 7A.5.5 0 0 1 13 11H4a.5.5 0 0 1-.49-.402L1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.3 6h8.194l1.286-6zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2m7-1a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2" />
                </svg>
                <Badge pill className="nav-action-count">
                  {count}
                </Badge>
              </span>
              <span className="nav-action-copy">
                <span className="nav-action-title">Panier</span>
                <span className="nav-action-detail">{formatPrice(total)}</span>
              </span>
            </Nav.Link>
            <Nav.Item className="theme-switch-item">
              <button
                type="button"
                className="theme-switch"
                aria-label={`Passer au mode ${theme === 'dark' ? 'clair' : 'sombre'}`}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              >
                <span className={`theme-switch-track${theme === 'light' ? ' is-light' : ''}`}>
                  <span className="theme-switch-thumb" />
                </span>
                <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </button>
            </Nav.Item>
          </Nav>
        </BsNavbar.Collapse>
      </Container>
      <AuthModal
        show={showAuth}
        onHide={() => setShowAuth(false)}
        onSignedIn={() => navigate('/admin')}
      />
    </BsNavbar>
  );
}
