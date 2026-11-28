import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { ProfileNotSavedError, registerUser, sendPasswordReset, signInAdmin } from '../firebase';

// ---------- Icons (stroke, inherit currentColor) ----------
const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const icons = {
  mail: <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>,
  lock: <svg {...svgProps}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  user: <svg {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.8-6 8-6s7.2 2 8 6" /></svg>,
  phone: <svg {...svgProps}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  city: <svg {...svgProps}><path d="M3 21h18M5 21V8l6-4v17M11 21V10h8v11M8 9v.01M8 12v.01M8 15v.01M15 13v.01M15 16v.01" /></svg>,
  pin: <svg {...svgProps}><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  eye: <svg {...svgProps}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg {...svgProps}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>,
};

/** Text field with a leading icon, as in the site's login design. */
function IconField({
  id,
  label,
  icon,
  trailing,
  ...input
}: { id: string; label: string; icon: ReactNode; trailing?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Form.Group controlId={id}>
      <Form.Label>{label}</Form.Label>
      <div className={`auth-field${trailing ? ' has-trailing' : ''}`}>
        <span className="auth-field-icon">{icon}</span>
        <Form.Control {...(input as object)} />
        {trailing}
      </div>
    </Form.Group>
  );
}

function PasswordField(props: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <IconField
      id={props.id}
      label={props.label}
      icon={icons.lock}
      type={visible ? 'text' : 'password'}
      required
      autoComplete={props.autoComplete}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      trailing={(
        <button
          type="button"
          className="auth-field-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
        >
          {visible ? icons.eyeOff : icons.eye}
        </button>
      )}
    />
  );
}

/** Firebase auth error codes → readable French messages. */
function authMessage(err: unknown, fallback: string) {
  const code = (err as { code?: string })?.code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte ne correspond à cette adresse e-mail.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/user-disabled': 'Ce compte a été désactivé. Contactez-nous.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse e-mail.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/network-request-failed': 'Connexion réseau impossible. Vérifiez votre connexion.',
  };
  return messages[code] ?? (err instanceof Error && !code ? err.message : fallback);
}

type Mode = 'login' | 'signup';

interface AuthModalProps {
  show: boolean;
  onHide: () => void;
  /** Called once the user is signed in. */
  onSignedIn?: () => void;
}

