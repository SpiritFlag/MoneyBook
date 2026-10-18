import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { newAsset, assetInputSchema, assetPosition, assetLedger, valueInWon, type Asset } from "./asset";
import { newExpense, type Expense } from "./expense";
import { createExpenseRepository } from "./expense-repository";
import { seedExpenses } from "./seed-expenses";
const date = "2026-10-18";
const asset: Asset = { ...newAsset(date), name: "예시 달러 지갑", currency: "USD", kind: "cash", openingBalance: "100.00", valuationRate: "1400", id: "wallet", revision: 1, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" };
function expense(id: string, paymentDate = date): Expense { return { ...newExpense(date), id, revision: 1, createdAt: id, updatedAt: id, title: "가상 지출", assetId: "wallet", paymentKind: "cash", paymentMethod: "예시 달러 지갑", currency: "USD", receiptCurrency: "USD", paidAmount: "10.25", paymentDate }; }

test("자산 환율은 최소 단위와 소수 8자리로 계산하고 미확정·0을 구분한다", () => {
  assert.equal(valueInWon(1025, "USD", "1400"), 14350);
  assert.equal(valueInWon(100, "JPY", "9.12345678"), 912);
  assert.equal(valueInWon(1, "USD", "50"), 1);
  assert.equal(valueInWon(-1, "USD", "50"), -1);
  assert.equal(valueInWon(100, "USD", null), null);
  assert.equal(valueInWon(100, "USD", "0"), 0);
  assert.equal(valueInWon(100, "KRW", null), 100);
  assert.equal(assetInputSchema.safeParse({ ...asset, valuationRate: "-1" }).success, false);
  assert.equal(assetInputSchema.safeParse({ ...asset, valuationRate: "1.123456789" }).success, false);
  assert.equal(assetInputSchema.safeParse({ ...asset, openingBalance: "1.001" }).success, false);
});
test("자산은 내 몫이 아닌 실제 결제 전체액을 차감하고 기준일·미래 거래를 구분한다", () => {
  const shared = { ...expense("1"), shared: true, ownAmount: "5.00", useDate: "2026-10-20" };
  const entries = [shared, expense("2", "2026-10-17"), expense("3", "2026-10-19")];
  assert.deepEqual(assetPosition(asset, entries, date), { net: -1025, balance: 8975, won: 125650, effective: true });
  assert.equal(assetPosition({ ...asset, openingBalance: null }, entries, date).balance, null);
  assert.equal(assetPosition({ ...asset, openingBalance: "0" }, entries, date).balance, -1025);
  assert.equal(assetPosition(asset, entries, "2026-10-17").balance, null);
  const rows = assetLedger(asset, entries);
  assert.equal(rows[0].included, false);
  assert.equal(rows[0].after, null);
  assert.equal(rows[1].before, 10000);
  assert.equal(rows[1].after, 8975);
  assert.equal(rows[2].after, 7950);
});
test("평가 환율 수정은 원래 잔액·지출 원화 확정값에 영향을 주지 않는다", () => {
  const entry = { ...expense("1"), krwAmount: "15000" };
  assert.equal(assetPosition({ ...asset, valuationRate: "1500" }, [entry], date).won, 134625);
  assert.equal(assetPosition(asset, [entry], date).balance, 8975);
  assert.equal(entry.krwAmount, "15000");
});
test("자산·지출 저장은 같은 파일에서 보존되고 잘못된 연결과 충돌을 거절한다", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "moneybook-assets-test-"));
  const file = path.join(folder, "ledger.json");
  try {
    // 이전 파일에는 assets 배열이 없어도 모든 지출을 보존합니다.
    await writeFile(file, JSON.stringify({ version: 1, expenses: seedExpenses }));
    const repository = createExpenseRepository(file);
    assert.deepEqual(await repository.listAssets(), []);
    await repository.saveAsset(asset, "wallet", null);
    await repository.save(expense("linked"), "linked", null);
    assert.equal((await createExpenseRepository(file).listAssets())[0].valuationRate, "1400");
    assert.equal((await repository.list()).length, 7);
    await assert.rejects(repository.save({ ...expense("bad"), currency: "KRW", paidAmount: "10" }, "bad", null), { status: 400 });
    await assert.rejects(repository.save({ ...expense("bad"), paymentKind: "card" }, "bad", null), { status: 400 });
    await assert.rejects(repository.save({ ...expense("bad"), assetId: "missing" }, "bad", null), { status: 400 });
    await assert.rejects(repository.saveAsset({ ...asset, currency: "JPY", openingBalance: "100" }, "wallet", 1), { status: 400 });
    await Promise.all([repository.saveAsset({ ...asset, valuationRate: "1500" }, "wallet", 1), repository.save({ ...expense("linked"), paidAmount: "20.00" }, "linked", 1)]);
    assert.equal((await repository.listAssets())[0].valuationRate, "1500");
    assert.equal((await repository.list()).find((e) => e.id === "linked")?.paidAmount, "20.00");
    await assert.rejects(repository.saveAsset(asset, "wallet", 1), { status: 409 });
    assert.equal((await repository.saveAsset({ ...asset, name: "예시 두 번째 지갑" }, "wallet-2", null)).length, 2);
    await repository.save({ ...expense("linked"), assetId: "wallet-2" }, "linked", 2);
    const all = await repository.list();
    assert.equal(assetPosition((await repository.listAssets())[0], all, date).balance, 10000);
    assert.equal(assetPosition((await repository.listAssets())[1], all, date).balance, 8975);
    await writeFile(file, "broken");
    await assert.rejects(repository.saveAsset(asset, "wallet", 2), { status: 500 });
    assert.equal(await readFile(file, "utf8"), "broken");
  } finally {
    const resolved = path.resolve(folder);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith("moneybook-assets-test-"));
    await rm(resolved, { recursive: true, force: true });
  }
});
