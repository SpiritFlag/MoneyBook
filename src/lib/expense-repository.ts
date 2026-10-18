import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { expenseInputSchema, expenseSchema, type Expense, type ExpenseInput } from "./expense";
import { seedExpenses } from "./seed-expenses";

export class RepositoryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const storedSchema = z.object({ version: z.literal(1), expenses: z.array(expenseSchema) });

// 이 어댑터만 추후 Neon 저장소로 교체합니다. 현재는 단일 로컬 서버용입니다.
export function createExpenseRepository(file: string) {
  let writes: Promise<unknown> = Promise.resolve();
  async function list(): Promise<Expense[]> {
    try {
      return storedSchema.parse(JSON.parse(await readFile(file, "utf8"))).expenses;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(seedExpenses);
      throw new RepositoryError("체험 장부를 읽지 못했어요. 기존 파일은 보존했어요. 서버 로그를 확인해 주세요.", 500);
    }
  }
  async function write(expenses: Expense[]) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, expenses }, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  }
  function save(input: ExpenseInput, id: string, expectedRevision: number | null): Promise<Expense[]> {
    const operation = writes.then(async () => {
      const expenses = await list();
      const index = expenses.findIndex((e) => e.id === id);
      if (expectedRevision !== null && index < 0) throw new RepositoryError("수정할 거래를 찾을 수 없어요.", 404);
      if (expectedRevision === null && index >= 0) {
        // 같은 생성 요청 재시도는 새 거래를 중복 생성하지 않습니다.
        if (JSON.stringify(expenseInputSchema.parse(expenses[index])) !== JSON.stringify(expenseInputSchema.parse(input))) throw new RepositoryError("이 기록은 이미 저장됐어요. 일일 내역에서 다시 열어 수정해 주세요.", 409);
        return expenses;
      }
      if (index >= 0 && expenses[index].revision !== expectedRevision) throw new RepositoryError("다른 화면에서 이 거래가 바뀌었어요. 현재 입력을 복사해 두고 최신 거래를 다시 열어 주세요.", 409);
      const now = new Date().toISOString();
      const record: Expense = { ...input, id, revision: index >= 0 ? expenses[index].revision + 1 : 1, createdAt: index >= 0 ? expenses[index].createdAt : now, updatedAt: now };
      if (index >= 0) expenses[index] = record;
      else expenses.unshift(record);
      await write(expenses);
      return expenses;
    });
    writes = operation.catch(() => undefined);
    return operation;
  }
  return { list, save };
}

// HMR로 모듈이 다시 로드되어도 이 로컬 서버의 쓰기 큐를 유지합니다.
const runtime = globalThis as typeof globalThis & { moneybookRepositoryV2?: ReturnType<typeof createExpenseRepository> };
export const expenseRepository = runtime.moneybookRepositoryV2 ??= createExpenseRepository(path.join(process.cwd(), ".local", "demo-ledger-v1.json"));
