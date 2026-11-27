import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { fetchUserProfile, saveUserProfile, type UserProfile } from '../api/client';
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  onAuthStateChanged,
} from '../firebase';

const emptyProfile: UserProfile = {
  firstName: '',
  lastName: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  email: '',
};

type EditableField = 'firstName' | 'lastName' | 'phone' | 'address' | 'city' | 'country';

/** Fields counted in the completion bar, with the label shown when missing. */
const REQUIRED_FIELDS: Array<{ key: EditableField; label: string }> = [
  { key: 'firstName', label: 'Prénom' },
  { key: 'lastName', label: 'Nom' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'address', label: 'Adresse' },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
];

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function Section({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <section className="profile-section">
      <header className="profile-section-head">
        <span className="profile-section-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Breadcrumb() {
  return (
    <nav className="admin-breadcrumb" aria-label="Fil d’Ariane">
      <Link to="/admin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Espace client
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Mon profil</span>
    </nav>
  );
}

/** Profile form: identity card with completion, the three sections and the save bar. */
export function ProfileEditor({ initial, onSave: save }: {
  initial: UserProfile;
  onSave: (profile: Omit<UserProfile, 'email' | 'role'>) => Promise<unknown>;
}) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const setField = (key: EditableField, value: string) => {
    setNotice('');
    setProfile({ ...profile, [key]: value });
  };

  const dirty = REQUIRED_FIELDS.some(({ key }) => profile[key] !== saved[key]);
  const missing = REQUIRED_FIELDS.filter(({ key }) => !saved[key]?.trim());
  const completion = Math.round(((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100);
  const fullName = `${saved.firstName} ${saved.lastName}`.trim();
  const initials = `${saved.firstName.trim().charAt(0)}${saved.lastName.trim().charAt(0)}`.toUpperCase()
    || saved.email.charAt(0).toUpperCase() || '?';

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await save({
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        address: profile.address.trim(),
        city: profile.city.trim(),
        country: profile.country.trim(),
        phone: profile.phone.trim(),
      });
      setSaved(profile);
      setNotice('Votre profil a été enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer le profil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Row className="g-4 align-items-start">
        <Col lg={4}>
          <aside className="profile-card">
            <div className="profile-card-identity">
              <div className="profile-card-avatar" aria-hidden="true">{initials}</div>
              <div className="profile-card-name">
                <h2>{fullName || 'Votre profil'}</h2>
                <p>{saved.email}</p>
                {saved.role && (
                  <span className={`dash-role${saved.role === 'Administrateur' ? ' is-admin' : ''}`}>{saved.role}</span>
                )}
              </div>
            </div>

            <div className="profile-completion">
              <div className="profile-completion-head">
                <span>Profil complété</span>
                <strong>{completion} %</strong>
              </div>
              <div
                className="profile-completion-track"
                role="progressbar"
                aria-valuenow={completion}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Profil complété"
              >
                <span style={{ width: `${completion}%` }} />
              </div>
              {missing.length > 0 ? (
                <p className="profile-completion-missing">
                  À compléter :{' '}
                  {missing.map((field, index) => (
                    <span key={field.key}>
                      <a href={`#profile-${field.key}`}>{field.label}</a>
                      {index < missing.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="profile-completion-done">✓ Tout est prêt pour vos commandes.</p>
              )}
            </div>

            <ul className="profile-card-links">
              <li><Link to="/mes-commandes">Mes commandes</Link></li>
              <li><Link to="/wishlist">Ma wishlist</Link></li>
              <li><Link to="/admin">Espace client</Link></li>
            </ul>
          </aside>
        </Col>

        <Col lg={8}>
          {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
          {notice && <Alert className="alert-soft" dismissible onClose={() => setNotice('')}>{notice}</Alert>}

          <Form onSubmit={onSave} className="profile-form">
            <Section
              title="Identité"
              text="Le nom qui apparaîtra sur vos commandes et vos factures."
              icon={<svg {...iconProps}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.6 3.1-5.5 7-5.5s6.3 1.9 7 5.5" /></svg>}
            >
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="profile-firstName">
                    <Form.Label>Prénom</Form.Label>
                    <Form.Control required maxLength={100} autoComplete="given-name" value={profile.firstName} onChange={(e) => setField('firstName', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="profile-lastName">
                    <Form.Label>Nom</Form.Label>
                    <Form.Control required maxLength={100} autoComplete="family-name" value={profile.lastName} onChange={(e) => setField('lastName', e.target.value)} />
                  </Form.Group>
                </Col>
              </Row>
            </Section>

            <Section
              title="Contact"
              text="Pour vous joindre au sujet d’une commande ou d’une livraison."
              icon={<svg {...iconProps}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>}
            >
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="profile-phone">
                    <Form.Label>Téléphone</Form.Label>
                    <Form.Control type="tel" required maxLength={40} autoComplete="tel" placeholder="06 00 00 00 00" value={profile.phone} onChange={(e) => setField('phone', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="profile-email">
                    <Form.Label>E-mail</Form.Label>
                    <div className="profile-locked">
                      <Form.Control type="email" value={profile.email} readOnly />
                      <svg {...iconProps}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                    </div>
                    <Form.Text>L’adresse de connexion de votre compte.</Form.Text>
                  </Form.Group>
                </Col>
              </Row>
            </Section>

            <Section
              title="Adresse de livraison"
              text="Pré-remplie dans le panier ; vous pourrez toujours la changer pour une commande."
              icon={<svg {...iconProps}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>}
            >
              <Row className="g-3">
                <Col xs={12}>
                  <Form.Group controlId="profile-address">
                    <Form.Label>Adresse</Form.Label>
                    <Form.Control required maxLength={300} autoComplete="street-address" placeholder="N°, rue, quartier" value={profile.address} onChange={(e) => setField('address', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="profile-city">
                    <Form.Label>Ville</Form.Label>
                    <Form.Control required maxLength={100} autoComplete="address-level2" value={profile.city} onChange={(e) => setField('city', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="profile-country">
                    <Form.Label>Pays</Form.Label>
                    <Form.Control required maxLength={100} autoComplete="country-name" placeholder="Maroc" value={profile.country} onChange={(e) => setField('country', e.target.value)} />
                  </Form.Group>
                </Col>
              </Row>
            </Section>

            <div className={`profile-savebar${dirty ? ' is-dirty' : ''}`}>
              <span className="profile-savebar-state">
                {dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'}
              </span>
              <div className="d-flex gap-2">
                {dirty && (
                  <Button variant="outline-secondary" onClick={() => { setProfile(saved); setNotice(''); }}>
                    Annuler les modifications
                  </Button>
                )}
                <Button type="submit" className="btn-brand" disabled={saving || !dirty}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </Form>
        </Col>
      </Row>
  );
}

export function Profile() {
  const [saved, setSaved] = useState(emptyProfile);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    let active = true;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!active) return;
      const isSignedIn = Boolean(user && !user.isAnonymous);
      setSignedIn(isSignedIn);
      setAuthReady(true);
      if (!isSignedIn) return;

      setLoading(true);
      setError('');
      try {
        const savedProfile = await fetchUserProfile();
        const withEmail = { ...savedProfile, email: savedProfile.email || user?.email || '' };
        if (active) setSaved(withEmail);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Impossible de charger le profil.');
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!isFirebaseConfigured) {
    return (
      <Container className="page-hero pb-5">
        <h1>Mon profil</h1>
        <Alert variant="warning">Firebase n’est pas encore configuré.</Alert>
      </Container>
    );
  }

  if (!authReady) {
    return <Container className="page-hero pb-5"><p className="text-secondary">Vérification de la session…</p></Container>;
  }

  if (!signedIn) {
    return (
      <Container className="page-hero pb-5">
        <div className="profile-signed-out">
          <span className="profile-signed-out-icon">
            <svg {...iconProps}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.6 3.1-5.5 7-5.5s6.3 1.9 7 5.5" /></svg>
          </span>
          <h1 className="h3">Mon profil</h1>
          <p className="text-secondary">Connectez-vous à votre compte pour consulter et modifier vos coordonnées.</p>
          <Link to="/admin" className="btn btn-brand">Se connecter</Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="page-hero pb-5">
      <Breadcrumb />
      <h1 className="mb-1">Mon profil</h1>
      <p className="section-lead mb-4">Vos coordonnées, utilisées pour remplir automatiquement vos commandes.</p>
      {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
      {loading ? (
        <p className="text-secondary">Chargement du profil…</p>
      ) : (
        <ProfileEditor key={saved.email} initial={saved} onSave={saveUserProfile} />
      )}
    </Container>
  );
}
