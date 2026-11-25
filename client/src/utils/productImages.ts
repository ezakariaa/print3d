const productImages: Record<string, string> = {
  'support-casque-hexa': '/products/support-casque-hexa.jpg',
  'lampe-couche-luna': '/products/lampe-couche-luna.jpg',
  'organiseur-bureau-nest': '/products/organiseur-bureau-nest.jpg',
  'porte-cles-prenom': '/products/porte-cles-prenom.jpg',
};

export function getProductImage(slug: string, images?: string[]): string | undefined {
  return images?.[0] || productImages[slug];
}
