import { API_BASE } from '../api/client';

const BLOB_IMAGE = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

/**
 * Product photos are stored as WebP. Some browsers refuse it (Safari in Lockdown Mode, old iOS):
 * when such an image fails, load the JPEG copy made by the API instead. Other browsers never
 * hit this path, so they keep the lighter WebP files.
 */
export function installImageFallback() {
  document.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.jpegFallback) return;
      const src = img.currentSrc || img.src;
      if (!BLOB_IMAGE.test(src)) return;
      img.dataset.jpegFallback = '1';
      img.removeAttribute('srcset');
      img.src = `${API_BASE}/image.jpg?src=${encodeURIComponent(src)}`;
    },
    // Image errors do not bubble: listen during the capture phase.
    true,
  );
}
