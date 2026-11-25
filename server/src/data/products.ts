export type ProductCategory = 'ready' | 'customizable';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  price: number;
  category: ProductCategory;
  material: string;
  colors: string[];
  imageGradient: string;
  images?: string[];
  tags: string[];
  active?: boolean;
  customOptions?: {
    text?: boolean;
    color?: boolean;
    size?: boolean;
  };
}

export const products: Product[] = [
  {
    id: 'p1',
    name: 'Support casque Hexa',
    slug: 'support-casque-hexa',
    description: 'Support mural géométrique pour casque audio, fini mat premium.',
    longDescription:
      'Conçu pour un maintien stable et un rendu décoratif. Impression FDM en PETG renforcé, surfaces lissées et visserie murale incluse.',
    price: 29.9,
    category: 'ready',
    material: 'PETG',
    colors: ['Noir graphite', 'Blanc glacier', 'Teal'],
    imageGradient: 'linear-gradient(145deg, #1a2332 0%, #0d9488 55%, #134e4a 100%)',
    tags: ['bureau', 'audio'],
  },
  {
    id: 'p2',
    name: 'Lampe couche Luna',
    slug: 'lampe-couche-luna',
    description: 'Abat-jour stratifié qui diffuse une lumière douce en strates.',
    longDescription:
      'Pièce décorative imprimée en PLA+ translucide. Compatible ampoule LED E14 (non fournie). Assemblage magnétique rapide.',
    price: 49,
    category: 'ready',
    material: 'PLA+',
    colors: ['Sable', 'Opale', 'Vert forêt'],
    imageGradient: 'linear-gradient(160deg, #0f172a 0%, #f59e0b 40%, #78350f 100%)',
    tags: ['déco', 'éclairage'],
  },
  {
    id: 'p3',
    name: 'Organiseur bureau Nest',
    slug: 'organiseur-bureau-nest',
    description: 'Modules emboîtables pour stylos, clés USB et cartes.',
    longDescription:
      'Système modulaire : 3 modules + plateau. Impression précise en ABS pour une résistance quotidienne.',
    price: 24.5,
    category: 'ready',
    material: 'ABS',
    colors: ['Anthracite', 'Bleu nuit'],
    imageGradient: 'linear-gradient(135deg, #111827 0%, #1e3a5f 50%, #0ea5e9 100%)',
    tags: ['bureau', 'organisation'],
  },
  {
    id: 'p4',
    name: 'Porte-clés prénom',
    slug: 'porte-cles-prenom',
    description: 'Porte-clés personnalisé avec votre texte et couleur.',
    longDescription:
      'Choisissez le texte (jusqu’à 12 caractères), la couleur et la taille. Anneau métallique inclus. Idéal cadeau rapide.',
    price: 12.9,
    category: 'customizable',
    material: 'PLA',
    colors: ['Noir', 'Blanc', 'Rouge', 'Teal', 'Jaune'],
    imageGradient: 'linear-gradient(145deg, #042f2e 0%, #14b8a6 50%, #fbbf24 100%)',
    tags: ['cadeau', 'perso'],
    customOptions: { text: true, color: true, size: true },
  },
  {
    id: 'p5',
    name: 'Figurine avatar',
    slug: 'figurine-avatar',
    description: 'Figurine stylisée à personnaliser (couleurs + inscription).',
    longDescription:
      'Base 8 cm, impression résine haute définition. Personnalisez les couleurs principales et ajoutez une plaque nominative.',
    price: 39,
    category: 'customizable',
    material: 'Résine',
    colors: ['Multicolore'],
    imageGradient: 'linear-gradient(150deg, #1e1b4b 0%, #7c3aed 40%, #22d3ee 100%)',
    tags: ['cadeau', 'collectible'],
    customOptions: { text: true, color: true, size: false },
  },
  {
    id: 'p6',
    name: 'Plaque signalétique',
    slug: 'plaque-signaletique',
    description: 'Plaque murale ou de bureau avec texte et logo simple.',
    longDescription:
      'Format A6 ou A5, relief 3D du texte. Option double couleur (base + lettres). Fixation adhésive ou vissée.',
    price: 34,
    category: 'customizable',
    material: 'PETG',
    colors: ['Noir/Blanc', 'Teal/Noir', 'Bois/Blanc'],
    imageGradient: 'linear-gradient(140deg, #171717 0%, #525252 45%, #99f6e4 100%)',
    tags: ['pro', 'signalétique'],
    customOptions: { text: true, color: true, size: true },
  },
  {
    id: 'p7',
    name: 'Socle smartphone Wave',
    slug: 'socle-smartphone-wave',
    description: 'Socle ergonomique avec câble intégré (passage USB-C).',
    longDescription:
      'Angle de vision optimisé, antidérapant. Compatible la plupart des smartphones jusqu’à 6,8".',
    price: 19.9,
    category: 'ready',
    material: 'PETG',
    colors: ['Noir', 'Gris perle', 'Teal'],
    imageGradient: 'linear-gradient(145deg, #020617 0%, #334155 50%, #2dd4bf 100%)',
    tags: ['bureau', 'tech'],
  },
  {
    id: 'p8',
    name: 'Boîte à secrets Lattice',
    slug: 'boite-secrets-lattice',
    description: 'Coffret ajouré personnalisable avec monogramme.',
    longDescription:
      'Motif lattice paramétrique. Ajoutez vos initiales sur le couvercle. Intérieur feutré optionnel.',
    price: 44,
    category: 'customizable',
    material: 'PLA+',
    colors: ['Ébène', 'Ivoire', 'Cuivre'],
    imageGradient: 'linear-gradient(155deg, #292524 0%, #b45309 50%, #fef3c7 100%)',
    tags: ['cadeau', 'déco'],
    customOptions: { text: true, color: true, size: true },
  },
];
