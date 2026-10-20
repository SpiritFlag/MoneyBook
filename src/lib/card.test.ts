import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { userExpenseRepository, storedSchema } from "./expense-repository";
import { expenseInputSchema, newExpense } from "./expense";
import { newOperation, newRow, statementRows, operationPostings } from "./operations";
import { newAsset, assetPosition } from "./asset";

test("체크카드는 계좌에 연결해 결제액을 한 번 차감하고 이름 변경·수정·재조회에도 유지한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-debit-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const repo = userExpenseRepository("debit-owner", directory);
    const date = "2026-10-20", cardId = randomUUID(), expenseId = randomUUID();
    await repo.saveAsset({ ...newAsset(date), name: "출금 계좌", openingBalance: "10000" }, "bank", null);
    const input = { name: "생활 체크", issuer: "예시 카드사", kind: "debit" as const, assetId: "bank" };
    await assert.rejects(repo.saveCard({ ...input, assetId: null }, cardId), { status: 400 });
    await repo.saveCard(input, cardId);
    await repo.saveCard(input, cardId);
    const draft = { ...newExpense(date), title: "체크 결제", paymentKind: "debit" as const, debitCardId: cardId, paymentMethod: input.name, paidAmount: "3000", assetId: null };
    await repo.save(draft, expenseId, null);
    await repo.save(draft, expenseId, null);
    let expenses = await repo.list();
    const account = (await repo.listAssets())[0];
    assert.equal(expenses[0].assetId, "bank");
    assert.equal(expenses[0].paymentMethod, "생활 체크");
    assert.equal(assetPosition(account, expenses, date).balance, 7000);
    assert.equal(statementRows({ ...newOperation("statement", date), card: input.name }, { assets: [account], expenses, operations: [], cards: await repo.listCards() }).length, 0);
    await repo.save({ ...draft, paidAmount: "2000" }, expenseId, 1);
    const templateId = randomUUID();
    await repo.saveOperation({ ...newOperation("template", date), template: (await repo.list())[0] }, templateId, null);
    await repo.saveCard({ ...input, name: "변경 체크" }, cardId, 1);
    expenses = await userExpenseRepository("debit-owner", directory).list();
    assert.equal(expenses[0].paymentMethod, "변경 체크");
    assert.equal(expenses[0].debitCardId, cardId);
    assert.equal(assetPosition(account, expenses, date).balance, 8000);
    assert.equal((await repo.listCards())[0].kind, "debit");
    assert.equal((await repo.listOperations()).find(o => o.id === templateId)?.template?.paymentMethod, "변경 체크");
    await assert.rejects(repo.save({ ...draft, paymentKind: "card", debitCardId: null, paymentMethod: "변경 체크" }, randomUUID(), null), { status: 400 });
    await assert.rejects(repo.saveOperation({ ...newOperation("statement", date), card: "변경 체크" }, randomUUID(), null), { status: 400 });
    await assert.rejects(repo.saveOperation({ ...newOperation("transfer", date), rows: [{ ...newRow(date, "charge"), cardId, toId: "bank", amount: "1000", received: "1000" }] }, randomUUID(), null), { status: 400 });
    await assert.rejects(repo.saveCard({ name: "변경 체크", issuer: "", kind: "credit" }, cardId, 2), { status: 400 });
    await assert.rejects(repo.save({ ...draft, debitCardId: randomUUID() }, randomUUID(), null), { status: 400 });
    await assert.rejects(repo.save({ ...draft, currency: "USD" }, randomUUID(), null), { status: 400 });
    await assert.rejects(repo.saveAsset({ ...account, kind: "cash" }, account.id, account.revision), { status: 400 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("체크카드 이동·연결 충전은 계좌에서 한 번 출금하고 승인 ID를 보존한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-debit-transfer-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const repo = userExpenseRepository("debit-transfer", directory);
    const date = "2026-10-20", debitCardId = randomUUID();
    await repo.saveAsset({ ...newAsset(date), name: "은행", openingBalance: "30000" }, "bank", null);
    await repo.saveAsset({ ...newAsset(date), name: "충전 잔액", kind: "stored", openingBalance: "1000" }, "stored", null);
    await repo.saveCard({ name: "체크", issuer: "", kind: "debit", assetId: "bank" }, debitCardId);
    const input = { ...newOperation("transfer", date), rows: [{ ...newRow(date, "charge"), debitCardId, fromId: "", toId: "stored", amount: "10000", received: "10000" }] };
    await repo.saveOperation(input, "transfer", null);
    await repo.saveOperation(input, "transfer", null);
    let saved = (await repo.listOperations())[0];
    assert.equal(saved.rows[0].fromId, "bank");
    assert.equal(saved.rows[0].debitCardId, debitCardId);
    const balance = async (id: string) => { const assets = await repo.listAssets(); return assetPosition(assets.find(a => a.id === id)!, await repo.list(), date, operationPostings(await repo.listOperations(), assets)).balance; };
    assert.equal(await balance("bank"), 20000);
    assert.equal(await balance("stored"), 11000);
    await repo.saveOperation({ ...saved, rows: [{ ...saved.rows[0], amount: "12000", received: "12000" }] }, saved.id, saved.revision);
    saved = (await repo.listOperations())[0];
    assert.equal(await balance("bank"), 18000);
    assert.equal(await balance("stored"), 13000);
    await assert.rejects(repo.saveOperation({ ...saved, rows: [{ ...saved.rows[0], fromId: "other" }] }, saved.id, saved.revision), { status: 400 });
    await assert.rejects(repo.saveOperation({ ...saved, rows: [{ ...saved.rows[0], cardId: debitCardId }] }, saved.id, saved.revision), { status: 400 });
    await assert.rejects(repo.saveCard({ name: "체크", issuer: "", kind: "credit" }, debitCardId, 1), { status: 400 });
    const draft = { ...newExpense(date), title: "연결 충전 결제", assetId: "stored", paymentKind: "stored" as const, paymentMethod: "충전 잔액", paidAmount: "1500", topup: { debitCardId, fromId: "", amount: "10000", received: "10000", rate: "1", date, time: null, sameTime: true } };
    await repo.save(draft, "expense", null);
    await repo.save(draft, "expense", null);
    assert.equal(await balance("bank"), 8000);
    assert.equal(await balance("stored"), 21500);
    await repo.save({ ...draft, paidAmount: "2000" }, "expense", 1);
    assert.equal(await balance("bank"), 8000);
    assert.equal(await balance("stored"), 21000);
    await repo.saveCard({ name: "바꾼 체크", issuer: "", kind: "debit", assetId: "bank" }, debitCardId, 1);
    const book = { assets: await repo.listAssets(), expenses: await repo.list(), operations: await repo.listOperations(), cards: await repo.listCards() };
    assert.equal(statementRows({ ...newOperation("statement", date), card: "바꾼 체크" }, book).length, 0);
    assert.equal(book.operations.find(o => o.parentId === "expense")?.rows[0].debitCardId, debitCardId);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
