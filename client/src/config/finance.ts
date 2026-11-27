/** Expense categories (same keys as the server). */
export const EXPENSE_CATEGORIES = [
  { value: 'matieres', label: 'Filament et résine' },
  { value: 'consommables', label: 'Consommables' },
  { value: 'electricite', label: 'Électricité' },
  { value: 'entretien', label: 'Entretien et réparations' },
  { value: 'materiel', label: 'Matériel et équipement' },
  { value: 'emballage', label: 'Emballage' },
  { value: 'transport', label: 'Transport et livraison' },
  { value: 'loyer', label: 'Loyer' },
  { value: 'telecom', label: 'Internet et téléphone' },
  { value: 'publicite', label: 'Publicité' },
  { value: 'autre', label: 'Autre' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];

export const EXPENSE_PAYMENTS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'carte', label: 'Carte bancaire' },
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'autre', label: 'Autre' },
] as const;

export const categoryInfo = (value: string) =>
  EXPENSE_CATEGORIES.find((category) => category.value === value) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export const paymentLabel = (value: string) =>
  EXPENSE_PAYMENTS.find((payment) => payment.value === value)?.label ?? value;

/** Periods offered on the Ventes and Charges pages. */
export type FinancePeriod = 'month' | 'last-month' | 'quarter' | 'year' | 'all';

export const FINANCE_PERIODS: Array<{ value: FinancePeriod; label: string }> = [
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'last-month', label: 'Mois dernier' },
  { value: 'quarter', label: '3 derniers mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'all', label: 'Depuis le début' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** First and last day (YYYY-MM-DD) of a period, both included; null bounds = no limit. */
export function periodRange(period: FinancePeriod, now = new Date()): { from: string | null; to: string | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'month': return { from: isoDay(new Date(y, m, 1)), to: isoDay(new Date(y, m + 1, 0)) };
    case 'last-month': return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) };
    case 'quarter': return { from: isoDay(new Date(y, m - 2, 1)), to: isoDay(new Date(y, m + 1, 0)) };
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: null, to: null };
  }
}

export function inRange(day: string, range: { from: string | null; to: string | null }) {
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

/** "2026-11" → "nov. 2026". */
export function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}
