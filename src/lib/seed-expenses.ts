import { newExpense, type Expense, type ExpenseInput } from "./expense";

function seed(id: string, date: string, values: Partial<ExpenseInput>): Expense {
  return { ...newExpense(date), paymentMethod: "예시 카드", paidAmount: "0", ...values, id, revision: 1, createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z" };
}
// 실제 기록과 무관하게 새로 작성한 공개용 예시입니다.
export const seedExpenses: Expense[] = [
  seed("demo-1", "2026-10-18", { title: "동네 식당에서 점심", paidAmount: "24000", shared: true, ownAmount: "12000", time: "12:30", items: [
    { id: "lunch-1", name: "오늘의 정식", unitPrice: "13000", quantity: 2, discounts: [{ id: "lunch-discount", name: "점심 할인", amount: "2000" }] },
  ], memo: "둘이 함께 먹은 점심. 내 몫만 소비로 기록했어요." }),
  seed("demo-2", "2026-10-18", { title: "오후의 커피", paidAmount: "4500", time: "14:10", paymentKind: "account", paymentMethod: "예시 체크카드", items: [{ id: "coffee-1", name: "아메리카노", unitPrice: "4500", quantity: 1, discounts: [] }] }),
  seed("demo-3", "2026-10-18", { title: "주방 수세미", category: "goods", paidAmount: "3000", paymentKind: "account", paymentMethod: "예시 계좌" }),
  seed("demo-4", "2026-10-17", { title: "집으로 오는 버스", category: "transport", paidAmount: "1500", time: "18:20", paymentKind: "stored", paymentMethod: "예시 교통카드" }),
  seed("demo-5", "2026-10-15", { title: "일 년 동안 쓰는 작업 도구", category: "digital", paidAmount: "120005", useKind: "period", useDate: "2026-10-15", useEnd: "2027-10-14", allocation: "annual", items: [{ id: "annual-1", name: "연간 이용권", unitPrice: "120005", quantity: 1, discounts: [] }] }),
  seed("demo-6", "2026-10-16", { title: "해외 서점에서 산 책", category: "hobby", currency: "USD", receiptCurrency: "USD", paidAmount: "18.50", items: [{ id: "book-1", name: "일러스트 책", unitPrice: "18.50", quantity: 1, discounts: [] }] }),
];
