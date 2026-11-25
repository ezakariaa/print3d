import { fileToBase64 } from './fileToBase64';

interface CompressOptions {
  maxSize: number;
  quality: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image illisible.'));
    image.src = src;
  });
}

// Resizes and re-encodes an image as a WebP data URL to keep inline (base64) storage small.
export async function compressImageToDataUrl(
  file: File,
  { maxSize, quality }: CompressOptions,
): Promise<string> {
  const original = await fileToBase64(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(original);
  } catch {
    return original;
  }

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return original;
  context.drawImage(image, 0, 0, width, height);

  const compressed = canvas.toDataURL('image/webp', quality);
  // Fall back to the original when the browser cannot encode WebP or when it would not shrink the file.
  if (!compressed.startsWith('data:image/webp') || compressed.length >= original.length) {
    return original;
  }
  return compressed;
}
