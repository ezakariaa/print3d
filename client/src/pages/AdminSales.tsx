import { useMemo, useState } from 'react';
import { Col, Form, Row, Table } from 'react-bootstrap';
import { PAYMENT_METHOD_LABELS, type AdminOrder, type Expense, type PaymentMethod } from '../api/client';
import { FINANCE_PERIODS, inRange, monthLabel, periodRange, type FinancePeriod } from '../config/finance';
import { formatPrice } from '../utils/formatPrice';
import { isSaleInProgress, isValidatedSale, orderDay, saleDay } from '../utils/sales';

/** Months shown on the sales / expenses chart. */
const CHART_MONTHS = 6;

interface Props {
  orders: AdminOrder[];
  expenses: Expense[];
}

/**
 * "Ventes": revenue from validated sales only (orders "Terminée" AND delivered, dated by delivery),
 * the sales still in progress, and the comparison with the expenses.
 */
export function AdminSales({ orders, expenses }: Props) {
  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [hovered, setHovered] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const sales = useMemo(() => orders.filter((order) => isValidatedSale(order) && saleDay(order)), [orders]);
  const inProgress = useMemo(() => orders.filter(isSaleInProgress), [orders]);
  const inProgressTotal = inProgress.reduce((sum, order) => sum + order.total, 0);
  const range = periodRange(period);
  const periodSales = sales.filter((order) => inRange(saleDay(order), range));
  const periodExpenses = expenses.filter((expense) => inRange(expense.date, range));

  const revenue = periodSales.reduce((sum, order) => sum + order.total, 0);
  const shipping = periodSales.reduce((sum, order) => sum + (order.shipping?.price ?? 0), 0);
  const charges = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const result = revenue - charges;
  const average = periodSales.length ? revenue / periodSales.length : 0;
  const cancelled = orders.filter((order) => order.status === 'cancelled' && inRange(orderDay(order), range)).length;

  // Last months, oldest first, for the chart.
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: CHART_MONTHS }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (CHART_MONTHS - 1 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        sales: sales.filter((order) => saleDay(order).startsWith(key)).reduce((sum, order) => sum + order.total, 0),
        charges: expenses.filter((expense) => expense.date.startsWith(key)).reduce((sum, expense) => sum + expense.amount, 0),
      };
    });
  }, [sales, expenses]);
  const chartMax = Math.max(1, ...months.flatMap((month) => [month.sales, month.charges]));

  const byPayment = useMemo(() => {
    const sums = new Map<string, { count: number; amount: number }>();
    periodSales.forEach((order) => {
      const key = order.paymentMethod ?? 'autre';
      const entry = sums.get(key) ?? { count: 0, amount: 0 };
      sums.set(key, { count: entry.count + 1, amount: entry.amount + order.total });
    });
    return [...sums.entries()].sort((a, b) => b[1].amount - a[1].amount);
  }, [periodSales]);

  const topProducts = useMemo(() => {
    const sums = new Map<string, { quantity: number; amount: number }>();
    periodSales.forEach((order) => order.items.forEach((item) => {
      const entry = sums.get(item.name) ?? { quantity: 0, amount: 0 };
      sums.set(item.name, { quantity: entry.quantity + item.quantity, amount: entry.amount + item.price * item.quantity });
    }));
    return [...sums.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  }, [periodSales]);
  const topMax = topProducts[0]?.[1].amount ?? 0;

  const periodName = FINANCE_PERIODS.find((p) => p.value === period)?.label;

  return (
    <div className="finance">
      <div className="finance-toolbar">
        <Form.Select
          className="finance-period"
          aria-label="Période"
          value={period}
          onChange={(e) => setPeriod(e.target.value as FinancePeriod)}
        >
          {FINANCE_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Form.Select>
        <span className="text-secondary small">
          Chiffre d’affaires = commandes <strong>terminées et livrées</strong>, à la date de livraison. Annulées exclues{cancelled ? ` (${cancelled} sur la période)` : ''}.
        </span>
      </div>

      <div className="finance-stats is-6">
        <div className="finance-stat is-sales">
          <span className="finance-stat-label">Chiffre d’affaires</span>
          <span className="finance-stat-value">{formatPrice(revenue)}</span>
          <span className="finance-stat-sub">ventes validées · dont livraison {formatPrice(shipping)}</span>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Ventes validées</span>
          <span className="finance-stat-value">{periodSales.length}</span>
          <span className="finance-stat-sub">{periodName}</span>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Panier moyen</span>
          <span className="finance-stat-value">{formatPrice(average)}</span>
          <span className="finance-stat-sub">par vente validée</span>
        </div>
        <div className="finance-stat is-progress">
          <span className="finance-stat-label">Ventes en cours</span>
          <span className="finance-stat-value">{formatPrice(inProgressTotal)}</span>
          <span className="finance-stat-sub">{inProgress.length} commande{inProgress.length > 1 ? 's' : ''} pas encore terminée{inProgress.length > 1 ? 's' : ''} et livrée{inProgress.length > 1 ? 's' : ''}</span>
        </div>
        <div className="finance-stat is-expense">
          <span className="finance-stat-label">Charges</span>
          <span className="finance-stat-value">{formatPrice(charges)}</span>
          <span className="finance-stat-sub">{periodExpenses.length} dépense{periodExpenses.length > 1 ? 's' : ''}</span>
        </div>
        <div className={`finance-stat ${result >= 0 ? 'is-positive' : 'is-negative'}`}>
          <span className="finance-stat-label">Résultat</span>
          <span className="finance-stat-value">{result >= 0 ? '+' : '−'}{formatPrice(Math.abs(result))}</span>
          <span className="finance-stat-sub">{result >= 0 ? 'Bénéfice' : 'Perte'} (ventes − charges)</span>
        </div>
      </div>

      <section className="finance-panel mb-4">
        <div className="finance-chart-head">
          <h2 className="finance-panel-title mb-0">Ventes validées et charges, {CHART_MONTHS} derniers mois</h2>
          <div className="finance-legend">
            <span><i className="is-sales" aria-hidden="true" />Ventes</span>
            <span><i className="is-expense" aria-hidden="true" />Charges</span>
            <button type="button" className="shop-reset" onClick={() => setShowTable((value) => !value)}>
              {showTable ? 'Voir le graphique' : 'Voir le tableau'}
            </button>
          </div>
        </div>

        {showTable ? (
          <Table size="sm" className="mb-0 admin-product-table">
            <thead><tr><th>Mois</th><th className="text-end">Ventes</th><th className="text-end">Charges</th><th className="text-end">Résultat</th></tr></thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.key}>
                  <td>{monthLabel(month.key)}</td>
                  <td className="text-end">{formatPrice(month.sales)}</td>
                  <td className="text-end">{formatPrice(month.charges)}</td>
                  <td className="text-end fw-bold">{formatPrice(month.sales - month.charges)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="finance-chart" role="img" aria-label="Ventes et charges par mois (le tableau est disponible avec « Voir le tableau »)">
            {months.map((month, index) => (
              <div
                key={month.key}
                className={`finance-chart-group${hovered === month.key ? ' is-hovered' : ''}${index >= CHART_MONTHS - 2 ? ' is-end' : ''}`}
                onMouseEnter={() => setHovered(month.key)}
                onMouseLeave={() => setHovered(null)}
              >
                {hovered === month.key && (
                  <div className="finance-tooltip">
                    <strong>{monthLabel(month.key)}</strong>
                    <span><i className="is-sales" />Ventes {formatPrice(month.sales)}</span>
                    <span><i className="is-expense" />Charges {formatPrice(month.charges)}</span>
                    <span>Résultat {formatPrice(month.sales - month.charges)}</span>
                  </div>
                )}
                <div className="finance-chart-bars">
                  <span className="finance-chart-bar is-sales" style={{ height: `${(month.sales / chartMax) * 100}%` }} />
                  <span className="finance-chart-bar is-expense" style={{ height: `${(month.charges / chartMax) * 100}%` }} />
                </div>
                <span className="finance-chart-label">{monthLabel(month.key)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Row className="g-4">
        <Col lg={7}>
          <section className="finance-panel h-100">
            <h2 className="finance-panel-title">Produits les plus vendus</h2>
            {topProducts.length === 0 ? (
              <p className="text-secondary small mb-0">Aucune vente sur cette période.</p>
            ) : (
              <ul className="finance-bars">
                {topProducts.map(([name, entry]) => (
                  <li key={name} className="finance-bar-row is-static" title={`${name} : ${entry.quantity} vendu(s), ${formatPrice(entry.amount)}`}>
                    <span className="finance-bar-label">
                      <span>{name} <small className="text-secondary">× {entry.quantity}</small></span>
                      <span className="finance-bar-value">{formatPrice(entry.amount)}</span>
                    </span>
                    <span className="finance-bar-track">
                      <span className="finance-bar is-sales" style={{ width: `${Math.max(2, (entry.amount / topMax) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Col>
        <Col lg={5}>
          <section className="finance-panel h-100">
            <h2 className="finance-panel-title">Modes de paiement</h2>
            {byPayment.length === 0 ? (
              <p className="text-secondary small mb-0">Aucune vente sur cette période.</p>
            ) : (
              <ul className="finance-payments">
                {byPayment.map(([key, entry]) => (
                  <li key={key}>
                    <span>
                      {PAYMENT_METHOD_LABELS[key as PaymentMethod] ?? 'Non précisé'}
                      <small>{entry.count} commande{entry.count > 1 ? 's' : ''}</small>
                    </span>
                    <span className="fw-bold">{formatPrice(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Col>
      </Row>
    </div>
  );
}
