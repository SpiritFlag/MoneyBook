import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { currencyInfo, currencyOptions, gameCurrencyInputSchema } from "./currency";
import { newAsset, assetPosition } from "./asset";
import { newExpense, formatMoney, toMinor } from "./expense";
import { newOperation, newRow, operationPostings, statementRows, consumptionRecords } from "./operations";

const date = "2026-10-19";
const cardId = "c952eb9c-61bc-4687-9245-db467ea023f5";
function fixture() {
  let book: Book = storedSchema.parse({ version: 1, expenses: [], assets: [], operations: [] });
  const repo = createBookRepository({ read: async () => structuredClone(book), transact: async fn => fn(structuredClone(book), async next => { book = structuredClone(next); }) });
  return { repo, read: () => book };
}

test("등록 재화 소비는 충전 환율이나 수동 원화액 대신 재화 고정환율로 저장한다", async () => {
  const { repo, read } = fixture();
  await repo.saveGameCurrency({ code: "MCASH", fixedRate: "10" }, null);
  await repo.save({ ...newExpense(date), title: "마비노기 모바일", paymentKind: "stored", paymentMethod: "M캐시", currency: "MCASH", receiptCurrency: "MCASH", paidAmount: "5900", krwAmount: "1", valuationRate: "0.01", valuationSource: "linked-topup" }, "game", null);
  assert.equal(read().expenses[0].krwAmount, "59000");
  assert.equal(read().expenses[0].valuationRate, "10");
  assert.equal(read().expenses[0].valuationSource, "재화 고정 환율");
  const saved = (await repo.list())[0];
  await repo.save({ ...saved, paidAmount: "6000" }, saved.id, saved.revision);
  assert.equal(read().expenses[0].krwAmount, "60000");
});

test("여러 충전 할인은 저장·재조회·수정 후에도 이름과 금액을 보존한다", async () => {
  const { repo } = fixture();
  await repo.saveAsset({ ...newAsset(date), name: "은행", openingBalance: "100000" }, "bank", null);
  await repo.saveAsset({ ...newAsset(date), name: "M캐시", kind: "stored", currency: "MCASH", openingBalance: "0" }, "wallet", null);
  const discounts = [{ id: "point", name: "삼성전자 포인트", amount: "96000" }, { id: "coupon", name: "쿠폰", amount: "320" }];
  const transfer = { ...newOperation("transfer", date), rows: [{ ...newRow(date, "step"), fromId: "bank", toId: "wallet", amount: "2680", received: "9900", baseAmount: "99000", baseReceived: "9900", rate: "10", discounts }] };
  await repo.saveOperation(transfer, "topup", null);
  const saved = (await repo.listOperations())[0];
  assert.deepEqual(saved.rows[0].discounts, discounts);
  await repo.saveOperation({ ...saved, rows: [{ ...saved.rows[0], discounts: [{ ...discounts[0], name: "삼성전자 포인트 할인", amount: "96320" }] }] }, saved.id, saved.revision);
  const updated = (await repo.listOperations())[0];
  assert.equal(updated.rows[0].discounts?.[0].name, "삼성전자 포인트 할인");
  await repo.saveOperation({ ...updated, rows: [{ ...updated.rows[0], discounts: [], amount: "99000" }] }, updated.id, updated.revision);
  assert.deepEqual((await repo.listOperations())[0].rows[0].discounts, []);
});
test("게임 재화 정의는 자산마다 공유하고 과거 소비 환산과 계정은 독립적으로 보존한다", async () => {
  const { repo, read } = fixture(), other = fixture();
  const code = "예시 골드";
  await repo.saveGameCurrency({ code, fixedRate: "0.25" }, null);
  await repo.saveAsset({ ...newAsset(date), name: "게임 지갑", kind: "stored", currency: code, openingBalance: "100", valuationRate: "999" }, "wallet", null);
  assert.equal(read().assets[0].valuationRate, "0.25");
  assert.equal(formatMoney("100", code), "100 예시 골드");
  assert.equal(toMinor("0.1", code), null);
  await repo.save({ ...newExpense(date), title: "재화 사용", paymentMethod: "게임 지갑", paymentKind: "stored", currency: code, receiptCurrency: code, assetId: "wallet", paidAmount: "20" }, "expense", null);
  assert.equal(read().expenses[0].krwAmount, "5");
  await repo.saveGameCurrency({ code, fixedRate: "0.5" }, 1);
  assert.equal(read().assets[0].valuationRate, "0.5");
  assert.equal(read().expenses[0].krwAmount, "5");
  assert.equal(assetPosition(read().assets[0], read().expenses, date).won, 40);
  assert.deepEqual(await other.repo.listGameCurrencies(), []);
  await assert.rejects(other.repo.saveAsset({ ...newAsset(date), name: "다른 계정", currency: code }, "x", null), /먼저 게임 재화/);
  await assert.rejects(repo.saveGameCurrency({ code, fixedRate: "1" }, 1), /바뀌었어요/);
});
test("카드 충전은 수령 자산과 카드 청구만 만들고 납부 시 계좌에서 한 번 출금한다", async () => {
  const { repo, read } = fixture();
  await repo.saveCard({ name: "검증 카드", issuer: "" }, cardId);
  await repo.saveAsset({ ...newAsset(date), name: "은행", openingBalance: "100000" }, "bank", null);
  await repo.saveAsset({ ...newAsset(date), name: "M캐시 지갑", kind: "stored", currency: "MCASH", openingBalance: "0" }, "wallet", null);
  const transfer = { ...newOperation("transfer", date), rows: [{ ...newRow(date, "step"), cardId, toId: "wallet", amount: "9000", received: "10000" }] };
  await assert.rejects(repo.saveOperation({ ...transfer, rows: [{ ...transfer.rows[0], cardId: "missing" }] }, "invalid", null), /신용카드/);
  await repo.saveOperation(transfer, "topup", null);
  assert.equal(consumptionRecords(read().expenses, read().operations).length, 0);
  let postings = operationPostings(read().operations, read().assets);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].amount, 10000);
  const statement = { ...newOperation("statement", date), card: "검증 카드", amount: "9000", selected: ["transfer:topup/step"], verified: true };
  assert.equal(statementRows(statement, read())[0].amount, 9000);
  await repo.saveOperation(statement, "statement", null);
  await assert.rejects(repo.saveOperation({ ...transfer, rows: [{ ...transfer.rows[0], amount: "8000" }] }, "topup", 1), /총액/);
  await repo.saveOperation({ ...statement, payment: { assetId: "bank", date, time: "18:30", amount: "9000" } }, "statement", 1);
  await repo.saveCard({ name: "바뀐 카드", issuer: "" }, cardId, 1);
  assert.equal(read().operations.find(o => o.id === "statement")?.card, "바뀐 카드");
  assert.equal(read().operations.find(o => o.id === "topup")?.rows[0].cardId, cardId);
  postings = operationPostings(read().operations, read().assets);
  assert.equal(assetPosition(read().assets[0], [], date, postings).balance, 91000);
  assert.equal(consumptionRecords(read().expenses, read().operations).length, 0);
  assert.equal(statementRows({ ...newOperation("statement", "2026-11-19"), card: "바뀐 카드" }, read()).length, 0);
});
test("지출 안에서 카드로 충전해도 승인과 사용은 원자 저장하며 중복 생성하지 않는다", async () => {
  const { repo, read } = fixture();
  await repo.saveCard({ name: "충전 카드", issuer: "" }, cardId);
  await repo.saveAsset({ ...newAsset(date), name: "재화 지갑", kind: "stored", currency: "MCASH", openingBalance: "0" }, "wallet", null);
  const expense = { ...newExpense(date), title: "아이템", paymentMethod: "재화 지갑", paymentKind: "stored" as const, assetId: "wallet", currency: "MCASH", receiptCurrency: "MCASH", paidAmount: "100", topup: { fromId: "", cardId, amount: "900", received: "1000", sameTime: true, date, time: null, rate: "1" } };
  await repo.save(expense, "purchase", null);
  await repo.save(expense, "purchase", null);
  assert.equal(read().operations.length, 1);
  assert.equal(statementRows({ ...newOperation("statement", date), card: "충전 카드" }, read()).length, 1);
  assert.equal(assetPosition(read().assets[0], read().expenses, date, operationPostings(read().operations, read().assets)).balance, 900);
});


