import { useEffect, useState, type FormEvent } from 'react';
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

export function Profile() {
  const [profile, setProfile] = useState(emptyProfile);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
        if (active) setProfile(savedProfile);
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

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveUserProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        address: profile.address,
        city: profile.city,
        country: profile.country,
        phone: profile.phone,
      });
      setNotice('Votre profil a été enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer le profil.');
    } finally {
      setSaving(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <Container className="page-hero pb-5">
        <h1>Mon profil</h1>
        <Alert variant="warning">Firebase n’est pas encore configuré.</Alert>
      </Container>
    );
  }

  if (!authReady) {
    return <Container className="page-hero pb-5"><p>Vérification de la session…</p></Container>;
  }

  if (!signedIn) {
    return (
      <Container className="page-hero pb-5">
        <h1>Mon profil</h1>
        <Alert variant="warning">
          Connectez-vous à votre compte depuis l’<Link to="/admin">Espace Client</Link> pour accéder à votre profil.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="page-hero pb-5">
      <h1>Mon profil</h1>
      <p className="section-lead">Vos coordonnées sont enregistrées dans votre profil utilisateur.</p>
      {error && <Alert variant="warning">{error}</Alert>}
      {notice && <Alert className="alert-soft">{notice}</Alert>}
      <Form onSubmit={onSave} className="custom-panel">
        <Row className="g-3">
          <Col md={6}>
            <Form.Group>
              <Form.Label>Nom</Form.Label>
              <Form.Control
                required
                maxLength={100}
                value={profile.lastName}
                onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Prénom</Form.Label>
              <Form.Control
                required
                maxLength={100}
                value={profile.firstName}
                onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col xs={12}>
            <Form.Group>
              <Form.Label>Adresse</Form.Label>
              <Form.Control
                required
                maxLength={300}
                value={profile.address}
                onChange={(event) => setProfile({ ...profile, address: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Ville</Form.Label>
              <Form.Control
                required
                maxLength={100}
                value={profile.city}
                onChange={(event) => setProfile({ ...profile, city: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Pays</Form.Label>
              <Form.Control
                required
                maxLength={100}
                value={profile.country}
                onChange={(event) => setProfile({ ...profile, country: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Numéro de téléphone</Form.Label>
              <Form.Control
                type="tel"
                required
                maxLength={40}
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Adresse e-mail</Form.Label>
              <Form.Control type="email" value={profile.email} readOnly />
              <Form.Text>L’adresse e-mail correspond à votre compte connecté.</Form.Text>
            </Form.Group>
          </Col>
        </Row>
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mt-4">
          <Link to="/admin" className="btn btn-outline-light">Retour à l’Espace Client</Link>
          <Button type="submit" className="btn-brand" disabled={loading || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer mon profil'}
          </Button>
        </div>
      </Form>
      {loading && <p className="text-secondary mt-3">Chargement du profil…</p>}
    </Container>
  );
}
