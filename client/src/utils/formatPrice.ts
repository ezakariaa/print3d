export function formatPrice(amount: number, fractionDigits = 2): string {
  const formattedAmount = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);

  return `${formattedAmount} DH`;
}
