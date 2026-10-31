import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, createExpenseRepository, storedSchema, type Book } from "./expense-repository";
import { newAsset, assetOrderSchema, assetLedger } from "./asset";
import { newExpense } from "./expense";
import { newOperation } from "./operations";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const date = "2026-10-31";
const meta = { revision: 1, createdAt: date, updatedAt: date };
const makeAsset = (id: string) => ({ ...newAsset(date), ...meta, id, name: id, openingBalance: "10000" });
function setup(patch: Partial<Book> = {}) {
  let saved = storedSchema.parse({ version: 1, expenses: [], assets: [makeAsset("a"), makeAsset("b"), makeAsset("c")], ...patch });
  const repository = createBookRepository({ read: async () => structuredClone(saved), transact: async action => action(structuredClone(saved), async book => { saved = storedSchema.parse(structuredClone(book)); }) });
  return { repository, read: () => structuredClone(saved) };
}

test("자산 순서만 바꾸고 거래·계좌 잔액·revision·연결은 보존한다", async () => {
  const { repository, read } = setup({
    expenses: [{ ...newExpense(date), ...meta, id: "expense", title: "가상 지출", paymentKind: "account", assetId: "a", paymentMethod: "a", paidAmount: "100" }],
    operations: [{ ...newOperation("income", date), ...meta, id: "income", title: "가상 수입", assetId: "b", amount: "1000" }],
  });
  const before = read();
  const reordered = await repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["c", "a", "b"] });
  assert.deepEqual(reordered.map(asset => asset.id), ["c", "a", "b"]);
  assert.deepEqual((await repository.listAssets()).map(asset => asset.id), ["c", "a", "b"]);
  assert.deepEqual(reordered, [before.assets[2], before.assets[0], before.assets[1]]);
  assert.deepEqual(read().expenses, before.expenses);
  assert.deepEqual(read().operations, before.operations);
  assert.deepEqual(assetLedger(read().assets.find(asset => asset.id === "a")!, read().expenses), assetLedger(before.assets[0], before.expenses));
  assert.deepEqual(await repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["c", "a", "b"] }), reordered, "Retrying an already saved order is idempotent");
});

test("중복·누락·다른 계정 ID·오래된 순서를 거절하고 원본을 보존한다", async () => {
  const { repository, read } = setup();
  for (const input of [
    { expectedIds: ["a", "b", "c"], ids: ["a", "a", "b"] },
    { expectedIds: ["a", "a", "c"], ids: ["c", "a", "b"] },
  ]) assert.equal(assetOrderSchema.safeParse(input).success, false);
  const before = read();
  for (const ids of [["a", "b"], ["a", "b", "other-account"]]) await assert.rejects(repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids }), { status: 409 });
  assert.deepEqual(read(), before);
  await repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["c", "a", "b"] });
  await assert.rejects(repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["b", "a", "c"] }), { status: 409 });
  assert.deepEqual((await repository.listAssets()).map(asset => asset.id), ["c", "a", "b"]);
});

test("자산 내용 수정과 새 자산 추가가 정렬과 함께 보존된다", async () => {
  const { repository } = setup();
  await repository.saveAsset({ ...makeAsset("a"), name: "수정된 이름" }, "a", 1);
  const reordered = await repository.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["c", "a", "b"] });
  assert.equal(reordered[1].name, "수정된 이름");
  assert.equal(reordered[1].revision, 2);
  await repository.saveAsset({ ...makeAsset("b"), name: "다른 수정" }, "b", 1);
  assert.deepEqual((await repository.listAssets()).map(asset => asset.id), ["c", "a", "b"]);
  await repository.saveAsset(makeAsset("d"), "d", null);
  assert.deepEqual((await repository.listAssets()).map(asset => asset.id), ["c", "a", "b", "d"]);
  await assert.rejects(repository.reorderAssets({ expectedIds: ["c", "a", "b"], ids: ["b", "c", "a"] }), { status: 409 });
});

test("정렬은 저장소 재생성과 계정 격리 이후에도 유지된다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-asset-order-"));
  try {
    const file = path.join(directory, "first.json");
    const first = createExpenseRepository(file, undefined, []);
    const second = createExpenseRepository(path.join(directory, "second.json"), undefined, []);
    for (const id of ["a", "b", "c"]) await first.saveAsset(makeAsset(id), id, null);
    await first.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["b", "c", "a"] });
    assert.deepEqual((await createExpenseRepository(file, undefined, []).listAssets()).map(asset => asset.id), ["b", "c", "a"]);
    assert.deepEqual(await second.listAssets(), []);
    await assert.rejects(second.reorderAssets({ expectedIds: ["a", "b", "c"], ids: ["b", "c", "a"] }), { status: 409 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
