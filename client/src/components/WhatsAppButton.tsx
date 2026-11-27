import { useLocation } from 'react-router-dom';
import { COMPANY } from '../config/company';

/** WhatsApp logo (white on the button, current colour elsewhere). */
export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.55 1.75 6.53L3 29l6.63-1.74A13 13 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3Zm0 23.8c-1.98 0-3.92-.53-5.61-1.53l-.4-.24-3.93 1.03 1.05-3.83-.26-.4A10.77 10.77 0 0 1 5.2 16c0-5.97 4.86-10.83 10.84-10.83 5.97 0 10.82 4.86 10.82 10.83 0 5.98-4.85 10.8-10.82 10.8Zm5.94-8.1c-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.16-.22.33-.84 1.06-1.03 1.28-.19.22-.38.24-.71.08-.33-.16-1.38-.51-2.63-1.62a9.9 9.9 0 0 1-1.82-2.27c-.19-.33-.02-.5.14-.67.15-.15.33-.38.49-.57.16-.19.22-.33.33-.54.11-.22.05-.41-.03-.57-.08-.16-.73-1.77-1-2.42-.27-.64-.54-.55-.73-.56h-.62c-.22 0-.57.08-.87.41-.3.33-1.14 1.11-1.14 2.71s1.17 3.15 1.33 3.36c.16.22 2.3 3.5 5.56 4.91.78.34 1.39.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.42.19-1.55-.08-.14-.3-.22-.63-.38Z"
      />
    </svg>
  );
}

/** Floating WhatsApp button, bottom right of the public pages. */
export function WhatsAppButton() {
  const { pathname } = useLocation();
  // Not on the admin pages (management tables, client area).
  if (!COMPANY.whatsapp || pathname.startsWith('/admin')) return null;

  const href = `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(COMPANY.whatsappMessage)}`;
  return (
    <a
      className="whatsapp-float"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Nous contacter sur WhatsApp"
      title="Nous contacter sur WhatsApp"
    >
      <WhatsAppIcon />
    </a>
  );
}