export function AuthModal({ show, onHide, onSignedIn }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Sign-up
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', city: '', password: '', confirm: '' });
  const setRegField = (field: keyof typeof reg) => (value: string) => setReg((current) => ({ ...current, [field]: value }));

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const close = () => {
    setPassword('');
    setReg((current) => ({ ...current, password: '', confirm: '' }));
    setError('');
    setNotice('');
    setMode('login');
    onHide();
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await signInAdmin(email.trim(), password, rememberMe);
      setPassword('');
      onSignedIn?.();
      close();
    } catch (err) {
      setError(authMessage(err, 'Connexion impossible.'));
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Saisissez d’abord votre adresse e-mail, puis cliquez sur « Mot de passe oublié ? ».');
      return;
    }
    try {
      await sendPasswordReset(email.trim());
      setNotice(`Si un compte existe pour ${email.trim()}, un e-mail de réinitialisation vient d’être envoyé.`);
    } catch (err) {
      setError(authMessage(err, 'Envoi de l’e-mail impossible.'));
    }
  };

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (reg.password !== reg.confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (reg.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      await registerUser({
        firstName: reg.firstName.trim(),
        lastName: reg.lastName.trim(),
        email: reg.email.trim(),
        phone: reg.phone.trim(),
        address: reg.address.trim(),
        city: reg.city.trim(),
        password: reg.password,
      });
      setEmail(reg.email.trim());
      setReg({ firstName: '', lastName: '', email: '', phone: '', address: '', city: '', password: '', confirm: '' });
      setMode('login');
      setNotice(`Votre compte a été créé. Un e-mail de confirmation vient d’être envoyé à ${reg.email.trim()} : cliquez sur son lien pour vérifier votre adresse. Vous pouvez déjà vous connecter.`);
    } catch (err) {
      if (err instanceof ProfileNotSavedError) {
        // The account exists: go to sign-in, the details are completed in « Mon profil ».
        setEmail(reg.email.trim());
        setMode('login');
        setError(err.message);
        return;
      }
      setError(authMessage(err, 'Inscription impossible.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={close} centered size={mode === 'signup' ? 'lg' : undefined} className="auth-modal">
      <Modal.Header closeButton>
        <Modal.Title className="h4 mb-0">
          {mode === 'login' ? 'Espace Client' : 'Créer un compte'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-secondary mb-4">
          {mode === 'login'
            ? 'Connectez-vous pour accéder à votre espace.'
            : 'Renseignez vos informations pour créer votre compte client.'}
        </p>
        {error && <Alert variant="warning">{error}</Alert>}
        {notice && <Alert className="alert-soft">{notice}</Alert>}

        {mode === 'login' ? (
          <Form onSubmit={onLogin}>
            <div className="d-grid gap-3 mb-3">
              <IconField
                id="auth-email"
                label="Adresse e-mail"
                icon={icons.mail}
                type="email"
                required
                autoComplete="username"
                placeholder="Entrez votre adresse e-mail"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <PasswordField
                id="auth-password"
                label="Mot de passe"
                placeholder="Entrez votre mot de passe"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
            </div>
            <div className="d-flex justify-content-between align-items-center gap-2 mb-4">
              <Form.Check
                type="checkbox"
                id="auth-remember"
                label="Se rappeler de moi"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <button type="button" className="btn btn-link p-0 auth-link" onClick={() => void onForgot()}>
                Mot de passe oublié?
              </button>
            </div>
            <Button type="submit" className="btn-brand w-100 py-2" disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
            <p className="text-center text-secondary small mt-3 mb-0">
              Pas encore de compte ?{' '}
              <button type="button" className="btn btn-link p-0 auth-link small" onClick={() => switchMode('signup')}>
                Créer un compte
              </button>
            </p>
          </Form>
        ) : (
          <Form onSubmit={onRegister}>
            <Row className="g-3 mb-4">
              <Col sm={6}>
                <IconField id="reg-first" label="Prénom" icon={icons.user} required autoComplete="given-name"
                  placeholder="Votre prénom" value={reg.firstName} onChange={(e) => setRegField('firstName')(e.target.value)} />
              </Col>
              <Col sm={6}>
                <IconField id="reg-last" label="Nom" icon={icons.user} required autoComplete="family-name"
                  placeholder="Votre nom" value={reg.lastName} onChange={(e) => setRegField('lastName')(e.target.value)} />
              </Col>
              <Col xs={12}>
                <IconField id="reg-email" label="Adresse e-mail" icon={icons.mail} type="email" required autoComplete="email"
                  placeholder="Entrez votre adresse e-mail" value={reg.email} onChange={(e) => setRegField('email')(e.target.value)} />
              </Col>
              <Col sm={6}>
                <IconField id="reg-phone" label="Téléphone" icon={icons.phone} type="tel" autoComplete="tel"
                  placeholder="+212 6xx xxx xxx" value={reg.phone} onChange={(e) => setRegField('phone')(e.target.value)} />
              </Col>
              <Col sm={6}>
                <IconField id="reg-city" label="Ville" icon={icons.city} autoComplete="address-level2"
                  placeholder="Votre ville" value={reg.city} onChange={(e) => setRegField('city')(e.target.value)} />
              </Col>
              <Col xs={12}>
                <IconField id="reg-address" label="Adresse" icon={icons.pin} autoComplete="street-address"
                  placeholder="Rue, numéro, quartier…" value={reg.address} onChange={(e) => setRegField('address')(e.target.value)} />
              </Col>
              <Col sm={6}>
                <PasswordField id="reg-password" label="Mot de passe" placeholder="Min. 6 caractères"
                  autoComplete="new-password" value={reg.password} onChange={setRegField('password')} />
              </Col>
              <Col sm={6}>
                <PasswordField id="reg-confirm" label="Confirmer le mot de passe" placeholder="Répétez le mot de passe"
                  autoComplete="new-password" value={reg.confirm} onChange={setRegField('confirm')} />
              </Col>
            </Row>
            <Button type="submit" className="btn-brand w-100 py-2" disabled={loading}>
              {loading ? 'Inscription…' : 'Créer mon compte'}
            </Button>
            <p className="text-center text-secondary small mt-3 mb-0">
              Déjà un compte ?{' '}
              <button type="button" className="btn btn-link p-0 auth-link small" onClick={() => switchMode('login')}>
                Se connecter
              </button>
            </p>
          </Form>
        )}
      </Modal.Body>
    </Modal>
  );
}
