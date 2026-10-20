import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  newExpense,
  dailyExpenses,
  daySummary,
  monthAmount,
  type Expense,
} from "./expense";
import { newAsset, assetPosition, assetLedger, type Asset } from "./asset";
import {
  newOperation,
  newRow,
  operationSchema,
  combineInsuranceAllocations,
  transferDiscounts,
  transferDiscountTotal,
  validateOperations,
  operationPostings,
  consumptionRecords,
  netConsumption,
  sharedRemaining,
  tollRemaining,
  tollPaymentTargets,
  operationExpenses,
  statementRows,
  type Operation,
  type OperationKind,
  type BookData,
} from "./operations";
import { createExpenseRepository } from "./expense-repository";
const date = "2026-10-18";
const metadata = { revision: 1, createdAt: date, updatedAt: date };
function asset(
  id = "bank",
  kind: Asset["kind"] = "account",
  currency: Asset["currency"] = "KRW",
): Asset {
  return {
    ...newAsset(date),
    ...metadata,
    id,
    name: id,
    kind,
    currency,
    openingBalance: "100000",
    valuationRate: "1",
  };
}
function expense(id = "meal", patch: Partial<Expense> = {}): Expense {
  return {
    ...newExpense(date),
    ...metadata,
    id,
    title: id,
    paidAmount: "24000",
    shared: true,
    ownAmount: "12000",
    paymentMethod: "card",
    ...patch,
  };
}
function op(kind: OperationKind, patch: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, date), ...metadata, id: kind, ...patch };
}
const allocation = (targetId: string, amount: string) => ({
  targetId,
  itemId: "",
  amount,
  deductible: "0",
});
const makeBook = (expenses: Expense[], operations: Operation[]): BookData => ({
  expenses,
  operations,
  assets: [asset(), asset("stored", "stored"), asset("usd", "cash", "USD")],
});

test("이동 할인은 이름별로 저장하고 합계를 검증하며 기존 할인도 유지한다", () => {
  const row = { ...newRow(date, "charge"), cardId: "card", toId: "stored",
    amount: "2680", received: "9900", baseAmount: "99000", baseReceived: "9900", rate: "10",
    discounts: [
      { id: "point", name: "삼성전자 포인트", amount: "96000" },
      { id: "coupon", name: "충전 쿠폰", amount: "320" },
    ] };
  const transfer = operationSchema.parse(op("transfer", { rows: [row] }));
  const book = { ...makeBook([], [transfer]), cards: [{ id: "card" }] } as BookData;
  assert.deepEqual(transfer.rows[0].discounts, row.discounts);
  assert.equal(transferDiscountTotal(row, "KRW"), 96320);
  validateOperations(book);
  const check = (patch: Partial<typeof row>) => validateOperations({ ...book, operations: [{ ...transfer, rows: [{ ...row, ...patch }] }] });
  assert.throws(() => check({ amount: "2681" }), /할인 합계/);
  assert.throws(() => check({ discounts: [{ id: "x", name: " ", amount: "96320" }] }), /할인 이름/);
  for (const amount of ["-1", "abc", "1.5", ""]) {
    assert.throws(() => check({ discounts: [{ id: "x", name: "포인트", amount }] }), /금액/);
  }
  check({ discounts: [], amount: "99000", discount: "96320" });
  const legacy = operationSchema.parse(op("transfer", { rows: [{ ...row, discounts: undefined, discount: "96320" }] }));
  assert.equal(transferDiscounts(legacy.rows[0])[0].amount, "96320");
  validateOperations({ ...book, operations: [legacy] });
  const foreign = { ...row, cardId: undefined, fromId: "usd", baseAmount: "1.00", amount: "0.70", received: "1", baseReceived: "1",
    discounts: [{ id: "a", name: "포인트", amount: "0.10" }, { id: "b", name: "쿠폰", amount: "0.20" }] };
  assert.equal(transferDiscountTotal(foreign, "USD"), 30);
  validateOperations({ ...book, operations: [op("transfer", { rows: [foreign] })] });
});

