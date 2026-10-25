import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { categories, expenseInputSchema, expenseSchema, toMinor, receiptSummary, ownKrw, daySummary, monthAmount, appearsOnDay, dailyExpenses, dayTime } from "./expense";
import { seedExpenses } from "./seed-expenses";
import { createExpenseRepository } from "./expense-repository";

test("공개 예시가 저장 스키마를 충족한다", () => { for (const item of seedExpenses) assert.ok(expenseSchema.safeParse(item).success); });

test("상품 순서를 바꿔 저장·재조회해도 상품 ID·할인 연결·금액을 보존한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-receipt-order-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const file = path.join(directory, "ledger.json");
    const repo = createExpenseRepository(file);
    const input = { ...seedExpenses[0], items: [
      { id: "sandwich", name: "샌드위치", unitPrice: "3100", quantity: 1, discounts: [] },
      { id: "coffee", name: "커피", unitPrice: "1800", quantity: 1, discounts: [{ id: "coupon", name: "상품 할인", amount: "1000" }] },
    ] };
    await repo.save(input, "reorder", null);
    const before = (await repo.list()).find(e => e.id === "reorder")!;
    await repo.save({ ...before, items: [before.items[1], before.items[0]] }, before.id, before.revision);
    const after = (await createExpenseRepository(file).list()).find(e => e.id === before.id)!;
    assert.deepEqual(after.items, [before.items[1], before.items[0]]);
    assert.equal(after.items[0].discounts[0].id, "coupon");
    assert.deepEqual(receiptSummary(after), receiptSummary(before));
    assert.equal(after.paidAmount, before.paidAmount);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("통화별 소수·0원·미확정 원화를 구분한다", () => {
  assert.equal(toMinor("0.10", "USD")! + toMinor("0.20", "USD")!, 30);
  assert.equal(toMinor("0.1", "KRW"), null);
  assert.equal(toMinor("0", "KRW"), 0);
  assert.equal(ownKrw(seedExpenses[5]), null);
  assert.equal(ownKrw({ ...seedExpenses[5], krwAmount: "26000", shared: true, ownAmount: "9.25" }), 13000);
});
test("명세 미상·초과·단위 차이를 분리하고 총액은 보존한다", () => {
  const expense = structuredClone(seedExpenses[0]);
  assert.equal(receiptSummary(expense).status, "matched");
  expense.items[0].discounts = [];
  assert.equal(receiptSummary(expense).difference, -2000);
  assert.equal(receiptSummary(expense).status, "over");
  assert.ok(expenseInputSchema.safeParse(expense).success);
  expense.items = [];
  assert.equal(receiptSummary(expense).difference, 24000);
  assert.equal(expense.paidAmount, "24000");
  expense.receiptCurrency = "USD";
  assert.equal(receiptSummary(expense).status, "pending");
  expense.receiptTotal = "5.50";
  assert.equal(receiptSummary(expense).difference, 550);
});
test("과도한 본인 부담·할인·잘못된 기간은 거절한다", () => {
  assert.equal(expenseInputSchema.safeParse({ ...seedExpenses[0], ownAmount: "24001" }).success, false);
  const item = structuredClone(seedExpenses[0]); item.items[0].discounts[0].amount = "26001";
  assert.equal(expenseInputSchema.safeParse(item).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...seedExpenses[4], useEnd: "2025-01-01" }).success, false);
});
test("이용일 기준 소비·결제일 조회·기간형 제외·미확정을 구분한다", () => {
  const item = { ...seedExpenses[0], paymentDate: "2026-10-17" };
  assert.equal(appearsOnDay(item, "2026-10-17"), true);
  assert.equal(daySummary([item], "2026-10-17").total, 0);
  assert.equal(daySummary([item], "2026-10-18").total, 12000);
  assert.equal(daySummary(seedExpenses, "2026-10-15").total, 0);
  assert.deepEqual(daySummary(seedExpenses, "2026-10-16"), { total: 0, pending: 1 });
});
test("연간 배분은 연도를 넘어 원 단위 합계를 보존한다", () => {
  const item = seedExpenses[4];
  assert.equal(monthAmount(item, "2026-10"), 10005);
  assert.equal(monthAmount(item, "2027-09"), 10000);
  assert.equal(monthAmount(item, "2027-10"), undefined);
  assert.equal(monthAmount(item, "2026-09"), undefined);
  let total = 0;
  for (let offset = 0; offset < 12; offset++) total += monthAmount(item, new Date(Date.UTC(2026, 9 + offset, 1)).toISOString().slice(0, 7)) ?? 0;
  assert.equal(total, 120005);
});
test("저장 재개·동시 쓰기·재시도·오래된 수정·손상 파일 보존", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "moneybook-test-"));
  try {
    const file = path.join(folder, "ledger.json");
    const repository = createExpenseRepository(file);
    const input = expenseInputSchema.parse({ ...seedExpenses[0], useTime: "09:15" });
    await Promise.all([repository.save(input, "test-a", null), repository.save(input, "test-b", null)]);
    assert.equal((await createExpenseRepository(file).list()).length, 8);
    assert.equal((await createExpenseRepository(file).list()).find((e) => e.id === "test-a")?.useTime, "09:15");
    assert.equal((await repository.save(input, "test-a", null)).length, 8);
    await assert.rejects(repository.save({ ...input, title: "changed" }, "test-a", null), { status: 409 });
    await repository.save({ ...input, title: "changed" }, "test-a", 1);
    await assert.rejects(repository.save(input, "test-a", 1), { status: 409 });
    assert.equal((await repository.list()).find((e) => e.id === "test-a")?.revision, 2);
    await writeFile(file, "broken");
    await assert.rejects(repository.save(input, "test-c", null), { status: 500 });
    assert.equal(await readFile(file, "utf8"), "broken");
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("이용 시각은 독립적으로 검증하고 이전 기록은 미확인으로 읽는다", () => {
  const legacy = { ...seedExpenses[0], useTime: undefined };
  assert.equal(expenseSchema.parse(legacy).useTime, null);
  assert.equal(expenseSchema.parse({ ...legacy, useTime: "00:00" }).useTime, "00:00");
  assert.equal(expenseSchema.safeParse({ ...legacy, useTime: "24:00" }).success, false);
  assert.equal(expenseSchema.safeParse({ ...legacy, useTime: "12:60" }).success, false);
  assert.equal(dayTime(expenseSchema.parse(legacy), "2026-10-18"), null);
});
test("이용 시각으로 정렬하고 미확인은 마지막, 결제일만 일치하면 결제 시각을 쓴다", () => {
  const base = seedExpenses[0];
  const input = [
    { ...base, id: "unknown", useTime: null, time: "00:00" },
    { ...base, id: "late", useTime: "18:30", time: "01:00" },
    { ...base, id: "early", useTime: "09:00", time: "23:00" },
    { ...base, id: "payment-only", useDate: "2026-10-17", useTime: "22:00", time: "12:00" },
    { ...base, id: "midnight", useTime: "00:00" },
  ];
  assert.deepEqual(dailyExpenses(input, "2026-10-18").map((e) => e.id), ["early", "payment-only", "midnight", "late", "unknown"]);
  assert.equal(input[0].id, "unknown");
  assert.deepEqual(dailyExpenses(input, "2026-10-19"), []);
  const tied = [{ ...base, id: "b", useTime: "09:00" }, { ...base, id: "a", useTime: "09:00" }];
  assert.deepEqual(dailyExpenses(tied, "2026-10-18").map((e) => e.id), ["a", "b"]);
});

test("기존 23종과 대출·혼합 카테고리의 아이콘과 저장 스키마를 모두 지원한다", () => {
  assert.equal(Object.keys(categories).length, 25);
  for (const [category, config] of Object.entries(categories)) {
    assert.equal(expenseInputSchema.safeParse({ ...seedExpenses[0], category, items: category === "mixed" ? seedExpenses[0].items.map(item => ({ ...item, category: "food" })) : seedExpenses[0].items }).success, true, category);
    assert.ok(existsSync(path.join(process.cwd(), "public", config.image)), category);
  }
});
