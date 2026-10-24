import test from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { withMcpAuth } from "mcp-handler";
import { createReadOnlyMcpHandler } from "./mcp-server";
import { mcpAuthOptions, mcpConfig, mcpMetadataPath, mcpUserId, oauthIdentity, type OAuthAccessToken } from "./mcp-auth";
import { storedSchema, type Book } from "./expense-repository";
import { newAsset } from "./asset";
import { newExpense } from "./expense";
import { newOperation, newRow, type Operation } from "./operations";
import { seedExpenses } from "./seed-expenses";
import * as query from "./mcp-queries";
import { exampleLoan, exampleCreditLoan } from "./loan-sample";

const config = { resource: "https://moneybook.example/mcp", issuer: "https://clerk.example", clientId: "https://chatgpt.com/oauth/client.json" };
const token: OAuthAccessToken = { subject: "user_owner", clientId: config.clientId, scopes: ["profile", "offline_access"], aud: [config.resource], revoked: false, expired: false, expiration: 4_000_000_000 };
const stamp = { revision: 1, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" };
function fixture(): Book { return storedSchema.parse({ version: 1, expenses: structuredClone(seedExpenses), assets: [], operations: [] }); }
function operation(kind: Operation["kind"], id: string, fields: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, "2026-10-18"), id, ...stamp, ...fields };
}

test("MCP OAuth: resource/client/user/expiration/revocation checks and no session/shared-secret fallback", () => {
  assert.equal(mcpUserId(oauthIdentity(token, "opaque", config)), "user_owner");
  for (const fields of [{ aud: undefined }, { aud: ["https://other.example/mcp"] }, { aud: ["https://moneybook.example/api/mcp"] }, { clientId: "other-universe-app" }, { subject: "org_other" }, { expiration: null }, { expiration: NaN }, { expiration: 1 }, { revoked: true }, { expired: true }]) assert.equal(oauthIdentity({ ...token, ...fields }, "opaque", config), undefined);
  assert.deepEqual(mcpConfig({ MCP_RESOURCE_URL: config.resource, CLERK_AUTHORIZATION_SERVER: config.issuer, CLERK_OAUTH_CLIENT_ID: config.clientId }), config);
  assert.throws(() => mcpConfig({ MCP_RESOURCE_URL: "https://moneybook.example/api/mcp", CLERK_AUTHORIZATION_SERVER: config.issuer, CLERK_OAUTH_CLIENT_ID: config.clientId }));
  assert.throws(() => mcpUserId(undefined));
  assert.throws(() => mcpConfig({ MCP_AUTH_MODE: "secret", MCP_SECRET: "fallback" }));
  assert.throws(() => mcpConfig({ MCP_RESOURCE_URL: "https://evil.example/other", CLERK_AUTHORIZATION_SERVER: config.issuer, CLERK_OAUTH_CLIENT_ID: config.clientId }));
});

