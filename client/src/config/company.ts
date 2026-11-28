/**
 * Workshop details printed on invoices. Empty fields are not shown.
 * Fill in the legal identifiers (ICE, RC, IF…) and the real address before sending invoices to customers.
 */
export const COMPANY = {
  name: 'PrintMa3D',
  tagline: 'Atelier d’impression 3D',
  address: '',
  city: '',
  phone: '',
  email: 'contact@3alam3d.local',
  /** WhatsApp number in international format, without + or spaces (0664170000 → 212664170000). */
  whatsapp: '212664170000',
  /** Message pre-filled when a visitor opens the conversation. */
  whatsappMessage: 'Bonjour PrintMa3D, j’ai une question :',
  website: 'printma3d-7b4c7.web.app',
  /**
   * Beneficiary of Wafacash / Cash Plus transfers. When filled, the checkout shows them; when
   * empty, the customer is told that the workshop sends them after the order.
   */
  cashTransfer: {
    /** Full name exactly as on the ID card. */
    beneficiary: '',
    /** Phone number given at the agency. */
    phone: '',
  },
  /** Identifiant commun de l’entreprise (Maroc). */
  ice: '',
  /** Registre de commerce. */
  rc: '',
  /** Identifiant fiscal. */
  taxId: '',
};
