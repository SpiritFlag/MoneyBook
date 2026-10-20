import test from "node:test";
import assert from "node:assert/strict";
import { cardActivity } from "./card-activity";
import type { Card } from "./card";
import { newExpense, type Expense } from "./expense";
import { newOperation, newRow, statementRows, type BookData, type Operation, type OperationInput } from "./operations";
import { newAsset } from "./asset";

const date = "2026-10-21";
const metadata = { revision: 1, createdAt: date, updatedAt: date };
const credit: Card = { id: "credit", name: "생활 카드", issuer: "카드사", kind: "credit", assetId: null, ...metadata };
const debit: Card = { ...credit, id: "debit", name: "체크 카드", kind: "debit", assetId: "bank" };
function expense(id: string, patch: Partial<Expense> = {}): Expense {
  return { ...newExpense(date), ...metadata, id, title: id, paymentKind: "card", paymentMethod: credit.name, paidAmount: "10000", ...patch };
}
function operation(id: string, kind: OperationInput["kind"], patch: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, date), ...metadata, id, ...patch };
}
function book(expenses: Expense[], operations: Operation[] = []): BookData {
  return { cards: [credit, debit], assets: [{ ...newAsset(date), ...metadata, id: "bank", name: "계좌", currency: "USD" }], expenses, operations };
}

test("카드 승인목록은 실제 승인일·전체액을 쓰며 본인 소비·05시 장부일과 분리한다", () => {
  const data = book([
    expense("shared", { shared: true, ownAmount: "3000", paymentDate: "2026-09-30", useDate: date }),
    expense("early", { paymentDate: "2026-10-01", time: "01:00" }),
    expense("late", { paymentDate: "2026-10-01", time: "23:00" }),
    expense("other", { paymentMethod: "다른 카드" }),
    expense("account", { paymentKind: "account" }),
    expense("debit", { paymentKind: "debit", debitCardId: debit.id }),
  ]);
  assert.deepEqual(cardActivity(credit, data).map(row => row.id), ["late", "early", "shared"]);
  assert.equal(cardActivity(credit, data).find(row => row.id === "shared")?.amount, "10000");
  assert.deepEqual(cardActivity(credit, data, "2026-10-01", "2026-10-01").map(row => row.id), ["late", "early"]);
  assert.deepEqual(cardActivity(debit, data).map(row => row.id), ["debit"]);
});

test("취소·원화 미확정·검산 완료 승인도 숨기지 않고 임시저장과 확정을 구분한다", () => {
  const data = book([expense("cancelled"), expense("fx", { currency: "USD", paidAmount: "10.50", krwAmount: null }), expense("confirmed"), expense("draft")], [
    operation("cancel", "cancel", { sourceId: "cancelled" }),
    operation("bill", "statement", { card: credit.name, selected: ["confirmed"], verified: true, billingDiscounts: [{ rowId: "confirmed", amount: "1000" }] }),
    operation("draft-bill", "statement", { card: credit.name, selected: ["draft", "confirmed"] }),
  ]);
  const rows = cardActivity(credit, data);
  assert.equal(rows.length, 4);
  assert.equal(rows.find(row => row.id === "cancelled")?.cancelled, true);
  assert.equal(rows.find(row => row.id === "cancelled")?.amount, "10000");
  assert.equal(rows.find(row => row.id === "fx")?.krwAmount, null);
  assert.equal(rows.find(row => row.id === "fx")?.amount, "10.50");
  assert.equal(rows.find(row => row.id === "confirmed")?.statement?.id, "bill");
  assert.equal(rows.find(row => row.id === "confirmed")?.amount, "10000");
  assert.equal(rows.find(row => row.id === "draft")?.draft?.id, "draft-bill");
});

test("카드 충전은 명세서와 같은 승인 ID·단계 날짜·금액을 사용하고 연결 충전은 원지출로 연다", () => {
  const topup = operation("topup", "transfer", { parentId: "source", rows: [
    { ...newRow("2026-10-02", "first"), name: "충전", cardId: credit.id, amount: "9000", received: "10000", baseAmount: "10000", discount: "1000", time: "09:00" },
    { ...newRow(date, "debit"), debitCardId: debit.id, fromId: "bank", amount: "5.50", received: "5.50" },
  ] });
  const data = book([], [topup]);
  const rows = cardActivity(credit, data);
  const candidates = statementRows({ ...newOperation("statement", date), card: credit.name }, data);
  assert.equal(rows[0].id, candidates[0].id);
  assert.equal(rows[0].amount, "9000");
  assert.equal(rows[0].date, "2026-10-02");
  assert.equal(rows[0].href, "/transactions/source");
  assert.equal(rows[0].topup, true);
  assert.equal(cardActivity(debit, data)[0].currency, "USD");
  assert.equal(cardActivity(debit, data)[0].amount, "5.50");
});

test("해외 승인 원통화와 확정 원화액을 구분하고 빈 카드는 빈 목록을 반환한다", () => {
  const data = book([expense("fx", { currency: "USD", paidAmount: "10", krwAmount: "14000" })]);
  const row = cardActivity(credit, data)[0];
  assert.equal(row.currency, "USD");
  assert.equal(row.amount, "10");
  assert.equal(row.krwAmount, 14000);
  assert.deepEqual(cardActivity({ ...credit, name: "빈 카드" }, data), []);
});