test("MCP protocol: SDK discovery, all read tools, validation, account isolation and resource guide", async () => {
  const owner = fixture(), outsider = fixture(); outsider.expenses = [];
  owner.loans = structuredClone([exampleLoan, exampleCreditLoan]);
  const before = JSON.stringify(owner);
  let reads = 0;
  const handler = withMcpAuth(createReadOnlyMcpHandler(async user => { reads++; return structuredClone(user === "user_owner" ? owner : outsider); }), async (_, bearer) => {
    if (bearer === "owner") return oauthIdentity(token, bearer, config);
    if (bearer === "other") return oauthIdentity({ ...token, subject: "user_other" }, bearer, config);
    if (bearer === "no-scope") return oauthIdentity({ ...token, scopes: [] }, bearer, config);
    return undefined;
  }, mcpAuthOptions(config));
  for (const bearer of [undefined, "bad-token", "no-scope"]) {
    const response = await handler(new Request(config.resource, { method: "POST", headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: "{}" }));
    assert.equal(response.status, bearer === "no-scope" ? 403 : 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);
    assert.ok(response.headers.get("www-authenticate")?.includes(`resource_metadata="${new URL(mcpMetadataPath, config.resource).href}"`), "OAuth challenge must point at the mounted metadata route, with no duplicate /mcp prefix");
  }
  assert.equal(reads, 0, "Unauthorized requests must never load a book");
  async function client(bearer: string) {
    const value = new Client({ name: "moneybook-test", version: "1.0.0" });
    await value.connect(new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { authorization: `Bearer ${bearer}` } }, fetch: async (input, init) => handler(new Request(input, init)) }));
    return value;
  }
  const a = await client("owner"), b = await client("other");
  try {
    const { tools } = await a.listTools();
    assert.equal(tools.length, 16);
    assert.ok(tools.every(t => t.annotations?.readOnlyHint && t.annotations?.destructiveHint === false));
    assert.ok(tools.every(t => !/write|save|create|update|delete|record_book/.test(t.name)));
    assert.equal(reads, 0, "Discovery must not read financial data");
    assert.equal((await a.listResources()).resources[0].uri, "moneybook://guide");
    assert.match(JSON.stringify(await a.readResource({ uri: "moneybook://guide" })), /05:00/);
    const listed = await a.callTool({ name: "list_expenses", arguments: { limit: 1 } });
    assert.equal((listed.structuredContent as { data: { total: number } }).data.total, 6);
    const other = await b.callTool({ name: "list_expenses", arguments: {} });
    assert.equal((other.structuredContent as { data: { total: number } }).data.total, 0);
    assert.equal((await b.callTool({ name: "get_record", arguments: { collection: "expenses", id: "demo-1" } })).isError, true);
    assert.equal((await a.callTool({ name: "list_expenses", arguments: { userId: "user_other" } })).isError, true);
    assert.equal((await a.callTool({ name: "get_daily_book", arguments: { date: "2026-02-30" } })).isError, true);
    const loans = await a.callTool({ name: "get_loan_overview", arguments: { limit: 1 } });
    assert.equal((loans.structuredContent as { data: { total: number } }).data.total, 2);
    assert.equal((await b.callTool({ name: "get_loan_detail", arguments: { loanId: exampleLoan.id } })).isError, true);
    assert.equal((await b.callTool({ name: "list_loan_records", arguments: { loanId: exampleLoan.id, kind: "repayments" } })).isError, true);
    assert.equal((await a.callTool({ name: "get_loan_detail", arguments: { loanId: exampleLoan.id, userId: "user_other" } })).isError, true);
    assert.equal((await a.callTool({ name: "get_loan_detail", arguments: { loanId: exampleLoan.id } })).isError, undefined);
    assert.equal((await a.callTool({ name: "list_loan_records", arguments: { loanId: exampleLoan.id, kind: "schedule", limit: 1 } })).isError, undefined);
    assert.equal((await a.callTool({ name: "get_asset_overview", arguments: { asOf: "2026-10-18" } })).isError, undefined);
    assert.equal((await a.callTool({ name: "list_operations", arguments: { start: "2026-10-20", end: "2026-10-01" } })).isError, true);
    await assert.rejects(a.callTool({ name: "save_expense", arguments: {} }), /not found/);
    // Also exercise the 2025 stateless Streamable HTTP fallback used by older clients.
    const legacy = await handler(new Request(config.resource, { method: "POST", headers: { authorization: "Bearer owner", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
    assert.equal(legacy.status, 200);
    assert.match(await legacy.text(), /get_book_overview/);
    assert.equal(JSON.stringify(owner), before, "Every read must preserve the entire original book");
  } finally { await a.close(); await b.close(); }
});

test("MCP 자산 현황은 페이지와 무관하게 같은 기준일의 웹 평가와 미확정을 집계한다", () => {
  const book = fixture(); book.expenses = [];
  book.assets = [
    { ...newAsset("2026-10-01"), ...stamp, id: "known", name: "가상 원화", openingBalance: "10000" },
    { ...newAsset("2026-10-01"), ...stamp, id: "unknown", name: "가상 미확인", openingBalance: null },
    { ...newAsset("2026-10-20"), ...stamp, id: "future", name: "가상 미래", openingBalance: "5000" },
  ];
  const result = query.assetOverview(book, query.assetOverviewSchema.parse({ asOf: "2026-10-18", limit: 1 }));
  assert.equal(result.totalKrw, 10000); assert.equal(result.unvaluedCount, 2);
  assert.equal(result.total, 3); assert.equal(result.nextOffset, 1);
  assert.equal(result.includesLiabilities, false);
  assert.equal(query.assetOverview(book, query.assetOverviewSchema.parse({ asOf: "2026-10-20", offset: 2 })).totalKrw, 15000);
  assert.equal(query.assetOverviewSchema.safeParse({ asOf: "2026-02-30" }).success, false);
});

test("MCP 대출은 확인 잔액·부분 일정·지원·연체 항목과 페이지를 보존한다", () => {
  const book = fixture();
  const loan = structuredClone(exampleLoan);
  loan.annualRate = null; loan.nextPayment = null;
  loan.scheduleThrough = "2027-12-25";
  loan.scheduleBalanceSource = "calculated";
  loan.repayments[0] = { ...loan.repayments[0], support: "local_government", lateInterest: 2, lateFee: 1, total: loan.repayments[0].total + 3 };
  loan.events = [{ id: "terms", kind: "terms_change", label: "조건 변경", date: "2026-09-01", time: null, amount: 0, principalAfter: null, note: "가상 조건 변경" }];
  book.loans = [loan, structuredClone(exampleCreditLoan)];
  const before = JSON.stringify(book);
  const result = query.loanOverview(book, query.loanOverviewSchema.parse({ limit: 1 }));
  assert.equal(result.totalRemainingPrincipal, loan.remainingPrincipal + exampleCreditLoan.remainingPrincipal);
  assert.equal(result.unknownRateCount, 1); assert.equal(result.unknownNextPaymentCount, 1);
  assert.equal(result.nextOffset, 1); assert.equal(result.total, 2);
  assert.equal("repayments" in result.items[0], false);
  const detail = query.loanDetail(book, { loanId: loan.id });
  assert.equal(detail.loan.remainingPrincipal, loan.remainingPrincipal);
  assert.equal(detail.loan.annualRate, null); assert.equal(detail.personalOutOfPocketTotal, null);
  assert.equal(detail.localGovernmentSupportedTotal, loan.repayments[0].total);
  assert.equal(detail.recordedRepaymentTotals.interest, loan.repayments[0].interest + 2);
  const all = query.loanRecords(book, query.loanRecordsSchema.parse({ loanId: loan.id, kind: "schedule", limit: 1 }));
  assert.equal(all.total, loan.schedule.length); assert.equal(all.undatedCount, 2);
  assert.equal(all.nextOffset, 1); assert.equal(all.scheduleThrough, "2027-12-25");
  const dated = query.loanRecords(book, query.loanRecordsSchema.parse({ loanId: loan.id, kind: "schedule", start: "2026-10-01" }));
  assert.equal(dated.total, 1);
  const events = query.loanRecords(book, query.loanRecordsSchema.parse({ loanId: loan.id, kind: "events" }));
  assert.equal(events.items.length, 1);
  assert.equal(query.getRecord(book, query.recordQuerySchema.parse({ collection: "loans", id: loan.id })).record, loan);
  assert.equal(JSON.stringify(book), before);
});

test("MCP query coverage: pages, receipt contents, all operation kinds, cards, currencies and no silent truncation", () => {
  const book = fixture();
  book.operations = Object.keys(query.mcpGuide.operationKinds).map((kind, i) => operation(kind as Operation["kind"], `op-${i}`, kind === "template" ? { template: newExpense("2026-10-18") } : {}));
  const first = query.listExpenses(book, query.expenseQuerySchema.parse({ limit: 2 }));
  const second = query.listExpenses(book, query.expenseQuerySchema.parse({ offset: first.nextOffset, limit: 100 }));
  assert.equal(new Set([...first.items, ...second.items].map(e => e.id)).size, 6);
  assert.equal(second.nextOffset, null);
  assert.equal(query.listExpenses(book, query.expenseQuerySchema.parse({ query: "정식" })).items[0].id, "demo-1");
  for (const kind of Object.keys(query.mcpGuide.operationKinds)) assert.equal(query.listOperations(book, query.operationQuerySchema.parse({ kind })).total, 1);
  assert.deepEqual(query.getRecord(book, query.recordQuerySchema.parse({ collection: "expenses", id: "demo-1" })).record, book.expenses[0]);
  const large = Array.from({ length: 4 }, (_, id) => ({ id, text: "x".repeat(250_000) }));
  const bounded = query.page(large, { offset: 0, limit: 100 });
  assert.equal(bounded.items.length, 2);
  assert.equal(bounded.nextOffset, 2);
  assert.equal(query.page(large, { offset: 2, limit: 100 }).nextOffset, null);
});

test("MCP calculations: 05:00, full payments vs personal consumption, cancellation, insurance and annual allocation", () => {
  const book = fixture();
  const dawn = { ...newExpense("2026-10-19"), ...stamp, id: "dawn", title: "새벽", paidAmount: "1000", time: "04:59", useTime: "04:59" };
  book.expenses.push(dawn);
  book.operations.push(operation("income", "income", { amount: "999999" }), operation("cancel", "cancel", { sourceId: "demo-2" }), operation("insurance", "insurance", { amount: "1000", allocations: [{ targetId: "demo-1", itemId: "", amount: "1000", deductible: "0" }] }));
  const daily = query.dailyBook(book, query.dailyQuerySchema.parse({ date: "2026-10-18", limit: 1 }));
  assert.equal(daily.consumptionKrw.total, 15000); // 12,000 - 1,000 + 0 + 3,000 + 1,000
  assert.equal(query.dailyBook(book, query.dailyQuerySchema.parse({ date: "2026-10-19" })).consumptionKrw.total, 0);
  const month = query.monthlyBook(book, query.monthlyQuerySchema.parse({ month: "2026-10", limit: 1 }));
  assert.equal(month.recurringKrw, 10005);
  assert.equal(month.pending, 1);
  assert.equal(Object.values(month.categoryTotalsKrw).reduce((a, b) => a + b, 0), month.totalKrw);
  assert.equal(query.listExpenses(book, query.expenseQuerySchema.parse({ start: "2026-10-18", end: "2026-10-18", dateBasis: "book" })).items.some(e => e.id === "dawn"), true);
  assert.equal(query.listExpenses(book, query.expenseQuerySchema.parse({ start: "2026-10-18", end: "2026-10-18", dateBasis: "payment" })).items.some(e => e.id === "dawn"), false);
});

test("MCP ledgers: balances before pagination, card full amounts and outstanding settlements", () => {
  const book = fixture();
  book.assets = [{ ...newAsset("2026-10-01"), ...stamp, id: "bank", name: "가상 계좌", openingBalance: "10000" }];
  book.expenses = [100, 200, 300].map((amount, i) => ({ ...newExpense(`2026-10-${17 + i}`), ...stamp, id: `e-${i}`, title: "가상 지출", paidAmount: String(amount), assetId: "bank", paymentKind: "account", paymentMethod: "가상 계좌" }));
  const ledger = query.readAssetLedger(book, query.ledgerQuerySchema.parse({ assetId: "bank", start: "2026-10-18", asOf: "2026-10-18", limit: 1 }));
  assert.equal(ledger.items[0].before, 9900);
  assert.equal(ledger.items[0].after, 9700);
  assert.equal(ledger.position.balance, 9700);
  book.cards = [{ id: "card", name: "가상 카드", issuer: "", kind: "credit", assetId: null, revision: 1, createdAt: stamp.createdAt }];
  book.expenses.push({ ...seedExpenses[0], paymentMethod: "가상 카드" });
  const activity = query.readCardActivity(book, query.cardQuerySchema.parse({ cardId: "card" }));
  assert.equal(activity.items[0].amount, "24000");
  const outstanding = query.settlements(book, query.settlementQuerySchema.parse({ kind: "shared" }));
  assert.ok("remainingMinor" in outstanding.items[0]);
  assert.equal(outstanding.items[0].remainingMinor, 12000);
  book.operations.push(operation("toll", "toll", { rows: [{ ...newRow("2026-10-18", "row"), amount: "1500" }] }));
  const toll = query.settlements(book, query.settlementQuerySchema.parse({ kind: "toll" })).items[0];
  assert.ok("remainingKrw" in toll);
  assert.equal(toll.remainingKrw, 1500);
});