test("게임 재화 명칭과 약어 수정은 기존 연결·잔액·과거 환산액을 보존한다", async () => {
  for (const code of ["MCASH", "기존 사용자 골드"]) {
    const { repo, read } = fixture(), other = fixture();
    await repo.saveGameCurrency({ code, fixedRate: "10" }, null);
    await repo.saveAsset({ ...newAsset(date), name: "게임 지갑", kind: "stored", currency: code, openingBalance: "100" }, "wallet", null);
    await repo.save({ ...newExpense(date), title: "재화 사용", paymentMethod: "게임 지갑", paymentKind: "stored", currency: code, receiptCurrency: code, assetId: "wallet", paidAmount: "20" }, "expense", null);
    const before = structuredClone(read());
    const definitions = await repo.saveGameCurrency({ code, name: "새 게임 재화", unit: "GC", fixedRate: "10" }, 1);
    assert.deepEqual(read().assets, before.assets);
    assert.deepEqual(read().expenses, before.expenses);
    assert.equal(assetPosition(read().assets[0], read().expenses, date).balance, 80);
    assert.equal(formatMoney("20", code, definitions), "20 GC");
    assert.deepEqual(currencyInfo(code, definitions), { label: "새 게임 재화 · GC", unit: "GC", digits: 0 });
    assert.equal(currencyOptions(definitions)[code].label, "새 게임 재화 · GC");
    assert.notEqual(currencyInfo(code).unit, "GC");
    assert.deepEqual(await other.repo.listGameCurrencies(), []);
    await assert.rejects(repo.saveGameCurrency({ code, name: "오래된 변경", unit: "OLD", fixedRate: "10" }, 1), /바뀌었어요/);
    const rates = await repo.saveGameCurrency({ code, fixedRate: "12" }, 2);
    assert.equal(rates[0].name, "새 게임 재화");
    assert.equal(rates[0].unit, "GC");
    assert.equal(read().assets[0].valuationRate, "12");
    assert.equal(read().expenses[0].krwAmount, "200");
    assert.equal(gameCurrencyInputSchema.safeParse({ code, name: "  ", unit: "GC", fixedRate: "10" }).success, false);
    assert.equal(gameCurrencyInputSchema.safeParse({ code, name: "재화", unit: " ", fixedRate: "10" }).success, false);
  }
});
