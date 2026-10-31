import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { newExpense, expenseInputSchema, type Expense } from "./expense";
import { recurringDraft, recurringRows, shiftMonth } from "./recurring";
import { createExpenseRepository } from "./expense-repository";

function source(overrides: Partial<Expense> = {}): Expense {
  return { ...newExpense("2026-10-31"), id: "source", revision: 1, createdAt: "2026-10-31", updatedAt: "2026-10-31", title: "구독", category: "membership", paymentMethod: "예시 카드", paidAmount: "10000", useKind: "period", monthlyRecurring: true, useDate: "2026-10-01", useEnd: "2026-10-31", items: [{ id: "item", name: "이용권", unitPrice: "11000", quantity: 1, discounts: [{ id: "discount", name: "할인", amount: "1000" }] }], adjustments: [], memo: "계약 메모", ...overrides };
}
test("지난달 전체 명세를 독립된 초안으로 복사하며 말일·윤년·연도를 처리한다", () => {
  const original = source(), before = structuredClone(original);
  let id = 0;
  const draft = recurringDraft(original, "2026-11", () => `new-${++id}`);
  assert.equal(draft.paymentDate, "2026-11-30");
  assert.equal(draft.useDate, "2026-11-01");
  assert.equal(draft.useEnd, "2026-11-30");
  assert.equal(draft.items[0].discounts[0].amount, "1000");
  assert.notEqual(draft.items[0].id, original.items[0].id);
  assert.equal(draft.memo, original.memo);
  assert.equal(draft.recurringSeriesId, original.id);
  assert.equal(draft.recurringSourceId, original.id);
  assert.equal("id" in draft, false);
  assert.equal(expenseInputSchema.safeParse(draft).success, true);
  draft.items[0].name = "다른 명세";
  assert.deepEqual(original, before);
  assert.equal(recurringDraft(source({ paymentDate: "2028-01-31", useDate: "2028-01-31", useEnd: "2028-02-29" }), "2028-02").useEnd, "2028-03-31");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("1900-01", -1), null);
  assert.equal(shiftMonth("9999-12", 1), null);
});
test("외화 평가·시각·정렬 연결을 초기화하고 분담·충전 초안은 유지한다", () => {
  const draft = recurringDraft(source({ currency: "USD", receiptCurrency: "USD", krwAmount: "14000", valuationRate: "1400", valuationSource: "이전 청구", time: "12:30", orderReference: "old", shared: true, ownAmount: "5", topup: { fromId: "account", amount: "10", received: "10", date: "2026-10-30", time: "12:00", sameTime: false, rate: "1" } }), "2026-11");
  assert.equal(draft.krwAmount, null);
  assert.equal(draft.valuationRate, null);
  assert.equal(draft.time, null);
  assert.equal(draft.orderReference, null);
  assert.equal(draft.shared, true);
  assert.equal(draft.ownAmount, "5");
  assert.equal(draft.topup?.date, "2026-11-30");
  assert.equal(draft.topup?.amount, "10");
  assert.throws(() => recurringDraft(source(), "2026-12"));
  assert.throws(() => recurringDraft(source({ monthlyRecurring: false }), "2026-11"));
  assert.equal(expenseInputSchema.safeParse({ ...source(), useKind: "once" }).success, false);
});
test("반복 표는 같은 이름의 별도 계약과 현재·지난달·중단을 구별한다", () => {
  const old = source();
  const current = source({ ...recurringDraft(old, "2026-11"), id: "current" });
  const rows = recurringRows([old, current, source({ id: "other" }), source({ id: "once", monthlyRecurring: false })], "2026-11");
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.id === "source")?.current[0].id, "current");
  assert.equal(rows.find(r => r.id === "source")?.previous?.id, "source");
  assert.equal(recurringRows([old], "2026-12")[0].previous, undefined);
  assert.equal(recurringRows([old, { ...current, monthlyRecurring: false }], "2026-12").length, 0);
});
test("저장·재조회로 설정과 명세를 보존하고 동시 중복 기록을 거절한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-recurring-"));
  try {
    const repo = createExpenseRepository(path.join(directory, "book.json"), undefined, []);
    await repo.save(source(), "source", null);
    const original = (await repo.list())[0];
    assert.equal(original.recurringSeriesId, "source");
    await repo.save(source(), "source", null);
    const draft = recurringDraft(original, "2026-11");
    assert.equal((await repo.list()).length, 1);
    const results = await Promise.allSettled([repo.save(draft, "next-a", null), repo.save(draft, "next-b", null)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected").length, 1);
    const saved = await repo.list();
    assert.equal(saved.length, 2);
    assert.deepEqual(saved.find(e => e.id !== original.id)?.items, draft.items);
    assert.deepEqual(saved.find(e => e.id === original.id), original);
    await repo.save(draft, saved.find(e => e.id !== original.id)!.id, null);
    assert.equal((await repo.list()).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
