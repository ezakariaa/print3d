/**
 * Customer reviews shown on the home page ("Ils nous recommandent").
 *
 * Only reviews with `published: true` appear on the site: put real reviews here (received on
 * WhatsApp, Google, Instagram…) with the customer's agreement, then set `published: true`.
 * The section stays hidden while no review is published. The sample entries below are only
 * there to preview the layout locally (they are shown in development, never in production).
 */
export interface Testimonial {
  name: string;
  /** City, or "Profession, city". */
  place: string;
  text: string;
  /** 1 to 5. */
  rating: number;
  published: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  // Sample reviews (fictional), in French and Darija: replace them with real ones before publishing.
  { name: 'Yassine Bennani', place: 'Casablanca', text: 'Lanterne reçue en 3 jours, très bien emballée. Les finitions sont propres, on dirait un objet de boutique.', rating: 5, published: false },
  { name: 'Salma El Idrissi', place: 'Rabat', text: 'Commande dyal porte-clés b smiya dyal wladi, khdma n9iya o wslat f lw9t. Merci bzaf !', rating: 5, published: false },
  { name: 'Hamza Ouazzani', place: 'Ingénieur, Tanger', text: 'Pièce technique imprimée sur devis à partir de mon fichier STL. Dimensions respectées au dixième près.', rating: 5, published: false },
  { name: 'Khadija Amrani', place: 'Marrakech', text: 'Twasselt m3ahom f WhatsApp, jawbouni daghya o 3tawni nassi7a f lmatière. Service zwin bzaf.', rating: 5, published: false },
  { name: 'Mehdi Tazi', place: 'Fès', text: 'Cadeau personnalisé pour l’anniversaire de ma femme, elle a adoré. Je recommande sans hésiter.', rating: 5, published: false },
  { name: 'Imane Berrada', place: 'Agadir', text: 'Lampe d’ambiance wa3ra, kat3ti daw7 zwin f lbit. Ghadi n3awd ncommandi inchallah.', rating: 5, published: false },
  { name: 'Omar Lahlou', place: 'Commerçant, Salé', text: 'Supports présentoirs pour mon magasin : bon rapport qualité-prix et délai tenu. Deuxième commande déjà passée.', rating: 4, published: false },
  { name: 'Nadia Chraibi', place: 'Kénitra', text: 'L9it ga3 dakchi li bghit f la boutique, o la livraison kant rapide. Chokran 3la la qualité !', rating: 5, published: false },
];

/** Reviews to display: the published ones; in development, the samples too (layout preview). */
export function visibleTestimonials(): Testimonial[] {
  const published = TESTIMONIALS.filter((review) => review.published);
  return published.length > 0 || !import.meta.env.DEV ? published : TESTIMONIALS;
}
