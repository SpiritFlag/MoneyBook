import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { withMcpAuth } from "mcp-handler";
import { createBuddyReviewService, buddyBasis, buddySaveSchema, type BuddyStored, type BuddyReviewStorage } from "./buddy-review";
import { storedSchema, type Book } from "./expense-repository";
import { seedExpenses } from "./seed-expenses";
import { createMoneybookMcpHandler } from "./mcp-server";
import { mcpAuthOptions, oauthIdentity, type OAuthAccessToken } from "./mcp-auth";
import { monthlyBook, monthlyQuerySchema } from "./mcp-queries";
import { BuddyReviewContent } from "../components/buddy-reviews";

function fixture() {
  const book: Book = storedSchema.parse({ version: 1, expenses: structuredClone(seedExpenses), assets: [], operations: [] });
  const rows: (BuddyStored & { month: string })[] = [];
  let bookRevision = 1;
  const storage: BuddyReviewStorage = {
    async read(month) { return { book: structuredClone(book), bookRevision, snapshot: structuredClone(rows.filter(row => row.month === month).at(-1) ?? null), readAt: new Date().toISOString() }; },
    async replay(key) { return structuredClone(rows.find(row => row.idempotencyKey === key) ?? null); },
    async insert(month, version, expected, value) {
      if (bookRevision !== version || (rows.filter(r => r.month === month).at(-1)?.revision ?? 0) !== expected || rows.some(r => r.idempotencyKey === value.idempotencyKey)) return false;
      rows.push(structuredClone({ ...value, month })); return true;
    },
  };
  const service = createBuddyReviewService(storage);
  let key = 0;
  const input = async (extra = {}) => ({ month: "2026-10", ...(await service.read("2026-10")).analysisInput, monthlyComment: "월 전체 평가", idempotencyKey: `test-${++key}`, ...extra });
  return { book, rows, service, input, changed: () => { bookRevision++; } };
}

test("버디 목록은 월간 소비와 같은 기간 배분·미확정·05시 기준을 쓴다", () => {
  const { book } = fixture();
  const basis = buddyBasis(book, "2026-10"), monthly = monthlyBook(book, monthlyQuerySchema.parse({ month: "2026-10" }));
  assert.equal(basis.expenses.length, monthly.total);
  assert.equal(basis.expenses.reduce((sum, e) => sum + (e.amountKrw ?? 0), 0), monthly.totalKrw);
  assert.equal(basis.expenses.find(e => e.id === "demo-6")?.amountKrw, null);
  assert.equal(buddyBasis(book, "2026-11").expenses.find(e => e.id === "demo-5")?.amountKrw, 10000);
  book.expenses[0].useDate = "2026-10-01"; book.expenses[0].useTime = "04:30";
  assert.ok(buddyBasis(book, "2026-09").expenses.some(e => e.id === "demo-1"));
  assert.throws(() => buddyBasis(book, "2026-13"));
});

test("자유 복수 태그·멘트를 저장하며 다른 평가와 기존 장부·월 기준시각을 보존한다", async () => {
  const f = fixture(), original = JSON.stringify(f.book);
  const input = await f.input({ expenses: [{ expenseId: "demo-1", tags: [" 낭비 ", "자유 / 태그", "낭비"], comment: "한마디" }] });
  await f.service.save(input);
  assert.deepEqual((await f.service.read("2026-10")).expenses.find(e => e.id === "demo-1")?.review?.tags, ["낭비", "자유 / 태그"]);
  await f.service.save(await f.input({ monthlyComment: undefined, expenses: [{ expenseId: "demo-2", tags: ["즐거움"], comment: "커피" }] }));
  let data = await f.service.read("2026-10");
  assert.equal(data.reviewedCount, 2); assert.equal(data.summary?.reviewedThrough, input.reviewedThrough);
  await f.service.save(await f.input({ monthlyComment: undefined, expenses: [{ expenseId: "demo-1", tags: [], comment: "" }] }));
  data = await f.service.read("2026-10"); assert.equal(data.reviewedCount, 1);
  assert.equal(JSON.stringify(f.book), original); assert.equal(f.rows.length, 3);
});

