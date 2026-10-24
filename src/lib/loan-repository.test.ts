import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createExpenseRepository, storedSchema } from "./expense-repository";
import { exampleLoan, exampleCreditLoan } from "./loan-sample";
import { loanBatchSchema } from "./loan";
import { newAsset } from "./asset";

test("기존 장부는 대출 없는 장부로 읽고 중복 ID 배치를 거절한다", () => {
  assert.deepEqual(storedSchema.parse({ version: 1, expenses: [] }).loans, []);
  assert.equal(loanBatchSchema.safeParse([exampleLoan, exampleLoan]).success, false);
});

test("대출 배치는 원자적으로 추가·재시도되며 다른 저장과 계정에서 보존·격리된다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-loans-"));
  try {
    const a = createExpenseRepository(path.join(directory, "owner.json"), undefined, []);
    const b = createExpenseRepository(path.join(directory, "other.json"), undefined, []);
    await a.saveAsset({ ...newAsset("2026-10-01"), name: "가상 계좌", openingBalance: "1234" }, "bank", null);
    const assets = await a.listAssets();
    assert.deepEqual(await a.importLoans([exampleLoan]), { added: 1, total: 1 });
    assert.deepEqual(await a.importLoans([exampleLoan]), { added: 0, total: 1 });
    assert.deepEqual(await a.listAssets(), assets);
    assert.deepEqual(await b.listLoans(), []);
    await assert.rejects(a.importLoans([exampleCreditLoan, { ...exampleLoan, name: "충돌하는 이름" }]), { status: 409 });
    assert.deepEqual(await a.listLoans(), [exampleLoan]);
    await a.saveAsset({ ...assets[0], name: "수정된 계좌" }, "bank", 1);
    assert.deepEqual(await a.listLoans(), [exampleLoan]);
    assert.deepEqual(await createExpenseRepository(path.join(directory, "owner.json"), undefined, []).listLoans(), [exampleLoan]);
    assert.deepEqual(await a.list(), []);
    assert.deepEqual(await a.listOperations(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
