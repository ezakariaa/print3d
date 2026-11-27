import type { AdminOrder } from '../api/client';
import { isoDay } from '../config/finance';

/**
 * A sale is validated, and counts in the revenue, only when the order is "Terminée"
 * AND has been delivered. Every other order that is not cancelled is a sale in progress.
 */
export const isValidatedSale = (order: AdminOrder) => order.status === 'completed' && order.delivered === true;

export const isSaleInProgress = (order: AdminOrder) => order.status !== 'cancelled' && !isValidatedSale(order);

/** Day of a validated sale: its delivery date (order date for older orders without one). */
export function saleDay(order: AdminOrder) {
  const date = order.deliveredAt ?? order.createdAt;
  return date ? isoDay(new Date(date)) : '';
}

/** Day the order was placed. */
export function orderDay(order: AdminOrder) {
  return order.createdAt ? isoDay(new Date(order.createdAt)) : '';
}
