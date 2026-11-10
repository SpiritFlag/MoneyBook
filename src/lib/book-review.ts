import { receiptSummary, type Expense, type Currency } from "./expense";
import { cancelled, sharedRemaining, tollRemaining, type Operation } from "./operations";

export type ReviewItem = { id: string; title: string; date: string; href: string; amount: number | string; currency: Currency; action: string };
export type ReviewGroup = { id: string; title: string; description: string; state: "check" | "waiting"; items: ReviewItem[] };

export function bookReview(expenses: readonly Expense[], operations: readonly Operation[]): ReviewGroup[] {
  const groups: ReviewGroup[] = [
    { id: "currency", title: "원화 청구액 확인", description: "외화 카드 승인 중 원화 금액이 아직 확정되지 않은 거래예요.", state: "check", items: [] },
    { id: "receipt", title: "명세 검산", description: "명세 합계가 대조 총액을 넘는 거래예요. 표시 금액은 초과 차이예요.", state: "check", items: [] },
    { id: "shared", title: "받을 분담금", description: "함께 결제한 금액 중 아직 회수하지 않은 몫이에요.", state: "waiting", items: [] },
    { id: "toll", title: "통행료 출금 대기", description: "통행료 이용 기록과 아직 연결되지 않은 출금액이에요.", state: "waiting", items: [] },
  ];
  for (const expense of expenses) {
    if (cancelled(expense.id, operations)) continue;
    const base = { id: expense.id, title: expense.title, date: expense.paymentDate, href: `/transactions/${expense.id}` };
    if (expense.paymentKind === "card" && expense.currency !== "KRW" && expense.krwAmount === null) {
      groups[0].items.push({ ...base, amount: expense.paidAmount, currency: expense.currency, action: "거래 확인" });
    }
    const receipt = receiptSummary(expense);
    if (receipt.status === "over" && receipt.difference !== null) {
      groups[1].items.push({ ...base, amount: -receipt.difference, currency: expense.receiptCurrency, action: "명세 확인" });
    }
    const remaining = expense.shared ? sharedRemaining(expense, operations) : 0;
    if (remaining > 0) groups[2].items.push({ ...base, amount: remaining, currency: expense.currency, action: "회수 내역 확인" });
  }
  for (const operation of operations) {
    if (operation.kind !== "toll") continue;
    for (const row of operation.rows) {
      const remaining = tollRemaining(operation, row, operations);
      if (remaining > 0) groups[3].items.push({ id: `${operation.id}/${row.id}`, title: `${operation.title} · ${row.name}`, date: operation.date, href: `/records/${operation.id}`, amount: remaining, currency: "KRW", action: "이용 내역 확인" });
    }
  }
  for (const group of groups) group.items.sort((a, b) => b.date.localeCompare(a.date));
  return groups;
}
