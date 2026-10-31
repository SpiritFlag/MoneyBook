import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { withMcpAuth } from "mcp-handler";
import { newExpense, daySummary, type Expense } from "./expense";
import { newAsset, assetPosition, assetLedger } from "./asset";
import { newOperation, newRow, consumptionRecords, operationPostings, type Operation } from "./operations";
import { storedSchema, type Book } from "./expense-repository";
import { exampleLoan } from "./loan-sample";
import { loanPaymentExpense, loansWithPayments } from "./loan-payment";
import { monthlyLoanPayments } from "./monthly-loan-payments";
import { monthlyBook } from "./mcp-queries";
import { createMoneybookMcpHandler } from "./mcp-server";
import { mcpAuthOptions, oauthIdentity } from "./mcp-auth";
import * as explore from "./mcp-exploration";

const now = new Date("2026-10-31T06:00:00Z");
const stamp = { revision: 1, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z" };
function expense(id: string, date: string, amount: string, fields: Partial<Expense> = {}): Expense {
  return { ...newExpense(date), ...stamp, id, title: id, paidAmount: amount, paymentKind: "account", assetId: "bank", paymentMethod: "은행", ...fields };
}
function op(id: string, kind: Operation["kind"], date: string, fields: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, date), ...stamp, id, ...fields };
}
function fixture(): Book {
  return storedSchema.parse({ version: 1, assets: [{ ...newAsset("2026-10-01"), ...stamp, id: "bank", name: "은행", openingBalance: "1000000" }, { ...newAsset("2026-10-01"), ...stamp, id: "cash", name: "현금", kind: "cash", openingBalance: null }], expenses: [
    expense("coffee-before", "2026-10-19", "5000", { title: "동네 커피", memo: "테이크아웃" }),
    expense("coffee-now", "2026-10-26", "12000", { title: "동네 커피", memo: "모임", shared: true, ownAmount: "6000", items: [{ id: "latte", name: "라테", unitPrice: "6000", quantity: 2, discounts: [] }] }),
    expense("live", "2026-10-31", "30000"),
    expense("period", "2026-10-05", "120005", { useKind: "period", useDate: "2026-10-01", useEnd: "2027-09-30", allocation: "annual", monthlyRecurring: true, recurringSeriesId: "series" }),
    expense("medical", "2026-10-27", "20000", { category: "medical" }),
    expense("cancelled", "2026-10-28", "10000", { paymentKind: "card", assetId: null }),
    expense("pending", "2026-10-29", "10.00", { currency: "USD", receiptCurrency: "USD", paymentKind: "card", assetId: null }),
  ], operations: [
    op("insurance", "insurance", "2026-10-30", { assetId: "bank", amount: "15000", allocations: [{ targetId: "medical", itemId: "", amount: "15000", deductible: "5000" }] }),
    op("recovery", "recovery", "2026-10-30", { assetId: "bank", amount: "6000", allocations: [{ targetId: "coffee-now", itemId: "", amount: "6000", deductible: "0" }] }),
    op("cancel", "cancel", "2026-10-30", { sourceId: "cancelled", cancelScope: "full", amount: "10000", cancelRoute: "credit" }),
    op("bill", "statement", "2026-10-25", { card: "카드", amount: "50000", verified: true, payment: { assetId: "bank", amount: "50000", date: "2026-10-28", time: null } }),
    op("transfer", "transfer", "2026-10-28", { rows: [{ ...newRow("2026-10-28", "leg"), fromId: "bank", toId: "cash", amount: "10000", received: "10000" }] }),
    op("toll", "toll", "2026-10-27", { amount: "3000", rows: [{ ...newRow("2026-10-27", "toll-leg"), amount: "3000" }] }),
    op("toll-paid", "toll-payment", "2026-10-30", { amount: "3000", assetId: "bank", allocations: [{ targetId: "toll/toll-leg", itemId: "", amount: "3000", deductible: "0" }] }),
  ], loans: [structuredClone(exampleLoan)] });
}

