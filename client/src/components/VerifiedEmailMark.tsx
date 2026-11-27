import { useEffect, useState } from 'react';
import { getFirebaseAuth, isFirebaseConfigured, onIdTokenChanged } from '../firebase';

/** Small green check shown next to an e-mail address that its owner has confirmed. */
export function VerifiedEmailMark({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return (
    <span className="email-verified-mark" title="Adresse e-mail vérifiée" aria-label="Adresse e-mail vérifiée" role="img">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 1.5 14.6 3.4l3.2-.2 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3L2.6 15.9l1-3.1-1-3.1 2.6-1.9 1-3 3.2.2Z" />
        <path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** The check for the signed-in account's own address. */
export function OwnVerifiedEmailMark() {
  return <VerifiedEmailMark verified={useOwnEmailVerified()} />;
}

/**
 * Whether the signed-in account's address is verified. Updated live: confirming it renews the
 * session token (see refreshEmailVerified), which this listens to.
 */
export function useOwnEmailVerified() {
  const [verified, setVerified] = useState(() => (
    isFirebaseConfigured ? Boolean(getFirebaseAuth().currentUser?.emailVerified) : false
  ));
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onIdTokenChanged(getFirebaseAuth(), (user) => setVerified(Boolean(user?.emailVerified)));
  }, []);
  return verified;
}
