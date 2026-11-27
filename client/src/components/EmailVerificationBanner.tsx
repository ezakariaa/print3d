import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { getFirebaseAuth, refreshEmailVerified, resendEmailVerification } from '../firebase';

const RESEND_DELAY_S = 60;

/**
 * Shown in the Espace Client while the account's e-mail address is not verified: resend the
 * confirmation e-mail, or check again once its link has been opened.
 */
export function EmailVerificationBanner() {
  const user = getFirebaseAuth().currentUser;
  const [verified, setVerified] = useState(Boolean(user?.emailVerified));
  const [justVerified, setJustVerified] = useState(false);
  const [busy, setBusy] = useState<'' | 'send' | 'check'>('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Back from the e-mail link (?verified=1), or the tab regains focus: read the state again.
  useEffect(() => {
    if (verified) return;
    const check = () => {
      refreshEmailVerified()
        .then((ok) => {
          if (ok) {
            setVerified(true);
            setJustVerified(true);
          }
        })
        .catch(() => undefined);
    };
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [verified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!user || user.isAnonymous) return null;

  if (verified) {
    return justVerified ? (
      <div className="verify-banner is-done" role="status">
        <span className="verify-banner-icon" aria-hidden="true">✓</span>
        <div className="verify-banner-text">
          <strong>Adresse e-mail vérifiée.</strong>
          <span>Merci, votre compte est confirmé.</span>
        </div>
      </div>
    ) : null;
  }

  const resend = async () => {
    setBusy('send');
    setMessage('');
    try {
      await resendEmailVerification();
      setMessage(`E-mail envoyé à ${user.email}. Pensez à regarder dans les spams.`);
      setCooldown(RESEND_DELAY_S);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setMessage(code === 'auth/too-many-requests'
        ? 'Trop de demandes : patientez quelques minutes avant de renvoyer l’e-mail.'
        : 'L’envoi a échoué. Réessayez dans un instant.');
    } finally {
      setBusy('');
    }
  };

  const check = async () => {
    setBusy('check');
    setMessage('');
    try {
      if (await refreshEmailVerified()) {
        setVerified(true);
        setJustVerified(true);
      } else {
        setMessage('Votre adresse n’est pas encore vérifiée : ouvrez le lien reçu par e-mail, puis réessayez.');
      }
    } catch {
      setMessage('Vérification impossible pour le moment. Réessayez.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="verify-banner" role="region" aria-label="Vérification de l’adresse e-mail">
      <span className="verify-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
      <div className="verify-banner-text">
        <strong>Vérifiez votre adresse e-mail</strong>
        <span>
          Confirmez que <b>{user.email}</b> vous appartient en cliquant sur le lien de l’e-mail de
          confirmation. Pas reçu ? Envoyez-le à nouveau.
        </span>
        {message && <span className="verify-banner-message" role="status">{message}</span>}
      </div>
      <div className="verify-banner-actions">
        <Button size="sm" className="btn-brand" disabled={busy !== '' || cooldown > 0} onClick={() => void resend()}>
          {busy === 'send' ? 'Envoi…' : cooldown > 0 ? `Renvoyer (${cooldown} s)` : 'Envoyer l’e-mail'}
        </Button>
        <Button size="sm" variant="outline-secondary" disabled={busy !== ''} onClick={() => void check()}>
          {busy === 'check' ? 'Vérification…' : 'J’ai vérifié'}
        </Button>
      </div>
    </div>
  );
}
