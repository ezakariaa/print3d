import type { Carrier } from '../api/client';

/** City name compared without accents, case or punctuation (same rule as the server). */
export function normalizeCity(city: string) {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Delivery price and delay for a city, or null when the carrier does not serve it. */
export function shippingQuote(carrier: Carrier, city: string, subtotal: number) {
  const wanted = normalizeCity(city);
  if (!wanted) return null;
  const zone = carrier.zones.find((item) => item.cities.some((name) => normalizeCity(name) === wanted));
  if (!zone) return null;
  const free = carrier.freeFrom !== null && subtotal >= carrier.freeFrom;
  return { price: free ? 0 : zone.price, delay: zone.delay || carrier.delay, free };
}
