import { useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, InputGroup, Modal, Row, Table } from 'react-bootstrap';
import { deleteAdminExpense, saveAdminExpense, type Expense } from '../api/client';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENTS,
  FINANCE_PERIODS,
  categoryInfo,
  inRange,
  isoDay,
  paymentLabel,
  periodRange,
  type FinancePeriod,
} from '../config/finance';
import { formatPrice } from '../utils/formatPrice';

const emptyExpense = (): Expense => ({
  id: '',
  date: isoDay(new Date()),
  category: 'matieres',
  label: '',
  amount: 0,
  paymentMethod: 'especes',
  note: '',
});

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

interface Props {
  expenses: Expense[];
  onChange: (expenses: Expense[]) => void;
}

/** "Charges": workshop expenses (consumables, electricity, maintenance…), by period and category. */
export function AdminExpenses({ expenses, onChange }: Props) {
  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');

  const range = periodRange(period);
  const inPeriod = useMemo(
    () => expenses.filter((expense) => inRange(expense.date, range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, period],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inPeriod
      .filter((expense) => category === 'all' || expense.category === category)
      .filter((expense) => !term || `${expense.label} ${expense.note}`.toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [inPeriod, category, search]);

  const total = inPeriod.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = useMemo(() => {
    const sums = new Map<string, number>();
    inPeriod.forEach((expense) => sums.set(expense.category, (sums.get(expense.category) ?? 0) + expense.amount));
    return [...sums.entries()].sort((a, b) => b[1] - a[1]);
  }, [inPeriod]);
  const largest = byCategory[0]?.[1] ?? 0;
  const visibleTotal = visible.reduce((sum, expense) => sum + expense.amount, 0);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!(draft.amount > 0)) {
      setModalError('Le montant doit être supérieur à 0.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const saved = await saveAdminExpense({ ...draft, label: draft.label.trim(), note: draft.note.trim() });
      onChange(draft.id
        ? expenses.map((expense) => (expense.id === saved.id ? saved : expense))
        : [saved, ...expenses]);
      setDraft(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Impossible d’enregistrer cette charge.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (expense: Expense) => {
    if (!window.confirm(`Supprimer la charge « ${expense.label} » (${formatPrice(expense.amount)}) ?`)) return;
    setError('');
    try {
      await deleteAdminExpense(expense.id);
      onChange(expenses.filter((item) => item.id !== expense.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de supprimer cette charge.');
    }
  };

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
        <Button className="btn-brand ms-auto" onClick={() => { setDraft(emptyExpense()); setModalError(''); }}>
          + Ajouter une charge
        </Button>
      </div>

      {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}

      <div className="finance-stats">
        <div className="finance-stat is-expense">
          <span className="finance-stat-label">Total des charges</span>
          <span className="finance-stat-value">{formatPrice(total)}</span>
          <span className="finance-stat-sub">{FINANCE_PERIODS.find((p) => p.value === period)?.label}</span>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Dépenses enregistrées</span>
          <span className="finance-stat-value">{inPeriod.length}</span>
          <span className="finance-stat-sub">sur la période</span>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Premier poste</span>
          <span className="finance-stat-value is-text">{byCategory[0] ? categoryInfo(byCategory[0][0]).label : '—'}</span>
          <span className="finance-stat-sub">
            {byCategory[0] && total > 0 ? `${formatPrice(byCategory[0][1])} · ${Math.round((byCategory[0][1] / total) * 100)} %` : 'aucune charge'}
          </span>
        </div>
      </div>

      <Row className="g-4">
        <Col lg={4}>
          <section className="finance-panel">
            <h2 className="finance-panel-title">Répartition par catégorie</h2>
            {byCategory.length === 0 ? (
              <p className="text-secondary small mb-0">Aucune charge sur cette période.</p>
            ) : (
              <ul className="finance-bars">
                {byCategory.map(([key, amount]) => (
                  <li key={key}>
                    <button
                      type="button"
                      className={`finance-bar-row${category === key ? ' is-active' : ''}`}
                      onClick={() => setCategory(category === key ? 'all' : key)}
                      title={`${categoryInfo(key).label} : ${formatPrice(amount)} (${Math.round((amount / total) * 100)} %) — cliquer pour filtrer`}
                    >
                      <span className="finance-bar-label">
                        <span>{categoryInfo(key).label}</span>
                        <span className="finance-bar-value">{formatPrice(amount)}</span>
                      </span>
                      <span className="finance-bar-track">
                        <span className="finance-bar is-expense" style={{ width: `${Math.max(2, (amount / largest) * 100)}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Col>

        <Col lg={8}>
          <section className="finance-panel p-0 overflow-hidden">
            <div className="finance-list-tools">
              <Form.Select
                size="sm"
                aria-label="Catégorie"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">Toutes les catégories</option>
                {EXPENSE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Form.Select>
              <Form.Control
                size="sm"
                type="search"
                placeholder="Rechercher un libellé…"
                aria-label="Rechercher une charge"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="table-responsive">
              <Table hover className="align-middle mb-0 admin-product-table finance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Charge</th>
                    <th>Paiement</th>
                    <th className="text-end">Montant</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={5} className="text-secondary">Aucune charge à afficher.</td></tr>
                  )}
                  {visible.map((expense) => (
                    <tr key={expense.id}>
                      <td className="text-nowrap">{dayLabel(expense.date)}</td>
                      <td>
                        <div className="fw-semibold">{expense.label}</div>
                        <div className="admin-order-muted">
                          {categoryInfo(expense.category).label}
                          {expense.note ? ` · ${expense.note}` : ''}
                        </div>
                      </td>
                      <td className="text-nowrap">{paymentLabel(expense.paymentMethod)}</td>
                      <td className="text-end text-nowrap fw-bold">{formatPrice(expense.amount)}</td>
                      <td className="text-center text-nowrap">
                        <Button
                          variant="link"
                          className="admin-icon-btn"
                          title="Modifier"
                          aria-label={`Modifier la charge ${expense.label}`}
                          onClick={() => { setDraft({ ...expense }); setModalError(''); }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </Button>
                        <Button
                          variant="link"
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Supprimer"
                          aria-label={`Supprimer la charge ${expense.label}`}
                          onClick={() => void onDelete(expense)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {visible.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="text-secondary">{visible.length} charge{visible.length > 1 ? 's' : ''}</td>
                      <td className="text-end text-nowrap fw-bold">{formatPrice(visibleTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </section>
        </Col>
      </Row>

      <Modal show={draft !== null} onHide={() => setDraft(null)} centered className="finance-modal">
        {draft && (
          <Form onSubmit={onSave}>
            <Modal.Header closeButton>
              <Modal.Title>{draft.id ? 'Modifier la charge' : 'Ajouter une charge'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {modalError && <Alert variant="warning" dismissible onClose={() => setModalError('')}>{modalError}</Alert>}
              <Row className="g-3">
                <Col xs={12}>
                  <Form.Group controlId="expense-label">
                    <Form.Label>Libellé</Form.Label>
                    <Form.Control
                      required
                      maxLength={160}
                      placeholder="Ex. 3 bobines PLA noir 1 kg"
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col sm={6}>
                  <Form.Group controlId="expense-category">
                    <Form.Label>Catégorie</Form.Label>
                    <Form.Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                      {EXPENSE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col sm={6}>
                  <Form.Group controlId="expense-date">
                    <Form.Label>Date</Form.Label>
                    <Form.Control
                      type="date"
                      required
                      value={draft.date}
                      onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col sm={6}>
                  <Form.Group controlId="expense-amount">
                    <Form.Label>Montant</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type="number"
                        min={0.01}
                        step="0.01"
                        required
                        value={draft.amount || ''}
                        onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                      />
                      <InputGroup.Text>DH</InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                </Col>
                <Col sm={6}>
                  <Form.Group controlId="expense-payment">
                    <Form.Label>Payé par</Form.Label>
                    <Form.Select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>
                      {EXPENSE_PAYMENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group controlId="expense-note">
                    <Form.Label>Note <span className="fw-normal text-secondary">(facultatif)</span></Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      maxLength={1000}
                      placeholder="Fournisseur, n° de facture…"
                      value={draft.note}
                      onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setDraft(null)}>Annuler</Button>
              <Button type="submit" className="btn-brand" disabled={saving}>
                {saving ? 'Enregistrement…' : draft.id ? 'Enregistrer' : 'Ajouter la charge'}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
