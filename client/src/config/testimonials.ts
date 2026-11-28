/**
 * Sample customer reviews (fictional), in French and Darija. The real reviews are managed in
 * Admin > Avis clients (Firestore "Testimonials"); these samples can be imported there as
 * unpublished drafts, to be replaced by real reviews before publishing. In development they
 * also preview the home page section while no review is published.
 */
export interface SampleTestimonial {
  name: string;
  /** City, or "Profession, city". */
  place: string;
  text: string;
  /** 1 to 5. */
  rating: number;
}

export const SAMPLE_TESTIMONIALS: SampleTestimonial[] = [
  { name: 'Yassine Bennani', place: 'Casablanca', text: 'Lanterne reçue en 3 jours, très bien emballée. Les finitions sont propres, on dirait un objet de boutique.', rating: 5 },
  { name: 'Salma El Idrissi', place: 'Rabat', text: 'Commande dyal porte-clés b smiya dyal wladi, khdma n9iya o wslat f lw9t. Merci bzaf !', rating: 5 },
  { name: 'Hamza Ouazzani', place: 'Ingénieur, Tanger', text: 'Pièce technique imprimée sur devis à partir de mon fichier STL. Dimensions respectées au dixième près.', rating: 5 },
  { name: 'Khadija Amrani', place: 'Marrakech', text: 'Twasselt m3ahom f WhatsApp, jawbouni daghya o 3tawni nassi7a f lmatière. Service zwin bzaf.', rating: 5 },
  { name: 'Mehdi Tazi', place: 'Fès', text: 'Cadeau personnalisé pour l’anniversaire de ma femme, elle a adoré. Je recommande sans hésiter.', rating: 5 },
  { name: 'Imane Berrada', place: 'Agadir', text: 'Lampe d’ambiance wa3ra, kat3ti daw7 zwin f lbit. Ghadi n3awd ncommandi inchallah.', rating: 5 },
  { name: 'Omar Lahlou', place: 'Commerçant, Salé', text: 'Supports présentoirs pour mon magasin : bon rapport qualité-prix et délai tenu. Deuxième commande déjà passée.', rating: 4 },
  { name: 'Nadia Chraibi', place: 'Kénitra', text: 'L9it ga3 dakchi li bghit f la boutique, o la livraison kant rapide. Chokran 3la la qualité !', rating: 5 },
];
