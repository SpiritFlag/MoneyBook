import { isCustomCurrency, gameCurrencySchema, gameCurrencyInputSchema } from "./currency";
import { toMinor } from "./expense";
import { valueInWon } from "./asset";
import { cardInputSchema, cardSchema, type CardInput } from "./card";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { expenseInputSchema, expenseSchema, type Expense, type ExpenseInput } from "./expense";
import { assetInputSchema, assetSchema, assetOrderSchema, type AssetOrderInput, type AssetInput, type Asset } from "./asset";
import { operationInputSchema, operationSchema, normalizeTransitOperation, validateOperations, operationPostings, statementRows, statementTotal, newOperation, newRow, type Operation, type OperationInput } from "./operations";
import { seedExpenses } from "./seed-expenses";
import { loanSampleSchema, loanBatchSchema, type LoanSample } from "./loan";
import { trashEntrySchema, retainedTrash, type TrashEntry } from "./trash";
import { loanPaymentInputSchema, loanPaymentExpense, loanScheduleKey, loanScheduleBasis, loansWithPayments, validateLoanPayments, type LoanPaymentInput } from "./loan-payment";
import { monthlyLoanPayments } from "./monthly-loan-payments";

export class RepositoryError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "RepositoryError"; }
}
export const storedSchema = z.object({ version: z.literal(1), gameCurrencies: z.array(gameCurrencySchema).default([]), cards: z.array(cardSchema).default([]), expenses: z.array(expenseSchema), assets: z.array(assetSchema).default([]), operations: z.array(operationSchema).default([]), loans: z.array(loanSampleSchema).default([]), trash: z.array(trashEntrySchema).optional() });
export type Book = z.infer<typeof storedSchema>;
export type PersistBook = (book: Book) => Promise<void>;
export interface BookStorage {
  read(): Promise<Book>;
  transact<T>(operation: (book: Book, persist: PersistBook) => Promise<T>): Promise<T>;
}

// 자산과 지출을 같은 쓰기 큐·파일에서 검증하고 저장합니다.
type WriteQueue = { writes: Promise<unknown> };
export function createExpenseRepository(file: string, queue: WriteQueue = { writes: Promise.resolve() }, initialExpenses: Expense[] = seedExpenses) {
  async function read(): Promise<Book> {
    try { return storedSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, gameCurrencies: [], cards: [], expenses: structuredClone(initialExpenses), assets: [], operations: [], loans: [] };
      throw new RepositoryError("체험 장부를 읽지 못했어요. 기존 파일은 보존했어요. 서버 로그를 확인해 주세요.", 500);
    }
  }
  async function write(book: Book) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(book, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  }
  function enqueue<T>(operation: (book: Book, persist: PersistBook) => Promise<T>): Promise<T> {
    const result = queue.writes.then(async () => operation(await read(), write));
    queue.writes = result.catch(() => undefined);
    return result;
  }
  return createBookRepository({ read, transact: enqueue });
}

