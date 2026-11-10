import { categories, type Currency } from "./expense";
import { incomeCategories, operationLabels, type BookData } from "./operations";

export type RecordSearchQuery = { query: string; start: string; end: string; collection: string };
export type RecordSearchRow = {
  id: string; href: string; title: string; label: string; date: string;
  amount: string; currency: Currency; context: string; memo: string;
};
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR");

/** Search saved originals, without duplicating derived consumption records or changing amounts. */
export function searchBookRecords(book: BookData, query: RecordSearchQuery): RecordSearchRow[] {
  const terms = normalize(query.query).trim().split(/\s+/).filter(Boolean);
  const inRange = (dates: string[]) => dates.some(date => (!query.start || date >= query.start) && (!query.end || date <= query.end));
  const matches = (fields: string[]) => {
    const text = normalize(fields.join(" "));
    return terms.every(term => text.includes(term));
  };
  const assetNames = new Map(book.assets.map(asset => [asset.id, asset.name]));
  const cardNames = new Map((book.cards ?? []).map(card => [card.id, card.name]));
  const name = (id: string) => assetNames.get(id) ?? cardNames.get(id) ?? "";
  const rows: RecordSearchRow[] = [];
  if (query.collection !== "operations") for (const expense of book.expenses) {
    const label = categories[expense.category].label;
    const details = expense.items.map(item => `${item.name} × ${item.quantity}`);
    const context = [expense.paymentMethod, ...details].join(" · ");
    if (!inRange([expense.paymentDate]) || !matches([
      expense.title, expense.memo, label, context, name(expense.assetId ?? ""),
      ...expense.items.flatMap(item => [item.category ? categories[item.category].label : "", ...item.discounts.map(discount => discount.name)]),
      ...expense.adjustments.map(adjustment => adjustment.name),
    ])) continue;
    rows.push({ id: `expense:${expense.id}`, href: `/transactions/${encodeURIComponent(expense.id)}`, title: expense.title,
      label: `지출 · ${label}`, date: expense.paymentDate, amount: expense.paidAmount, currency: expense.currency, context, memo: expense.memo });
  }
  if (query.collection !== "expenses") for (const operation of book.operations) {
    const dates = [operation.date, ...operation.rows.map(row => row.date), ...(operation.payment ? [operation.payment.date] : []),
      ...(operation.transitFunding ? [operation.transitFunding.date] : []), ...(operation.transitPaymentDate ? [operation.transitPaymentDate] : [])];
    const details = [name(operation.assetId), name(operation.card),
      ...operation.rows.flatMap(row => [row.name, row.route, name(row.fromId), name(row.toId), name(row.cardId ?? "")]),
      ...(operation.journey ?? []).flatMap(leg => [leg.board.place, leg.alight.place, leg.vehicle.route, leg.vehicle.number]),
      ...(operation.template ? [operation.template.paymentMethod, ...operation.template.items.map(item => item.name)] : [])].filter(Boolean);
    const label = operationLabels[operation.kind];
    if (!inRange(dates) || !matches([operation.title, operation.memo, label,
      operation.kind === "income" ? incomeCategories[operation.incomeCategory].label : "", ...details])) continue;
    rows.push({ id: `operation:${operation.id}`, href: `/records/${encodeURIComponent(operation.id)}`, title: operation.title,
      label, date: operation.date, amount: operation.amount, currency: operation.currency, context: details.join(" · "), memo: operation.memo });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
