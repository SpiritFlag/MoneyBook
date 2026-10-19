import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { userExpenseRepository, storedSchema } from "./expense-repository";
import { expenseInputSchema, newExpense } from "./expense";
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

test("카드 이름 수정은 승인·명세서·템플릿을 함께 바꾸고 오래된 수정과 이름 충돌은 막는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-card-edit-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const repository = userExpenseRepository("owner", directory);
    const cardId = randomUUID(), expenseId = randomUUID(), statementId = randomUUID(), templateId = randomUUID();
    await repository.saveCard({ name: "원래 카드", issuer: "카드사" }, cardId);
    const expense = { ...newExpense("2026-10-19"), title: "승인", paymentMethod: "원래 카드", paidAmount: "1000" };
    await repository.save(expense, expenseId, null);
    await repository.saveOperation({ ...newOperation("statement", "2026-10-19"), card: "원래 카드", amount: "1000", selected: [expenseId], verified: true }, statementId, null);
    await repository.saveOperation({ ...newOperation("template", "2026-10-19"), template: expenseInputSchema.parse(expense) }, templateId, null);
    await repository.saveCard({ name: "바꾼 카드", issuer: "변경 카드사" }, cardId, 1);
    const expenses = await repository.list(), operations = await repository.listOperations();
    assert.equal(expenses[0].paymentMethod, "바꾼 카드");
    assert.equal(expenses[0].revision, 2);
    assert.equal(expenses[0].paidAmount, "1000");
    assert.equal(operations.find(o => o.id === statementId)?.card, "바꾼 카드");
    assert.equal(operations.find(o => o.id === templateId)?.template?.paymentMethod, "바꾼 카드");
    assert.equal(operations.find(o => o.id === statementId)?.verified, true);
    assert.equal((await userExpenseRepository("owner", directory).listCards())[0].revision, 2);
    await assert.rejects(repository.saveCard({ name: "오래된 수정", issuer: "" }, cardId, 1), { status: 409 });
    await assert.rejects(repository.save(expense, expenseId, 1), { status: 409 });
    await assert.rejects(userExpenseRepository("outsider", directory).saveCard({ name: "다른 계정", issuer: "" }, cardId, 2), { status: 404 });
    await repository.saveCard({ name: "다른 카드", issuer: "" }, randomUUID());
    await assert.rejects(repository.saveCard({ name: "다른 카드", issuer: "" }, cardId, 2), { status: 409 });
    assert.deepEqual(await repository.list(), expenses);
    assert.deepEqual(await repository.listOperations(), operations);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
