export interface Service {
  id: string;
  title: string;
  summary: string;
  details: string[];
  fromPrice: number;
  unit: string;
  icon: string;
}

export const services: Service[] = [
  {
    id: 's1',
    title: 'Impression FDM',
    summary: 'Pièces robustes en PLA, PETG ou ABS pour prototypes et objets du quotidien.',
    details: [
      'Volume max 220 × 220 × 250 mm',
      'Épaisseur de couche dès 0,12 mm',
      'Finitions : brut, poncé ou peint',
      'Devis sous 24 h',
    ],
    fromPrice: 8,
    unit: 'pièce',
    icon: 'fdm',
  },
  {
    id: 's2',
    title: 'Impression résine',
    summary: 'Détails fins et surfaces lisses pour figurines, bijoux et modèles médicaux.',
    details: [
      'Résolution jusqu’à 50 microns',
      'Résines standard, tough ou flexible',
      'Post-traitement UV inclus',
      'Retrait des supports soigné',
    ],
    fromPrice: 15,
    unit: 'pièce',
    icon: 'resin',
  },
  {
    id: 's3',
    title: 'Modélisation 3D',
    summary: 'De l’idée au fichier prêt à imprimer : CAO, scan, réparation STL.',
    details: [
      'Création sur mesure',
      'Optimisation pour impression',
      'Réparation / conversion de fichiers',
      'Itérations inclusives selon forfait',
    ],
    fromPrice: 45,
    unit: 'heure',
    icon: 'model',
  },
  {
    id: 's4',
    title: 'Petites séries',
    summary: 'Production courte de 10 à 200 pièces pour marques et makers.',
    details: [
      'Contrôle qualité pièce par pièce',
      'Emballage et étiquetage possible',
      'Délais planifiés',
      'Tarifs dégressifs',
    ],
    fromPrice: 120,
    unit: 'lot',
    icon: 'series',
  },
];
