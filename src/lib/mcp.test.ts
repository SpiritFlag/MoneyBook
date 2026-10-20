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

const config = { resource: "https://moneybook.example/api/mcp", issuer: "https://clerk.example", clientId: "dedicated-moneybook" };
const token: OAuthAccessToken = { subject: "user_owner", clientId: config.clientId, scopes: ["profile", "offline_access"], aud: [config.resource], revoked: false, expired: false, expiration: 4_000_000_000 };
const stamp = { revision: 1, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" };
function fixture(): Book { return storedSchema.parse({ version: 1, expenses: structuredClone(seedExpenses), assets: [], operations: [] }); }
function operation(kind: Operation["kind"], id: string, fields: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, "2026-10-18"), id, ...stamp, ...fields };
}

test("MCP OAuth: resource/client/user/expiration/revocation checks and no session/shared-secret fallback", () => {
  assert.equal(mcpUserId(oauthIdentity(token, "opaque", config)), "user_owner");
  for (const fields of [{ aud: undefined }, { aud: ["https://other.example/api/mcp"] }, { clientId: "other-universe-app" }, { subject: "org_other" }, { expiration: null }, { expiration: NaN }, { expiration: 1 }, { revoked: true }, { expired: true }]) assert.equal(oauthIdentity({ ...token, ...fields }, "opaque", config), undefined);
  assert.throws(() => mcpUserId(undefined));
  assert.throws(() => mcpConfig({ MCP_AUTH_MODE: "secret", MCP_SECRET: "fallback" }));
  assert.throws(() => mcpConfig({ MCP_RESOURCE_URL: "https://evil.example/other", CLERK_AUTHORIZATION_SERVER: config.issuer, CLERK_OAUTH_CLIENT_ID: config.clientId }));
});

test("MCP protocol: SDK discovery, all read tools, validation, account isolation and resource guide", async () => {
  const owner = fixture(), outsider = fixture(); outsider.expenses = [];
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
    assert.ok(response.headers.get("www-authenticate")?.includes(`resource_metadata="${new URL(mcpMetadataPath, config.resource).href}"`), "OAuth challenge must point at the mounted metadata route, with no duplicate /api/mcp prefix");
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
    assert.equal(tools.length, 12);
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
    assert.equal((await a.callTool({ name: "list_operations", arguments: { start: "2026-10-20", end: "2026-10-01" } })).isError, true);
    await assert.rejects(a.callTool({ name: "save_expense", arguments: {} }), /not found/);
    // Also exercise the 2025 stateless Streamable HTTP fallback used by older clients.
    const legacy = await handler(new Request(config.resource, { method: "POST", headers: { authorization: "Bearer owner", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
    assert.equal(legacy.status, 200);
    assert.match(await legacy.text(), /get_book_overview/);
    assert.equal(JSON.stringify(owner), before, "Every read must preserve the entire original book");
  } finally { await a.close(); await b.close(); }
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