test("분담금 회수는 실제 입금만 만들고 본인 소비를 재차 줄이지 않는다", () => {
  const e = expense(),
    recovery = op("recovery", {
      assetId: "bank",
      amount: "12000",
      allocations: [allocation(e.id, "12000")],
    });
  const book = makeBook([e], [recovery]);
  validateOperations(book);
  assert.equal(sharedRemaining(e, book.operations), 0);
  assert.equal(netConsumption(e, book.operations), 12000);
  assert.equal(
    assetPosition(
      book.assets[0],
      book.expenses,
      date,
      operationPostings(book.operations, book.assets),
    ).net,
    12000,
  );
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [...book.operations, { ...recovery, id: "again" }],
      }),
    /초과/,
  );
});
test("보험금은 명시한 의료비·상품에만 귀속하고 전체 합계 및 초과를 검증한다", () => {
  const a = expense("clinic", {
      category: "medical",
      paidAmount: "30000",
      shared: false,
    }),
    b = expense("pharmacy", {
      category: "medical",
      paidAmount: "10000",
      shared: false,
    });
  const payment = op("insurance", {
    assetId: "bank",
    amount: "25000",
    allocations: [allocation(a.id, "20000"), allocation(b.id, "5000")],
  });
  const book = makeBook([a, b], [payment]);
  validateOperations(book);
  assert.equal(
    daySummary(consumptionRecords(book.expenses, book.operations), date).total,
    15000,
  );
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [{ ...payment, amount: "24000" }],
      }),
    /합계/,
  );
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [
          {
            ...payment,
            amount: "45000",
            allocations: [allocation(a.id, "40000"), allocation(b.id, "5000")],
          },
        ],
      }),
    /본인 소비/,
  );
});
test("보험 비해당 상품은 ID로 보존하며 실제 귀속액만 소비에서 차감한다", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "moneybook-insurance-exclusions-"));
  assert.equal(path.dirname(path.resolve(folder)), path.resolve(tmpdir()));
  try {
    const repo = createExpenseRepository(path.join(folder, "ledger.json"));
    await repo.saveAsset(asset(), "bank", null);
    const medical = expense("clinic", { category: "medical", paidAmount: "31400", shared: false, items: [
      { id: "visit", name: "진찰료", unitPrice: "16500", quantity: 1, discounts: [] },
      { id: "test", name: "검사료", unitPrice: "9200", quantity: 1, discounts: [] },
      { id: "certificate", name: "제증명", unitPrice: "5700", quantity: 1, discounts: [] },
    ] });
    await repo.save(medical, medical.id, null);
    const legacyAllocations = [
      { ...allocation(medical.id, "11500"), itemId: "visit", deductible: "5000" },
      { ...allocation(medical.id, "9200"), itemId: "test" },
    ];
    assert.deepEqual(combineInsuranceAllocations(legacyAllocations, [medical]), [{ ...allocation(medical.id, "20700"), deductible: "5000", excludedItemIds: ["certificate"] }]);
    assert.equal(legacyAllocations[0].itemId, "visit");
    assert.deepEqual(combineInsuranceAllocations([{ ...legacyAllocations[0], amount: "" }, legacyAllocations[1]], [medical]), [{ ...legacyAllocations[0], amount: "" }, legacyAllocations[1]]);
    const input = op("insurance", { assetId: "bank", amount: "20700", allocations: [{ ...allocation(medical.id, "20700"), deductible: "5000", excludedItemIds: ["certificate"] }] });
    await repo.saveOperation(input, "insurance", null);
    const reopened = createExpenseRepository(path.join(folder, "ledger.json"));
    const saved = (await reopened.listOperations())[0];
    assert.deepEqual(saved.allocations[0].excludedItemIds, ["certificate"]);
    assert.equal(saved.allocations[0].itemId, "");
    assert.equal(netConsumption((await reopened.list()).find(e => e.id === medical.id)!, [saved]), 10700);
    for (const invalid of [
      { excludedItemIds: ["missing"] }, { excludedItemIds: ["certificate", "certificate"] },
      { itemId: "visit", excludedItemIds: ["certificate"] },
      { excludedItemIds: ["visit", "test", "certificate"] },
    ]) await assert.rejects(repo.saveOperation({ ...saved, allocations: [{ ...saved.allocations[0], ...invalid }] }, saved.id, saved.revision));
    assert.equal((await repo.listOperations())[0].revision, 1);
    const legacy = { ...saved, allocations: [{ ...saved.allocations[0], excludedItemIds: undefined, itemId: "visit" }] };
    await repo.saveOperation(legacy, saved.id, saved.revision);
    assert.equal((await repo.listOperations())[0].allocations[0].itemId, "visit");
    await repo.save({ ...medical, items: [medical.items[2]] }, "partial", null);
    await repo.saveOperation({ ...input, amount: "1000", allocations: [{ ...allocation("partial", "1000"), excludedItemIds: ["certificate"] }] }, "partial-insurance", null);
    assert.equal((await repo.listOperations()).find(o => o.id === "partial-insurance")?.amount, "1000");
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("이동 경로는 통화별 실제 수량을 기록하고 소비·일반 수입을 만들지 않는다", () => {
  const transfer = op("transfer", {
    rows: [
      {
        ...newRow(date, "exchange"),
        fromId: "bank",
        toId: "usd",
        amount: "13500",
        received: "11.00",
        baseAmount: "14000",
        discount: "500",
        baseReceived: "10.00",
        bonus: "1.00",
        rate: "1400",
      },
      {
        ...newRow(date, "charge"),
        fromId: "bank",
        toId: "stored",
        amount: "10000",
        received: "10000",
      },
    ],
  });
  const book = makeBook([], [transfer]);
  validateOperations(book);
  const postings = operationPostings(book.operations, book.assets);
  assert.equal(assetPosition(book.assets[0], [], date, postings).net, -23500);
  assert.equal(assetPosition(book.assets[2], [], date, postings).net, 1100);
  assert.equal(consumptionRecords([], [transfer]).length, 0);
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [
          { ...transfer, rows: [{ ...transfer.rows[0], bonus: "2.00" }] },
        ],
      }),
    /최종 수령량/,
  );
});
test("미수금은 저장 후 대여·일부 회수를 자산 이동으로 반영하고 소비를 만들지 않는다", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "moneybook-receivable-test-"));
  const file = path.join(folder, "ledger.json");
  try {
    const repo = createExpenseRepository(file);
    await repo.saveAsset(asset(), "bank", null);
    await repo.saveAsset({ ...asset("loan", "receivable"), openingBalance: "0" }, "loan", null);
    const lend = op("transfer", { rows: [{ ...newRow(date, "lend"), fromId: "bank", toId: "loan", amount: "30000", received: "30000" }] });
    await repo.saveOperation(lend, "lend", null);
    const repay = op("transfer", { rows: [{ ...newRow(date, "repay"), fromId: "loan", toId: "bank", amount: "10000", received: "10000" }] });
    await repo.saveOperation(repay, "repay", null);
    const reopened = createExpenseRepository(file);
    const assets = await reopened.listAssets();
    const operations = await reopened.listOperations();
    const postings = operationPostings(operations, assets);
    const loan = assets.find(a => a.id === "loan")!;
    assert.equal(loan.kind, "receivable");
    assert.equal(assetPosition(loan, [], date, postings).balance, 20000);
    assert.equal(assetPosition(assets.find(a => a.id === "bank")!, [], date, postings).balance, 80000);
    assert.equal(consumptionRecords([], operations).length, 0);
    assert.deepEqual(assetLedger(loan, [], postings).map(row => row.amount).sort((a, b) => a - b), [-10000, 30000]);
    await reopened.save({ ...newExpense(date), title: "미수금으로 상계한 소비", paidAmount: "5000", paymentKind: "receivable", assetId: "loan", paymentMethod: loan.name }, "offset", null);
    assert.equal(assetPosition(loan, await reopened.list(), date, postings).balance, 15000);
  } finally {
    const resolved = path.resolve(folder);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith("moneybook-receivable-test-"));
    await rm(resolved, { recursive: true, force: true });
  }
});