// 저장 위치와 무관하게 동일한 거래 검증·수정 규칙을 적용합니다.
export function createBookRepository(storage: BookStorage) {
  function debitSource(id: string, fromId: string, book: Book) {
    const card = book.cards.find(c => c.id === id && c.kind === "debit");
    const account = book.assets.find(a => a.id === card?.assetId && a.kind === "account");
    if (!account || (fromId && fromId !== account.id)) throw new RepositoryError("체크카드와 연결 출금 계좌를 확인해 주세요.", 400);
    return account.id;
  }
  const read = async () => {
    const book = await storage.read();
    if (retainedTrash(book.trash ?? []).length === (book.trash?.length ?? 0)) return book;
    return storage.transact(async (latest, persist) => {
      latest.trash = retainedTrash(latest.trash ?? []);
      await persist(latest);
      return latest;
    });
  };
  const enqueue: BookStorage["transact"] = (operation) => storage.transact((book, persist) => {
    book.trash = retainedTrash(book.trash ?? []);
    return operation(book, persist);
  });
  async function write(book: Book, persist: PersistBook, verifyingId?: string) {
    try { validateOperations(book, verifyingId); validateLoanPayments(book.loans, book.expenses); } catch (error) { throw new RepositoryError(error instanceof Error ? error.message : "연결 거래를 확인해 주세요.", 400); }
    await persist(book);
  }
  function save(input: ExpenseInput, id: string, expectedRevision: number | null): Promise<Expense[]> {
    return enqueue(async (book, persist) => {
      input = expenseInputSchema.parse(input);
      if (book.expenses.find(e => e.id === id)?.loanPayment) throw new RepositoryError("원리금 납입은 대출 상세에서 수정해 주세요.", 400);
      if (book.trash?.some(t => t.expenses.some(e => e.id === id))) throw new RepositoryError("휴지통에 있는 거래예요. 먼저 복원해 주세요.", 409);
      if (input.topup?.debitCardId !== undefined) input = { ...input, topup: { ...input.topup, fromId: debitSource(input.topup.debitCardId, input.topup.fromId, book) } };
      if (input.useKind === "period") input = { ...input, useTime: null, useTimeFollowsPayment: false };
      else if (input.useTimeFollowsPayment === true) input = { ...input, useTime: input.time };
      for (const code of [input.currency, input.receiptCurrency]) if (isCustomCurrency(code) && !book.gameCurrencies.some(c => c.code === code)) throw new RepositoryError("먼저 게임 재화를 등록해 주세요.", 400);
      const definition = book.gameCurrencies.find(c => c.code === input.currency);
      if (definition) {
        const won = valueInWon(toMinor(input.paidAmount, input.currency)!, input.currency, definition.fixedRate);
        if (won === null) throw new RepositoryError("원화 평가액 범위를 확인해 주세요.", 400);
        input = { ...input, krwAmount: String(won), valuationRate: definition.fixedRate, valuationSource: "재화 고정 환율" };
      }
      if (input.paymentKind === "debit") {
        const debit = book.cards.find(c => c.id === input.debitCardId && c.kind === "debit");
        const account = book.assets.find(a => a.id === debit?.assetId && a.kind === "account");
        if (!debit || !account || account.currency !== input.currency) throw new RepositoryError("체크카드와 같은 통화의 연결 계좌를 확인해 주세요.", 400);
        input = { ...input, assetId: account.id, paymentMethod: debit.name };
      } else if (input.debitCardId) throw new RepositoryError("체크카드 결제 방식을 선택해 주세요.", 400);
      if (input.assetId) {
        const asset = book.assets.find((a) => a.id === input.assetId);
        if (!asset) throw new RepositoryError("선택한 자산을 찾을 수 없어요.", 400);
        if (input.currency !== asset.currency) throw new RepositoryError("결제 통화와 자산의 통화가 같아야 해요.", 400);
        if ((input.paymentKind === "debit" ? "account" : input.paymentKind) !== asset.kind) throw new RepositoryError("결제 방식이 자산 종류와 맞지 않아요. 자산을 다시 선택해 주세요.", 400);
        if (input.paymentKind !== "debit") input = { ...input, paymentMethod: asset.name };
      }
      const expenses = book.expenses;
      const index = expenses.findIndex((e) => e.id === id);
      if (expectedRevision !== null && index < 0) throw new RepositoryError("수정할 거래를 찾을 수 없어요.", 404);
      if (expectedRevision === null && index >= 0) {
        if (JSON.stringify(expenseInputSchema.parse(expenses[index])) !== JSON.stringify(input)) throw new RepositoryError("이 기록은 이미 저장됐어요. 일일 내역에서 다시 열어 수정해 주세요.", 409);
        return expenses;
      }
      if (index >= 0 && expenses[index].revision !== expectedRevision) throw new RepositoryError("다른 화면에서 이 거래가 바뀌었어요. 현재 입력을 복사해 두고 최신 거래를 다시 열어 주세요.", 409);
      const now = new Date().toISOString();
      const linked = book.operations.findIndex((o) => o.parentId === id && o.kind === "transfer");
      if (input.topup) {
        if (!input.assetId || input.paymentKind === "card") throw new RepositoryError("충전의 도착 자산을 결제수단에서 선택해 주세요.", 400);
        const t = input.topup;
        const date = t.sameTime ? input.paymentDate : t.date;
        const previous = book.operations[linked];
        const transfer: Operation = { ...newOperation("transfer", date), title: `${input.title} · 연결 충전`, parentId: id, time: t.sameTime ? input.time : t.time, rows: [{ ...newRow(date, "topup"), fromId: t.fromId, cardId: t.cardId, debitCardId: t.debitCardId, toId: input.assetId, amount: t.amount, received: t.received, rate: t.rate, time: t.sameTime ? input.time : t.time }], id: previous?.id ?? randomUUID(), revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
        if (previous) book.operations[linked] = transfer; else book.operations.push(transfer);
      } else if (linked >= 0) {
        book.operations[linked] = { ...book.operations[linked], parentId: "", revision: book.operations[linked].revision + 1, updatedAt: now };
      }
      const record: Expense = { ...input, id, revision: index >= 0 ? expenses[index].revision + 1 : 1, createdAt: index >= 0 ? expenses[index].createdAt : now, updatedAt: now };
      if (index >= 0) expenses[index] = record; else expenses.unshift(record);
      await write(book, persist);
      return expenses;
    });
  }
  function reorderAssets(input: AssetOrderInput): Promise<Asset[]> {
    const value = assetOrderSchema.parse(input);
    return enqueue(async (book, persist) => {
      const currentIds = book.assets.map(asset => asset.id);
      const byId = new Map(book.assets.map(asset => [asset.id, asset]));
      if (value.ids.length !== currentIds.length || value.ids.some(id => !byId.has(id))) throw new RepositoryError("자산 목록이 바뀌었어요. 최신 목록에서 순서를 다시 조절해 주세요.", 409);
      if (value.ids.every((id, index) => id === currentIds[index])) return book.assets;
      if (value.expectedIds.length !== currentIds.length || value.expectedIds.some((id, index) => id !== currentIds[index])) throw new RepositoryError("다른 화면에서 자산 순서가 바뀌었어요. 최신 목록에서 다시 조절해 주세요.", 409);
      book.assets = value.ids.map(id => byId.get(id)!);
      // Only permute existing records; leave asset revisions and financial data intact.
      await persist(book);
      return book.assets;
    });
  }
  function saveAsset(input: AssetInput, id: string, revision: number | null): Promise<Asset[]> {
    return enqueue(async (book, persist) => {
      input = assetInputSchema.parse(input);
      const definition = book.gameCurrencies.find(c => c.code === input.currency);
      if (isCustomCurrency(input.currency) && !definition) throw new RepositoryError("먼저 게임 재화를 등록해 주세요.", 400);
      if (definition) input = { ...input, valuationRate: definition.fixedRate };
      const index = book.assets.findIndex((a) => a.id === id);
      if (revision !== null && index < 0) throw new RepositoryError("수정할 자산을 찾을 수 없어요.", 404);
      const previous = book.assets[index];
      if (previous && (previous.kind !== input.kind || previous.currency !== input.currency) && book.cards.some(c => c.assetId === id)) throw new RepositoryError("체크카드가 연결된 계좌의 종류와 통화는 바꿀 수 없어요.", 400);
      if (revision === null && previous) {
        if (JSON.stringify(assetInputSchema.parse(previous)) === JSON.stringify(input)) return book.assets;
        throw new RepositoryError("이미 저장한 자산이에요. 자산 현황에서 다시 열어 주세요.", 409);
      }
      if (previous && previous.revision !== revision) throw new RepositoryError("다른 화면에서 자산이 바뀌었어요. 최신 내용을 다시 열어 주세요.", 409);
      const reclassify = previous && previous.currency === "KRW" && input.currency === "KRW" && ["stored", "transport"].includes(previous.kind) && ["stored", "transport"].includes(input.kind);
      if (previous && (previous.currency !== input.currency || (previous.kind !== input.kind && !reclassify)) && (book.expenses.some((e) => e.assetId === id) || operationPostings(book.operations, book.assets).some((p) => p.assetId === id))) throw new RepositoryError("원장에 거래가 있는 자산의 통화와 종류는 바꿀 수 없어요.", 400);
      if (book.assets.some((a) => a.id !== id && a.name === input.name)) throw new RepositoryError("같은 이름의 자산이 있어요. 구분할 수 있는 이름을 입력해 주세요.", 400);
      const now = new Date().toISOString();
      const record: Asset = { ...input, id, revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      if (previous) book.assets[index] = record; else book.assets.push(record);
      if (previous && reclassify && previous.kind !== input.kind) {
        for (const expense of book.expenses) if (expense.assetId === id && expense.paymentKind === previous.kind) { expense.paymentKind = input.kind; expense.revision++; expense.updatedAt = now; }
        for (const operation of book.operations) if (operation.template?.assetId === id && operation.template.paymentKind === previous.kind) { operation.template.paymentKind = input.kind; operation.revision++; operation.updatedAt = now; }
      }
      await write(book, persist);
      return book.assets;
    });
  }
  function saveOperation(input: OperationInput, id: string, revision: number | null): Promise<Operation[]> {
    return enqueue(async (book, persist) => {
      input = operationInputSchema.parse(normalizeTransitOperation(operationInputSchema.parse(input)));
      if (book.trash?.some(t => t.operations.some(o => o.id === id))) throw new RepositoryError("휴지통에 있는 기록이에요. 먼저 복원해 주세요.", 409);
      if (input.kind === "transfer") input = { ...input, rows: input.rows.map(row => row.debitCardId === undefined ? row : { ...row, fromId: debitSource(row.debitCardId, row.fromId, book) }) };
      const index = book.operations.findIndex((o) => o.id === id);
      const previous = book.operations[index];
      if (revision !== null && !previous) throw new RepositoryError("기록을 찾을 수 없어요.", 404);
      if (previous && revision === null) {
        if (JSON.stringify(operationInputSchema.parse(previous)) === JSON.stringify(input)) return book.operations;
        throw new RepositoryError("이미 저장된 기록이에요. 목록에서 다시 열어 주세요.", 409);
      }
      if (previous && previous.revision !== revision) throw new RepositoryError("다른 화면에서 수정됐어요. 최신 기록을 다시 열어 주세요.", 409);
      if (previous && previous.kind !== input.kind) throw new RepositoryError("기록 종류는 수정할 수 없어요.", 400);
      if (previous?.parentId || input.parentId) throw new RepositoryError("결제와 연결한 충전은 원래 지출의 수정 화면에서 함께 수정해 주세요.", 400);
      if (input.kind === "cancel" && input.sourceRevision !== undefined && book.expenses.find(e => e.id === input.sourceId)?.revision !== input.sourceRevision) throw new RepositoryError("원지출이 변경됐어요. 최신 거래에서 취소를 다시 입력해 주세요.", 409);
      if (input.kind === "cancel" && input.cancelRoute === "exclude" && book.operations.some(o => o.kind === "statement" && o.verified && o.payment && o.selected.includes(input.sourceId))) throw new RepositoryError("이미 납부한 승인은 납부 후 처리 방식을 선택해 주세요.", 400);
      if (previous?.kind === "cancel" && (previous.sourceId !== input.sourceId || previous.cancelRoute !== input.cancelRoute || previous.cancelScope !== input.cancelScope)) throw new RepositoryError("취소 수정 시 원거래·처리 방식·전액/부분 구분은 바꿀 수 없어요.", 400);
      const now = new Date().toISOString();
      const record: Operation = { ...input, id, revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      if (previous) book.operations[index] = record; else book.operations.push(record);
      if (input.kind === "cancel" && input.cancelRoute === "exclude") {
        // Unpaid statements are adjusted together with the cancellation in one transaction.
        for (const statement of book.operations.filter(o => o.kind === "statement" && !o.payment && (o.selected.includes(input.sourceId) || o.deferred.includes(input.sourceId)))) {
          if (input.cancelScope !== "partial") {
            statement.selected = statement.selected.filter(id => id !== input.sourceId);
            statement.deferred = statement.deferred.filter(id => id !== input.sourceId);
            statement.billingDiscounts = statement.billingDiscounts?.filter(d => d.rowId !== input.sourceId);
          }
          if (statement.verified) statement.amount = String(statementTotal(statement, statementRows(statement, book, statement.id)));
          statement.revision++; statement.updatedAt = now;
        }
      }
      if (input.kind === "cancel" && input.cancelScope === "full" && input.cancelRoute === "exclude") {
        // Validate before deleting so paid approvals and invalid amounts cannot bypass checks.
        try { validateOperations(book); } catch (error) { throw new RepositoryError(error instanceof Error ? error.message : "취소 연결을 확인해 주세요.", 400); }
        if (book.operations.some(o => o.allocations.some(a => a.targetId === input.sourceId))) throw new RepositoryError("분담금·보험금 연결을 먼저 정정한 뒤 지출을 삭제해 주세요.", 400);
        book.expenses = book.expenses.filter(e => e.id !== input.sourceId);
        book.operations = book.operations.filter(o => o.kind !== "cancel" || o.sourceId !== input.sourceId);
        for (const expense of book.expenses) if (expense.orderReference === input.sourceId) { expense.orderReference = null; expense.revision++; expense.updatedAt = now; }
        for (const operation of book.operations) if (operation.parentId === input.sourceId) { operation.parentId = ""; operation.revision++; operation.updatedAt = now; }
      }
      await write(book, persist, id);
      return book.operations;
    });
  }
  async function saveCard(input: CardInput, id: string, revision: number | null = null) {
    return enqueue(async (book, persist) => {
      const value = cardInputSchema.parse(input);
      const existing = book.cards.find(c => c.id === id);
      if (value.kind === "debit" && !book.assets.some(a => a.id === value.assetId && a.kind === "account")) throw new RepositoryError("체크카드의 출금 계좌를 선택해 주세요.", 400);
      if (value.kind === "credit" && value.assetId !== null) throw new RepositoryError("신용카드에는 체크카드 출금 계좌를 연결하지 않아요.", 400);
      if (existing && (existing.kind !== value.kind || existing.assetId !== value.assetId) && (book.expenses.some(e => e.debitCardId === id || (e.paymentKind === "card" && e.paymentMethod === existing.name)) || book.operations.some(o => o.card === existing.name || o.rows.some(r => r.cardId === id || r.debitCardId === id) || o.template?.debitCardId === id || (o.template?.paymentKind === "card" && o.template.paymentMethod === existing.name)))) throw new RepositoryError("거래가 연결된 카드의 종류와 출금 계좌는 바꿀 수 없어요. 다른 카드로 등록해 주세요.", 400);
      if (revision !== null && !existing) throw new RepositoryError("수정할 카드를 찾을 수 없어요.", 404);
      if (existing && revision === null) {
        if (JSON.stringify(cardInputSchema.parse(existing)) === JSON.stringify(value)) return book.cards;
        throw new RepositoryError("이미 등록한 카드예요. 목록을 확인해 주세요.", 409);
      }
      if (book.cards.some(c => c.id !== id && c.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new RepositoryError("같은 이름의 카드가 있어요. 구분할 이름을 입력해 주세요.", 409);
      const now = new Date().toISOString();
      if (existing) {
        if (existing.revision !== revision) throw new RepositoryError("다른 화면에서 카드가 수정됐어요. 최신 카드를 다시 열어 주세요.", 409);
        if (existing.name !== value.name) {
          // 이름으로 연결된 이전 기록을 한 번의 장부 저장으로 함께 변경합니다.
          if (book.expenses.some(e => e.paymentKind === "card" && e.paymentMethod === value.name) || book.operations.some(o => o.card === value.name || (o.template?.paymentKind === "card" && o.template.paymentMethod === value.name))) throw new RepositoryError("바꾸려는 이름으로 기록된 다른 카드 거래가 있어요. 다른 이름을 사용해 주세요.", 409);
          for (const expense of book.expenses) if (expense.debitCardId === id || (expense.paymentKind === "card" && expense.paymentMethod === existing.name)) {
            expense.paymentMethod = value.name; expense.revision++; expense.updatedAt = now;
          }
          for (const operation of book.operations) {
            let changed = false;
            if (operation.card === existing.name) { operation.card = value.name; changed = true; }
            if (operation.template && (operation.template.debitCardId === id || (operation.template.paymentKind === "card" && operation.template.paymentMethod === existing.name))) { operation.template.paymentMethod = value.name; changed = true; }
            if (changed) { operation.revision++; operation.updatedAt = now; }
          }
        }
        Object.assign(existing, value, { revision: existing.revision + 1 });
      } else book.cards.push({ ...value, id, revision: 1, createdAt: now });
      await write(book, persist);
      return book.cards;
    });
  }
  async function saveGameCurrency(input: z.infer<typeof gameCurrencyInputSchema>, revision: number | null) {
    return enqueue(async (book, persist) => {
      const value = gameCurrencyInputSchema.parse(input);
      const previous = book.gameCurrencies.find(c => c.code === value.code);
      if (previous && revision === null && previous.fixedRate === value.fixedRate && (value.name === undefined || value.name === previous.name) && (value.unit === undefined || value.unit === previous.unit)) return book.gameCurrencies;
      if ((previous?.revision ?? null) !== revision) throw new RepositoryError("재화 정의가 바뀌었어요. 최신 내용을 다시 열어 주세요.", 409);
      const record = { ...previous, ...value, revision: (previous?.revision ?? 0) + 1 };
      book.gameCurrencies = [...book.gameCurrencies.filter(c => c.code !== value.code), record];
      for (const asset of book.assets) if (asset.currency === value.code && asset.valuationRate !== value.fixedRate) {
        asset.valuationRate = value.fixedRate; asset.revision += 1; asset.updatedAt = new Date().toISOString();
      }
      await write(book, persist);
      return book.gameCurrencies;
    });
  }
  async function moveToTrash(kind: "expense" | "operation", id: string, revision: number) {
    return enqueue(async (book, persist) => {
      const record = (kind === "expense" ? book.expenses : book.operations).find(row => row.id === id);
      if (!record) throw new RepositoryError("삭제할 거래를 찾을 수 없어요.", 404);
      if (record.revision !== revision) throw new RepositoryError("다른 화면에서 거래가 바뀌었어요. 최신 내용을 확인해 주세요.", 409);
      if (kind === "operation" && "parentId" in record && record.parentId) throw new RepositoryError("지출과 함께 저장한 충전이에요. 연결된 지출에서 삭제해 주세요.", 400);
      const expenses = kind === "expense" ? book.expenses.filter(e => e.id === id) : [];
      const operations = book.operations.filter(o => kind === "expense" ? o.parentId === id : o.id === id);
      const ids = new Set([id, ...operations.map(o => o.id)]);
      const references = (ref: string) => ids.has(ref) || [...ids].some(key => ref.startsWith(`${key}/`) || ref.startsWith(`transfer:${key}/`) || ref === `operation:${key}` || ref === `cancel:${key}`);
      const dependent = book.operations.find(o => !ids.has(o.id) && (
        references(o.sourceId) || references(o.parentId) || o.selected.some(references) || o.deferred.some(references) ||
        o.allocations.some(a => references(a.targetId)) || o.billingDiscounts?.some(d => references(d.rowId))
      ));
      if (dependent) throw new RepositoryError(`‘${dependent.title}’에 연결된 거래예요. 해당 기록의 연결을 수정하거나 먼저 휴지통으로 옮겨 주세요.`, 400);
      const valued = book.expenses.find(e => !ids.has(e.id) && e.valuationSource && references(e.valuationSource));
      if (valued) throw new RepositoryError(`‘${valued.title}’의 환산 기준으로 사용 중이에요. 환산 기준을 먼저 수정해 주세요.`, 400);
      const entry: TrashEntry = { id: randomUUID(), deletedAt: new Date().toISOString(), expenses: structuredClone(expenses), operations: structuredClone(operations) };
      book.expenses = book.expenses.filter(e => !ids.has(e.id));
      book.operations = book.operations.filter(o => !ids.has(o.id));
      for (const expense of book.expenses) if (expense.orderReference && references(expense.orderReference)) {
        expense.orderReference = null; expense.revision++; expense.updatedAt = entry.deletedAt;
      }
      book.trash = [...(book.trash ?? []), entry];
      await write(book, persist);
      return entry;
    });
  }
  async function restoreTrash(id: string) {
    return enqueue(async (book, persist) => {
      const entry = book.trash?.find(t => t.id === id);
      if (!entry) throw new RepositoryError("휴지통에서 찾을 수 없거나 보관 기간이 끝났어요.", 404);
      if (entry.expenses.some(e => book.expenses.some(row => row.id === e.id)) || entry.operations.some(o => book.operations.some(row => row.id === o.id))) throw new RepositoryError("같은 ID의 거래가 있어 복원할 수 없어요.", 409);
      const now = new Date().toISOString();
      book.expenses.push(...entry.expenses.map(e => ({ ...e, revision: e.revision + 1, updatedAt: now })));
      book.operations.push(...entry.operations.map(o => ({ ...o, revision: o.revision + 1, updatedAt: now })));
      book.trash = book.trash!.filter(t => t.id !== id);
      // Connected records may have changed while this entry was in the trash.
      await write(book, persist);
      return { restored: id };
    });
  }
  async function listMonthlyLoanPayments(month: string) {
    const book = await read();
    return monthlyLoanPayments(book.loans, book.expenses, month);
  }
  async function saveLoanPayment(input: LoanPaymentInput, id: string, revision: number | null) {
    return enqueue(async (book, persist) => {
      const value = loanPaymentInputSchema.parse(input);
      const loan = book.loans.find(loan => loan.id === value.loanId);
      if (!loan) throw new RepositoryError("현재 계정에서 대출을 찾을 수 없어요.", 404);
      const row = loan.schedule.find(row => loanScheduleKey(row) === value.scheduleKey);
      if (!row) throw new RepositoryError("상환일정을 찾을 수 없어요. 대출 상세를 다시 열어 주세요.", 404);
      if (loanScheduleBasis(row) !== value.scheduleBasis) throw new RepositoryError("상환일정이 바뀌었어요. 최신 일정을 다시 확인해 주세요.", 409);
      const account = book.assets.find(asset => asset.id === value.assetId && asset.kind === "account" && asset.currency === "KRW");
      if (!account) throw new RepositoryError("원화 출금 계좌를 선택해 주세요.", 400);
      if (book.trash?.some(entry => entry.expenses.some(e => e.id === id))) throw new RepositoryError("휴지통에 있는 납입이에요. 먼저 복원해 주세요.", 409);
      const previous = book.expenses.find(e => e.id === id);
      if (previous && (!previous.loanPayment || previous.loanPayment.loanId !== loan.id || previous.loanPayment.scheduleKey !== value.scheduleKey)) throw new RepositoryError("다른 거래에 사용된 ID예요.", 409);
      if (revision !== null && !previous) throw new RepositoryError("수정할 납입을 찾을 수 없어요.", 404);
      if (previous && revision === null) {
        const same = previous.paymentDate === value.date && previous.time === value.time && previous.assetId === value.assetId && previous.memo === value.memo && previous.loanPayment!.principal === value.principal && previous.loanPayment!.interest === value.interest && previous.loanPayment!.fee === value.fee;
        if (same) return previous;
        throw new RepositoryError("이미 저장된 납입이에요. 기존 기록을 다시 열어 주세요.", 409);
      }
      if (previous && previous.revision !== revision) throw new RepositoryError("다른 화면에서 납입을 수정했어요. 최신 기록을 다시 열어 주세요.", 409);
      const record = loanPaymentExpense(value, loan, row, account, id, previous);
      book.expenses = [...book.expenses.filter(e => e.id !== id), record];
      await write(book, persist);
      return record;
    });
  }
  async function importLoans(input: LoanSample[]) {
    const incoming = loanBatchSchema.parse(input);
    return enqueue(async (book, persist) => {
      let added = 0;
      for (const loan of incoming) {
        const previous = book.loans.find(row => row.id === loan.id);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(loan)) throw new RepositoryError("같은 ID의 다른 대출이 있어요. 기존 기록을 보존했어요.", 409);
        } else { book.loans.push(structuredClone(loan)); added++; }
      }
      if (added) await write(book, persist);
      return { added, total: book.loans.length };
    });
  }
  return { reorderAssets, listMonthlyLoanPayments, saveLoanPayment, listTrash: async () => retainedTrash((await read()).trash ?? []), moveToTrash, restoreTrash, listGameCurrencies: async () => (await read()).gameCurrencies, saveGameCurrency, listCards: async () => (await read()).cards, saveCard, list: async () => (await read()).expenses, listAssets: async () => (await read()).assets, listOperations: async () => (await read()).operations, listLoans: async () => { const book = await read(); return loansWithPayments(book.loans, book.expenses); }, importLoans, save, saveAsset, saveOperation };
}

// HMR 때 검증·저장 함수는 새로 만들고 쓰기 큐만 공유합니다.
// 함수까지 globalThis에 보관하면 개발 중 이전 스키마와 Error 클래스가 남습니다.
const runtime = globalThis as typeof globalThis & { moneybookWriteQueue?: WriteQueue };
const queue = runtime.moneybookWriteQueue ??= { writes: Promise.resolve() };
export const expenseRepository = createExpenseRepository(path.join(process.cwd(), ".local", "demo-ledger-v1.json"), queue);

const userRuntime = globalThis as typeof globalThis & { moneybookUserQueues?: Map<string, WriteQueue> };
const userQueues = userRuntime.moneybookUserQueues ??= new Map<string, WriteQueue>();
export function userExpenseRepository(userId: string, directory = path.join(process.cwd(), ".local", "users")) {
  if (!userId) throw new RepositoryError("로그인이 필요해요.", 401);
  const file = path.join(directory, `${createHash("sha256").update(userId).digest("hex")}.json`);
  let userQueue = userQueues.get(file);
  if (!userQueue) { userQueue = { writes: Promise.resolve() }; userQueues.set(file, userQueue); }
  return createExpenseRepository(file, userQueue, []);
}