test("재시도·충돌·모르는 지출·중복 ID·미래 기준시각을 검증하고 부분 저장을 막는다", async () => {
  const f = fixture(), input = await f.input();
  await f.service.save(input); assert.equal((await f.service.save(input)).replayed, true);
  await assert.rejects(f.service.save({ ...input, monthlyComment: "다른 내용" }), { code: "idempotency_conflict" });
  await assert.rejects(f.service.save(await f.input({ expectedRevision: 0 })), { code: "version_conflict" });
  await assert.rejects(f.service.save(await f.input({ reviewedThrough: "2099-01-01T00:00:00Z" })), { code: "invalid_review_cutoff" });
  await assert.rejects(f.service.save(await f.input({ expenses: [{ expenseId: "demo-1", tags: ["수정"], comment: "" }, { expenseId: "another-user-expense", tags: [], comment: "" }] })), { code: "expense_not_found" });
  const assessment = { expenseId: "demo-1", tags: [], comment: "" };
  assert.equal(buddySaveSchema.safeParse(await f.input({ expenses: [assessment, assessment] })).success, false);
  assert.equal(f.rows.length, 1);
});

test("거래 수정·이동·삭제 후 기존 평가는 남고 stale 상태로 표시한다", async () => {
  const f = fixture(), input = await f.input({ expenses: [{ expenseId: "demo-1", tags: ["필요"], comment: "평가 보존" }] });
  await f.service.save(input);
  f.book.expenses[0].items[0].name = "수정한 품목"; f.changed();
  let data = await f.service.read("2026-10");
  assert.equal(data.summary?.state, "stale"); assert.equal(data.expenses.find(e => e.id === "demo-1")?.review?.state, "stale");
  await assert.rejects(f.service.save({ ...input, idempotencyKey: "new", expectedRevision: 1 }), { code: "basis_changed" });
  assert.equal((await f.service.save(input)).replayed, true);
  f.book.expenses[0].useDate = "2026-12-01"; f.changed();
  assert.ok(!(await f.service.read("2026-10")).expenses.some(e => e.id === "demo-1"));
  f.book.expenses.shift(); f.changed(); data = await f.service.read("2026-10");
  assert.equal(data.summary?.state, "stale"); assert.equal(f.rows[0].reviews["demo-1"].comment, "평가 보존");
});

test("브라우저 콘텐츠는 읽기 전용이며 태그·멘트·기준시각을 HTML로 안전하게 표시한다", async () => {
  const f = fixture();
  await f.service.save(await f.input({ expenses: [{ expenseId: "demo-1", tags: ["<自由>", "복수"], comment: "<script>alert(1)</script>" }] }));
  const html = renderToStaticMarkup(createElement(BuddyReviewContent, { data: await f.service.read("2026-10") }));
  assert.match(html, /거래 확인 기준/); assert.match(html, /평가 작성/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<textarea|contenteditable/);
});

test("새 MCP는 폐기된 평가 조회·저장을 노출하지 않는다", async () => {
  const owner = fixture();
  const config = { resource: "https://moneybook.example/mcp", issuer: "https://clerk.example", clientId: "https://chatgpt.com/oauth/client.json" };
  const token: OAuthAccessToken = { subject: "user_owner", clientId: config.clientId, scopes: ["profile"], aud: [config.resource], revoked: false, expired: false, expiration: 4_000_000_000 };
  const handler = withMcpAuth(createMoneybookMcpHandler(async () => ({ book: structuredClone(owner.book), revision: "1" })), async (_, bearer) => bearer ? oauthIdentity(token, bearer, config) : undefined, mcpAuthOptions(config));
  const client = new Client({ name: "readonly-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { authorization: "Bearer owner" } }, fetch: async (input, init) => handler(new Request(input, init)) }));
  try {
    const tools = (await client.listTools()).tools;
    assert.ok(tools.every(t => t.annotations?.readOnlyHint));
    assert.ok(tools.every(t => !t.name.includes("buddy")));
    for (const name of ["get_buddy_review", "save_buddy_review"]) await assert.rejects(client.callTool({ name, arguments: {} }), /not found/);
    assert.equal(owner.rows.length, 0);
  } finally { await client.close(); }
});
