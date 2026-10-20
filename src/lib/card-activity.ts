import type { Card } from "./card";
import { toMinor, type Currency } from "./expense";
import { cardAmount, type BookData, type Operation } from "./operations";

export type CardActivity = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  amount: string;
  currency: Currency;
  krwAmount: number | null;
  href: string;
  topup: boolean;
  cancelled: boolean;
  statement?: Operation;
  draft?: Operation;
};

// Approval dates and full payment amounts are independent of usage dates and personal shares.
export function cardActivity(card: Card, book: BookData, start = "", end = ""): CardActivity[] {
  const statements = book.operations.filter(op => op.kind === "statement" && op.card === card.name)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const status = (id: string) => ({
    cancelled: book.operations.some(op => op.kind === "cancel" && op.sourceId === id),
    statement: statements.find(op => op.verified && op.selected.includes(id)),
    draft: statements.find(op => !op.verified && op.selected.includes(id)),
  });
  const expenses: CardActivity[] = book.expenses
    .filter(e => card.kind === "debit" ? e.paymentKind === "debit" && e.debitCardId === card.id
      : e.paymentKind === "card" && e.paymentMethod === card.name)
    .map(e => ({ id: e.id, title: e.title, date: e.paymentDate, time: e.time,
      amount: e.paidAmount, currency: e.currency, krwAmount: cardAmount(e),
      href: `/transactions/${e.id}`, topup: false, ...status(e.id) }));
  const topups: CardActivity[] = book.operations.filter(op => op.kind === "transfer").flatMap(op => op.rows
    .filter(row => card.kind === "debit" ? row.debitCardId === card.id : row.cardId === card.id)
    .map(row => {
      const id = `transfer:${op.id}/${row.id}`;
      const currency = card.kind === "debit" ? book.assets.find(a => a.id === row.fromId)?.currency ?? "KRW" : "KRW";
      return { id, title: `${op.title} · ${row.name || "카드 충전"}`, date: row.date, time: row.time,
        amount: row.amount, currency, krwAmount: currency === "KRW" ? toMinor(row.amount, "KRW") : null,
        href: op.parentId ? `/transactions/${op.parentId}` : `/records/${op.id}`, topup: true, ...status(id) };
    }));
  return [...expenses, ...topups].filter(row => (!start || row.date >= start) && (!end || row.date <= end))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "") || a.id.localeCompare(b.id));
}