test("교통의 0원 환승은 원장에 남고 하이패스는 기관별 실제 출금만 차감한다", () => {
  const transit = op("transit", {
    assetId: "stored",
    amount: "1500",
    rows: [
      {
        ...newRow(date, "board"),
        name: "가상역",
        amount: "1500",
        time: "09:00",
      },
      {
        ...newRow(date, "off"),
        name: "예시역",
        amount: "0",
        action: "alight",
        time: "09:20",
      },
    ],
  });
  const toll = op("toll", {
    amount: "5000",
    rows: [
      { ...newRow(date, "a"), name: "기관 A", amount: "3000" },
      { ...newRow(date, "b"), name: "기관 B", amount: "2000" },
    ],
  });
  const paid = op("toll-payment", {
    assetId: "bank",
    amount: "3000",
    allocations: [allocation("toll/a", "3000")],
  });
  const book = makeBook([], [transit, toll, paid]);
  validateOperations(book);
  const postings = operationPostings(book.operations, book.assets);
  assert.equal(assetLedger(book.assets[1], [], postings).length, 2);
  assert.equal(assetPosition(book.assets[0], [], date, postings).net, -3000);
  assert.equal(tollRemaining(toll, toll.rows[1], book.operations), 2000);
  assert.equal(
    daySummary(consumptionRecords([], book.operations), date).total,
    6500,
  );
});
test("카드 검산과 실제 납부를 구분하고 연회비만 납부일에 정기지출로 추가한다", () => {
  const e = expense(),
    statement = op("statement", {
      card: "card",
      selected: [e.id],
      amount: "25000",
      fee: "1000",
      feeChecked: true,
      verified: true,
    });
  const book = makeBook([e], [statement]);
  validateOperations(book);
  assert.equal(operationPostings(book.operations, book.assets).length, 0);
  assert.equal(operationExpenses(book.operations).length, 0);
  const paid = {
    ...statement,
    payment: { assetId: "bank", date, time: null, amount: "25000" },
  };
  book.operations = [paid];
  validateOperations(book);
  assert.equal(
    assetPosition(
      book.assets[0],
      [e],
      date,
      operationPostings(book.operations, book.assets),
    ).net,
    -25000,
  );
  assert.equal(
    daySummary(consumptionRecords([e], book.operations), date).total,
    12000,
  );
  assert.equal(
    monthAmount(operationExpenses(book.operations)[0], "2026-10"),
    1000,
  );
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [{ ...paid, verified: false }],
      }),
    /검산 완료/,
  );
});
test("미청구 승인 이월 및 원화 미확정 승인은 검산과 분리한다", () => {
  const a = expense("a"),
    b = expense("b"),
    foreign = expense("foreign", {
      currency: "USD",
      paidAmount: "10.00",
      shared: false,
      krwAmount: null,
    });
  const statement = op("statement", {
    card: "card",
    amount: "24000",
    selected: [a.id],
    deferred: [b.id, foreign.id],
    verified: true,
  });
  const book = makeBook([a, b, foreign], [statement]);
  validateOperations(book);
  assert.throws(
    () =>
      validateOperations(
        { ...book, operations: [{ ...statement, deferred: [] }] },
        statement.id,
      ),
    /이월/,
  );
  const later = { ...newOperation("statement", "2026-11-20"), card: "card" };
  assert.deepEqual(
    statementRows(later, book)
      .map((r) => r.id)
      .sort(),
    ["b", "foreign"],
  );
});
test("카드 취소는 원래 소비를 0으로 만들고 청구 차감과 환급을 중복 생성하지 않는다", () => {
  const e = expense(),
    statement = op("statement", {
      card: "card",
      amount: "24000",
      selected: [e.id],
      verified: true,
      payment: { assetId: "bank", date, time: null, amount: "24000" },
    });
  const cancel = op("cancel", {
    sourceId: e.id,
    amount: "24000",
    cancelRoute: "refund",
    payment: { assetId: "bank", date, time: null, amount: "24000" },
  });
  const book = makeBook([e], [statement, cancel]);
  validateOperations(book);
  assert.equal(netConsumption(e, book.operations), 0);
  assert.equal(
    operationPostings(book.operations, book.assets).reduce(
      (s, p) => s + p.amount,
      0,
    ),
    0,
  );
  assert.throws(
    () =>
      validateOperations({
        ...book,
        operations: [statement, { ...cancel, amount: "25000" }],
      }),
    /전액 취소/,
  );
  const credit = {
    ...cancel,
    payment: null,
    cancelRoute: "credit" as const,
    month: "2026-11",
  };
  book.operations = [statement, credit];
  validateOperations(book);
  assert.equal(
    statementRows(
      { ...newOperation("statement", "2026-11-20"), card: "card" },
      book,
    )[0].amount,
    -24000,
  );
  assert.equal(operationPostings(book.operations, book.assets).length, 1);
});
test("시각 미확인은 알려진 거래 위·아래로 배치하며 순환 기준은 거절한다", () => {
  const known = expense("known", { useTime: "09:00" }),
    before = expense("before", {
      orderReference: "known",
      orderSide: "before",
    }),
    after = expense("after", { orderReference: "known" });
  assert.deepEqual(
    dailyExpenses([after, known, before], date).map((e) => e.id),
    ["before", "known", "after"],
  );
  assert.throws(
    () =>
      validateOperations(
        makeBook(
          [
            { ...before, orderReference: "after" },
            { ...after, orderReference: "before" },
          ],
          [],
        ),
      ),
    /서로/,
  );
});
test("충전과 결제는 원자적으로 저장·수정하고 잘못된 충전은 둘 다 저장하지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-bundle-"));
  try {
    const file = path.join(directory, "book.json"),
      repo = createExpenseRepository(file);
    await repo.saveAsset(asset(), "bank", null);
    await repo.saveAsset(asset("stored", "stored"), "stored", null);
    const e = expense("bundle", {
      paymentKind: "stored",
      paymentMethod: "stored",
      assetId: "stored",
      paidAmount: "1500",
      shared: false,
      time: "10:00",
      topup: {
        fromId: "missing",
        amount: "10000",
        received: "10000",
        date,
        time: null,
        sameTime: true,
        rate: "1",
      },
    });
    await assert.rejects(repo.save(e, e.id, null));
    assert.equal(
      (await repo.list()).some((r) => r.id === e.id),
      false,
    );
    assert.equal((await repo.listOperations()).length, 0);
    e.topup!.fromId = "bank";
    await repo.save(e, e.id, null);
    await repo.save(e, e.id, null);
    let operations = await repo.listOperations();
    assert.equal(operations.length, 1);
    const ledger = assetLedger(
      asset("stored", "stored"),
      await repo.list(),
      operationPostings(operations, await repo.listAssets()),
    );
    assert.equal(ledger[0].amount, 10000);
    assert.equal(ledger[1].amount, -1500);
    await assert.rejects(
      repo.saveOperation(operations[0], operations[0].id, 1),
      /원래 지출/,
    );
    await repo.save({ ...e, topup: null }, e.id, 1);
    operations = await repo.listOperations();
    assert.equal(operations.length, 1);
    assert.equal(operations[0].parentId, "");
    assert.equal(
      (await createExpenseRepository(file).list()).find((x) => x.id === e.id)
        ?.topup,
      null,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("검산 뒤 늦게 들어온 승인·원화 확정은 과거 명세서를 깨뜨리지 않고 다음 청구에 남는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-statements-"));
  try {
    const repo = createExpenseRepository(path.join(directory, "book.json"));
    const foreign = expense("late-fx", {
      currency: "USD",
      paidAmount: "10.00",
      shared: false,
      paymentMethod: "test-card",
    });
    await repo.save(foreign, foreign.id, null);
    const statement = op("statement", {
      card: "test-card",
      amount: "0",
      deferred: [foreign.id],
      verified: true,
    });
    await repo.saveOperation(statement, statement.id, null);
    await repo.saveOperation(statement, statement.id, null);
    await assert.rejects(
      repo.saveOperation({ ...statement, title: "stale" }, statement.id, 7),
      /다른 화면/,
    );
    await repo.save({ ...foreign, krwAmount: "14000" }, foreign.id, 1);
    await repo.save(
      expense("late-approval", { paymentMethod: "test-card" }),
      "late-approval",
      null,
    );
    const book = {
      expenses: await repo.list(),
      assets: [],
      operations: await repo.listOperations(),
    };
    assert.deepEqual(
      statementRows(
        { ...newOperation("statement", "2026-11-01"), card: "test-card" },
        book,
      )
        .map((r) => r.id)
        .sort(),
      ["late-approval", "late-fx"],
    );
    await assert.rejects(
      repo.saveOperation({ ...statement, deferred: [] }, statement.id, 1),
      /이월/,
    );
    assert.equal((await repo.listOperations()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("하이패스 출금 선택지는 이용 날짜·시각을 표시하고 미정산 기관만 남긴다", () => {
  const toll = op("toll", { title: "같은 경로", date: "2026-10-17", time: "21:16:30", rows: [
    { ...newRow(date, "paid"), name: "완납 기관", amount: "3000" },
    { ...newRow(date, "partial"), name: "일부 출금 기관", amount: "2000" },
    { ...newRow(date, "pending"), name: "미출금 기관", amount: "1000" },
    { ...newRow(date, "free"), name: "0원 기관", amount: "0" },
  ] });
  const paid = op("toll-payment", { allocations: [allocation("toll/paid", "3000"), allocation("toll/partial", "500")] });
  const unknown = { ...op("toll", { title: "같은 경로", date: "2026-10-18", time: null, rows: [{ ...newRow(date, "pending"), name: "미출금 기관", amount: "1000" }] }), id: "unknown" };
  const ops = [toll, paid, unknown];
  const targets = tollPaymentTargets(ops);
  assert.deepEqual(targets.map(t => [t.id, t.remaining]), [["toll/partial", 1500], ["toll/pending", 1000], ["unknown/pending", 1000]]);
  assert.equal(targets[0].title, "2026-10-17 21:16:30 · 같은 경로 · 일부 출금 기관");
  assert.equal(targets[2].title, "2026-10-18 · 시각 미확인 · 같은 경로 · 미출금 기관");
  assert.deepEqual(tollPaymentTargets(ops, paid.id).map(t => [t.id, t.remaining]), [["toll/paid", 3000], ["toll/partial", 2000], ["toll/pending", 1000], ["unknown/pending", 1000]]);
});