test("이번 주는 같은 수의 완료 장부일로 비교하고 오늘과 기간형을 구분한다", () => {
  const book = fixture(), before = JSON.stringify(book);
  const result = explore.exploreActivity(book, explore.activitySchema.parse({ period: "week" }), now);
  assert.deepEqual(result.basis.observed, { start: "2026-10-26", end: "2026-10-31" });
  assert.deepEqual(result.comparison!.current.range, { start: "2026-10-26", end: "2026-10-30" });
  assert.deepEqual(result.comparison!.previous.range, { start: "2026-10-19", end: "2026-10-23" });
  assert.equal(result.current.knownConsumptionKrw, 44000); // 6k own + 5k medical + 3k toll + 30k today
  assert.equal(result.current.pendingValuationCount, 1);
  assert.equal(result.comparison!.consumption.change, 9000);
  assert.equal(result.comparison!.categoryContributions.reduce((s, c) => s + c.change, 0), 9000);
  const bankChange = result.comparison!.financialChanges.assets.find(a => a.assetId === "bank")!;
  assert.equal(bankChange.reasonContributions.find(r => r.reason === "card_bill_payment")!.changeMinor, -50000);
  assert.equal(bankChange.reasonContributions.reduce((s, r) => s + r.changeMinor, 0), bankChange.changeMinor);
  assert.equal(result.monthlyAllocations[0].knownKrw, 10005);
  assert.equal(result.current.daily.find(d => d.date === "2026-10-28")!.total, 0);
  const records = consumptionRecords(book.expenses, book.operations);
  for (const d of result.current.daily) assert.deepEqual({ total: d.total, pending: d.pending }, daySummary(records, d.date));
  assert.equal(JSON.stringify(book), before);
});

test("월간 귀속은 웹 월간 합계와 같고 기간형 증감은 일간 비교와 분리한다", () => {
  const book = fixture();
  book.expenses.push(expense("last-period", "2026-09-01", "3000", { useKind: "period", useEnd: "2026-09-30" }));
  const result = explore.exploreActivity(book, explore.activitySchema.parse({ period: "month" }), now);
  const web = monthlyBook(book, { month: "2026-10", offset: 0, limit: 1 });
  assert.equal(result.monthlyAllocations[0].registeredMonth.totalKrw, web.totalKrw);
  assert.equal(result.monthlyPeriodComparison!.change, 7005);
  assert.equal(result.monthlyPeriodComparison!.categoryContributions.reduce((s, r) => s + r.change, 0), 7005);
  assert.deepEqual(result.comparison!.previous.range, { start: "2026-09-01", end: "2026-09-30" });
  assert.equal(result.comparison!.current.daily.length, 30);
});

test("부분취소는 소비 비율을 지키며 청구할인·납부는 소비를 다시 줄이지 않는다", () => {
  const book = fixture();
  book.expenses = [expense("shared-card", "2026-10-27", "24000", { shared: true, ownAmount: "12000", paymentKind: "card", assetId: null, paymentMethod: "카드" })];
  book.operations = [
    op("partial", "cancel", "2026-10-28", { sourceId: "shared-card", cancelScope: "partial", amount: "6000", cancelRoute: "exclude" }),
    op("discounted-bill", "statement", "2026-10-28", { card: "카드", selected: ["shared-card"], billingDiscounts: [{ rowId: "shared-card", amount: "3000" }], amount: "15000", verified: true, payment: { assetId: "bank", amount: "15000", date: "2026-10-29", time: null } }),
  ];
  const result = explore.exploreActivity(book, explore.activitySchema.parse({ period: "week" }), now);
  assert.equal(result.current.knownConsumptionKrw, 9000);
  assert.equal(result.finance.assets[0].byReason.card_bill_payment.netMinor, -15000);
  assert.equal(explore.recordDetail(book, explore.detailSchema.parse({ collection: "expenses", id: "shared-card" })).netConsumptionKrw, 9000);
});

