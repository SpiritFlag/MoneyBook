import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { expenseInputSchema, expenseSchema, type Expense, type ExpenseInput } from "./expense";
import { assetInputSchema, assetSchema, type AssetInput, type Asset } from "./asset";
import { operationInputSchema, operationSchema, validateOperations, operationPostings, newOperation, newRow, type Operation, type OperationInput } from "./operations";
import { seedExpenses } from "./seed-expenses";

export class RepositoryError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "RepositoryError"; }
}
const storedSchema = z.object({ version: z.literal(1), expenses: z.array(expenseSchema), assets: z.array(assetSchema).default([]), operations: z.array(operationSchema).default([]) });
type Book = z.infer<typeof storedSchema>;

// 자산과 지출을 같은 쓰기 큐·파일에서 검증하고 저장합니다.
type WriteQueue = { writes: Promise<unknown> };
export function createExpenseRepository(file: string, queue: WriteQueue = { writes: Promise.resolve() }) {
  async function read(): Promise<Book> {
    try { return storedSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, expenses: structuredClone(seedExpenses), assets: [], operations: [] };
      throw new RepositoryError("체험 장부를 읽지 못했어요. 기존 파일은 보존했어요. 서버 로그를 확인해 주세요.", 500);
    }
  }
  async function write(book: Book, verifyingId?: string) {
    try { validateOperations(book, verifyingId); } catch (error) { throw new RepositoryError(error instanceof Error ? error.message : "연결 거래를 확인해 주세요.", 400); }
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(book, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  }
  function enqueue<T>(operation: (book: Book) => Promise<T>): Promise<T> {
    const result = queue.writes.then(async () => operation(await read()));
    queue.writes = result.catch(() => undefined);
    return result;
  }
  function save(input: ExpenseInput, id: string, expectedRevision: number | null): Promise<Expense[]> {
    return enqueue(async (book) => {
      input = expenseInputSchema.parse(input);
      if (input.assetId) {
        const asset = book.assets.find((a) => a.id === input.assetId);
        if (!asset) throw new RepositoryError("선택한 자산을 찾을 수 없어요.", 400);
        if (input.currency !== asset.currency) throw new RepositoryError("결제 통화와 자산의 통화가 같아야 해요.", 400);
        if (input.paymentKind !== asset.kind) throw new RepositoryError("결제 방식이 자산 종류와 맞지 않아요. 자산을 다시 선택해 주세요.", 400);
        input = { ...input, paymentMethod: asset.name };
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
        const transfer: Operation = { ...newOperation("transfer", date), title: `${input.title} · 연결 충전`, parentId: id, time: t.sameTime ? input.time : t.time, rows: [{ ...newRow(date, "topup"), fromId: t.fromId, toId: input.assetId, amount: t.amount, received: t.received, rate: t.rate, time: t.sameTime ? input.time : t.time }], id: previous?.id ?? randomUUID(), revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
        if (previous) book.operations[linked] = transfer; else book.operations.push(transfer);
      } else if (linked >= 0) {
        book.operations[linked] = { ...book.operations[linked], parentId: "", revision: book.operations[linked].revision + 1, updatedAt: now };
      }
      const record: Expense = { ...input, id, revision: index >= 0 ? expenses[index].revision + 1 : 1, createdAt: index >= 0 ? expenses[index].createdAt : now, updatedAt: now };
      if (index >= 0) expenses[index] = record; else expenses.unshift(record);
      await write(book);
      return expenses;
    });
  }
  function saveAsset(input: AssetInput, id: string, revision: number | null): Promise<Asset[]> {
    return enqueue(async (book) => {
      input = assetInputSchema.parse(input);
      const index = book.assets.findIndex((a) => a.id === id);
      if (revision !== null && index < 0) throw new RepositoryError("수정할 자산을 찾을 수 없어요.", 404);
      const previous = book.assets[index];
      if (revision === null && previous) {
        if (JSON.stringify(assetInputSchema.parse(previous)) === JSON.stringify(input)) return book.assets;
        throw new RepositoryError("이미 저장한 자산이에요. 자산 현황에서 다시 열어 주세요.", 409);
      }
      if (previous && previous.revision !== revision) throw new RepositoryError("다른 화면에서 자산이 바뀌었어요. 최신 내용을 다시 열어 주세요.", 409);
      if (previous && (previous.currency !== input.currency || previous.kind !== input.kind) && (book.expenses.some((e) => e.assetId === id) || operationPostings(book.operations, book.assets).some((p) => p.assetId === id))) throw new RepositoryError("원장에 거래가 있는 자산의 통화와 종류는 바꿀 수 없어요.", 400);
      if (book.assets.some((a) => a.id !== id && a.name === input.name)) throw new RepositoryError("같은 이름의 자산이 있어요. 구분할 수 있는 이름을 입력해 주세요.", 400);
      const now = new Date().toISOString();
      const record: Asset = { ...input, id, revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      if (previous) book.assets[index] = record; else book.assets.push(record);
      await write(book);
      return book.assets;
    });
  }
  function saveOperation(input: OperationInput, id: string, revision: number | null): Promise<Operation[]> {
    return enqueue(async (book) => {
      input = operationInputSchema.parse(input);
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
      const now = new Date().toISOString();
      const record: Operation = { ...input, id, revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      if (previous) book.operations[index] = record; else book.operations.push(record);
      await write(book, id);
      return book.operations;
    });
  }
  return { list: async () => (await read()).expenses, listAssets: async () => (await read()).assets, listOperations: async () => (await read()).operations, save, saveAsset, saveOperation };
}

// HMR 때 검증·저장 함수는 새로 만들고 쓰기 큐만 공유합니다.
// 함수까지 globalThis에 보관하면 개발 중 이전 스키마와 Error 클래스가 남습니다.
const runtime = globalThis as typeof globalThis & { moneybookWriteQueue?: WriteQueue };
const queue = runtime.moneybookWriteQueue ??= { writes: Promise.resolve() };
export const expenseRepository = createExpenseRepository(path.join(process.cwd(), ".local", "demo-ledger-v1.json"), queue);
