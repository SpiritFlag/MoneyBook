import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { userExpenseRepository } from "./expense-repository";
import { expenseInputSchema } from "./expense";
import { seedExpenses } from "./seed-expenses";

test("계정별 저장소는 빈 장부에서 시작하고 다른 계정의 기록을 노출하지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "moneybook-accounts-"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  try {
    const first = userExpenseRepository("user_first", directory);
    const second = userExpenseRepository("user_second", directory);
    assert.deepEqual(await first.list(), []);
    const input = expenseInputSchema.parse(seedExpenses[0]);
    const id = randomUUID();
    await first.save(input, id, null);
    assert.equal((await userExpenseRepository("user_first", directory).list())[0].id, id);
    assert.deepEqual(await second.list(), []);
    await assert.rejects(second.save(input, id, 1), { status: 404 });
    assert.equal((await first.list()).length, 1);
    assert.throws(() => userExpenseRepository("", directory), { status: 401 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