test("05시 경계·월말 길이·첫날·이전 동기간·잘못된 범위를 처리한다", () => {
  const parsed = (v: object) => explore.activitySchema.parse(v);
  assert.equal(explore.activityRanges(parsed({ period: "today" }), new Date("2026-10-31T19:59:00Z")).bookToday, "2026-10-31");
  const march = explore.activityRanges(parsed({ period: "month" }), new Date("2026-03-31T06:00:00Z"));
  assert.equal(march.comparisonCurrent!.end, "2026-03-28");
  assert.equal(march.comparisonPrevious!.end, "2026-02-28");
  assert.equal(explore.activityRanges(parsed({ period: "week" }), new Date("2026-10-26T06:00:00Z")).comparisonCurrent, null);
  const r = explore.activityRanges(parsed({ period: "range", start: "2026-10-20", end: "2026-10-22" }), now);
  assert.deepEqual(r.comparisonPrevious, { start: "2026-10-17", end: "2026-10-19" });
  assert.equal(explore.activityRanges(parsed({ period: "today" }), now).recentDays!.start, "2026-10-24");
  assert.throws(() => explore.activityRanges(parsed({ period: "range", start: "2020-01-01", end: "2026-01-01" }), now));
  assert.throws(() => explore.activityRanges(parsed({ period: "range", start: "2026-11-01", end: "2026-11-10" }), now));
  assert.equal(explore.activitySchema.safeParse({ period: "range", start: "2026-02-30", end: "2026-03-01" }).success, false);
});

test("문자열 검색은 상품·메모·혼합 분류와 금융 사건의 중첩 날짜를 찾는다", () => {
  const book = fixture();
  assert.equal(explore.searchRecords(book, explore.searchSchema.parse({ query: "라테" })).items[0].id, "coffee-now");
  assert.equal(explore.searchRecords(book, explore.searchSchema.parse({ query: "테이크아웃" })).items[0].id, "coffee-before");
  assert.equal(explore.searchRecords(book, explore.searchSchema.parse({ query: "의료" })).items[0].id, "medical");
  assert.ok(explore.searchRecords(book, explore.searchSchema.parse({ start: "2026-10-28", end: "2026-10-28", collection: "operations", dateBasis: "payment" })).items.some(e => e.id === "bill"));
  const relation = explore.recordDetail(book, explore.detailSchema.parse({ collection: "operations", id: "insurance" }));
  assert.deepEqual(relation.relations.items[0], { relation: "asset", collection: "assets", id: "bank" });
  assert.ok(relation.relations.items.some(r => r.relation === "allocation" && r.id === "medical"));
});

test("자산 변동은 소비·이동·카드납부·대출 원리금을 구분하고 웹 원장과 일치한다", () => {
  const book = fixture();
  const loan = book.loans[0];
  book.expenses.push(loanPaymentExpense({ loanId: loan.id, scheduleKey: "installment:2", scheduleBasis: "test", date: "2026-10-27", time: null, assetId: "bank", principal: 191000, interest: 59000, fee: 0, memo: "" }, loan, loan.schedule[0], { id: "bank", name: "은행" }, "loan-payment"));
  const q = explore.assetsSchema.parse({ assetId: "bank", start: "2026-10-26", end: "2026-10-31", limit: 1 });
  const result = explore.inspectAssets(book, q, now);
  const postings = operationPostings(book.operations, book.assets);
  assert.deepEqual(result.items[0].position, assetPosition(book.assets[0], book.expenses, q.end!, postings));
  assert.equal(result.ledger!.items[0].before, assetLedger(book.assets[0], book.expenses, postings).find(r => r.entry.id === result.ledger!.items[0].entry.id)!.before);
  assert.equal(result.movement!.assets[0].byReason.card_bill_payment.netMinor, -50000);
  assert.equal(result.movement!.assets[0].byReason.transfer.netMinor, -10000);
  assert.equal(result.movement!.assets[0].byReason.loan_repayment.netMinor, -250000);
  assert.deepEqual(result.movement!.assets[0].linkedLoanRepayments, { principalMinor: 191000, interestMinor: 59000, feeMinor: 0 });
  assert.equal(explore.inspectAssets(book, explore.assetsSchema.parse({ assetId: "cash" }), now).items[0].position.balance, null);
  const loans = explore.inspectLoans(book, explore.loansSchema.parse({ kind: "schedule", start: "2026-10-01", end: "2026-10-31" }), now);
  const monthly = monthlyLoanPayments(book.loans, book.expenses, "2026-10");
  assert.equal(loans.scheduleTotals.recordedPaymentKrw, monthly.totals.paid);
  assert.equal(loans.scheduleTotals.unrecordedScheduledKrw, 0);
  assert.equal(loans.totalRecordedPrincipalKrw, loansWithPayments(book.loans, book.expenses, "2026-10-31")[0].recordedRemainingPrincipal);
  assert.equal(loans.unknownScheduleDateCount, 2);
  assert.equal(explore.exploreActivity(book, explore.activitySchema.parse({ period: "week" }), now).current.knownConsumptionKrw, 103000);
});

