import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { userExpenseRepository, storedSchema } from "./expense-repository";
import { newExpense } from "./expense";
import { newOperation, statementRows } from "./operations";

test("카드 목록이 없던 기존 장부도 읽고 기존 승인·명세서 연결을 유지한다", () => {
  const book = storedSchema.parse({ version: 1, expenses: [], assets: [], operations: [] });
  assert.deepEqual(book.cards, []);
});
test("신용카드 등록은 계정별로 보존되고 중복·재시도를 구분하며 예금 출금을 만들지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-cards-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const repository = userExpenseRepository("card-owner", directory);
    const id = randomUUID(), input = { name: "생활 카드", issuer: "예시 카드사" };
    await repository.saveCard(input, id);
    await repository.saveCard(input, id);
    assert.equal((await userExpenseRepository("card-owner", directory).listCards()).length, 1);
    assert.deepEqual(await userExpenseRepository("other-owner", directory).listCards(), []);
    await assert.rejects(repository.saveCard(input, randomUUID()), { status: 409 });
    const expense = { ...newExpense("2026-10-19"), title: "예시 승인", paymentMethod: input.name, paidAmount: "1000" };
    await repository.save(expense, randomUUID(), null);
    assert.equal((await repository.listCards())[0].name, input.name);
    assert.deepEqual(await repository.listAssets(), []);
    assert.deepEqual(await repository.listOperations(), []);
    const statement = { ...newOperation("statement", "2026-10-19"), card: input.name };
    const rows = statementRows(statement, { assets: [], expenses: await repository.list(), operations: [], cards: await repository.listCards() });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 1000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
