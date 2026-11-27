import type { AdminOrder, DeliveryState } from '../api/client';
import { isoDay } from '../config/finance';

/** Delivery follow-up, in the order shown to the administrator. */
export const DELIVERY_STATES: Array<{ value: DeliveryState; label: string }> = [
  { value: 'in_transit', label: 'En cours de livraison' },
  { value: 'delivered', label: 'Livrée' },
  { value: 'returned', label: 'Retournée' },
];

/** Current delivery state, including orders saved before it existed (delivered: true). */
export function deliveryStateOf(order: AdminOrder): DeliveryState | null {
  return order.deliveryState ?? (order.delivered ? 'delivered' : null);
}

/**
 * A sale is validated, and counts in the revenue, only when the order is "Terminée"
 * AND has been delivered. Cancelled and returned orders are out of the revenue;
 * every other order is a sale in progress.
 */
export const isValidatedSale = (order: AdminOrder) => order.status === 'completed' && deliveryStateOf(order) === 'delivered';

export const isOutOfRevenue = (order: AdminOrder) => order.status === 'cancelled' || deliveryStateOf(order) === 'returned';

export const isSaleInProgress = (order: AdminOrder) => !isOutOfRevenue(order) && !isValidatedSale(order);

/** Day of a validated sale: its delivery date (order date for older orders without one). */
export function saleDay(order: AdminOrder) {
  const date = order.deliveredAt ?? order.createdAt;
  return date ? isoDay(new Date(date)) : '';
}

/** Day the order was placed. */
export function orderDay(order: AdminOrder) {
  return order.createdAt ? isoDay(new Date(order.createdAt)) : '';
}