test("반복 시리즈는 금액·간격·미기록을 구분한다", () => {
  const book = fixture();
  book.expenses.push(expense("series-next", "2026-11-06", "130000", { useKind: "period", useDate: "2026-11-01", useEnd: "2026-11-30", monthlyRecurring: true, recurringSeriesId: "series", recurringSourceId: "period" }));
  const result = explore.inspectRecurring(book, explore.recurringSchema.parse({ seriesId: "series", limit: 1, offset: 1, month: "2026-12" }), now);
  const item = result.items[0];
  assert.ok("intervalDays" in item);
  assert.equal(item.intervalDays, 32);
  assert.equal(item.paymentChangeMinor, 9995);
  assert.equal(item.recurringSourceId, "period");
  assert.equal(result.total, 2);
  assert.throws(() => explore.inspectRecurring(book, explore.recurringSchema.parse({ seriesId: "missing" }), now));
});

test("실제 SDK 호출: 첫 탐색→증가 분류 검색→원거래/보험 연결→revision 변경 감지", async () => {
  const book = fixture(), before = JSON.stringify(book);
  let revision = "8", reads = 0;
  const config = { resource: "https://moneybook.example/mcp", issuer: "https://clerk.example", clientId: "https://chatgpt.com/oauth/client.json" };
  const handler = withMcpAuth(createMoneybookMcpHandler(async user => { reads++; assert.equal(user, "user_test"); return { book: structuredClone(book), revision }; }, () => now), async (_, bearer) => bearer ? oauthIdentity({ subject: "user_test", clientId: config.clientId, scopes: ["profile"], aud: [config.resource], revoked: false, expired: false, expiration: 4000000000 }, bearer, config) : undefined, mcpAuthOptions(config));
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const result = await handler(new Request(`http://127.0.0.1${request.url}`, { method: request.method, headers, ...(["GET", "HEAD"].includes(request.method!) ? {} : { body: Buffer.concat(chunks) }) }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500); response.end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new Client({ name: "weekly-exploration", version: "1" });
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    assert.equal(r.isError, undefined);
    return (r.structuredContent as { data: Record<string, unknown> }).data;
  };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { authorization: "Bearer test" } } }));
    assert.equal(reads, 0);
    const first = await call("explore_activity", { period: "week" });
    assert.equal(first.bookRevision, "8");
    const search = await call("search_records", { category: "medical", expectedRevision: first.bookRevision });
    const found = (search.items as { id: string; collection: string }[])[0];
    const detail = await call("get_record", { collection: found.collection, id: found.id, expectedRevision: first.bookRevision });
    assert.ok(JSON.stringify(detail).includes("insurance"));
    await call("inspect_assets", { start: "2026-10-26", end: "2026-10-31", expectedRevision: "8" });
    await call("inspect_loans", { kind: "schedule", start: "2026-11-01", end: "2026-11-07", expectedRevision: "8" });
    await call("inspect_recurring", { seriesId: "series", expectedRevision: "8" });
    revision = "9";
    const stale = await client.callTool({ name: "search_records", arguments: { expectedRevision: "8" } });
    assert.equal(stale.isError, true);
    assert.equal((stale.structuredContent as { data: { code: string } }).data.code, "book_changed");
    assert.equal(JSON.stringify(book), before);
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
