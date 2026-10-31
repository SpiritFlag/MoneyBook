import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonRepository } from "../src/lib/neon-repository";
import { newAsset } from "../src/lib/asset";
import { exampleLoan } from "../src/lib/loan-sample";
import { loanScheduleKey, loanScheduleBasis } from "../src/lib/loan-payment";

async function main() {
  const testEnv = parseEnv(readFileSync(".env.neon-test.local", "utf8"));
  const appEnv = parseEnv(readFileSync(".env.local", "utf8"));
  if (testEnv.MONEYBOOK_TEST_DATABASE !== "1" || !testEnv.DATABASE_URL || !appEnv.DATABASE_URL) throw new Error("Dedicated test database required");
  const connection = testEnv.DATABASE_URL;
  assert.notEqual(new URL(connection).hostname.replace("-pooler.", "."), new URL(appEnv.DATABASE_URL).hostname.replace("-pooler.", "."));
  const sql = neon(connection);
  const owner = `loan_payment_test_${randomUUID()}`, other = `loan_payment_test_${randomUUID()}`;
  const repository = createNeonRepository(owner, connection), second = createNeonRepository(owner, connection);
  try {
    await repository.importLoans([exampleLoan]);
    const account = randomUUID();
    await repository.saveAsset({ ...newAsset("2026-10-01"), name: "Test repayment bank", kind: "account", openingBalance: "1000000" }, account, null);
    const row = exampleLoan.schedule[0];
    const payment = { loanId: exampleLoan.id, scheduleKey: loanScheduleKey(row), scheduleBasis: loanScheduleBasis(row), date: "2026-10-27", time: null, assetId: account, principal: row.principal, interest: row.interest, fee: row.fee, memo: "Test repayment" };
    await assert.rejects(createNeonRepository(other, connection).saveLoanPayment(payment, randomUUID(), null), { status: 404 });
    const attempts = await Promise.allSettled([repository.saveLoanPayment(payment, randomUUID(), null), second.saveLoanPayment(payment, randomUUID(), null)]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1, "Concurrent writes must not duplicate one schedule installment");
    const records = await second.list();
    assert.equal(records.length, 1);
    assert.equal(records[0].loanPayment?.dueDate, "2026-10-25");
    assert.equal(records[0].paymentDate, "2026-10-27");
    assert.equal((await second.listLoans())[0].repayments.length, 2);
    const raw = await sql`SELECT payload FROM moneybook.books WHERE owner_id = ${owner}`;
    assert.deepEqual(raw[0].payload.loans, [exampleLoan], "Imported lender notes must remain unchanged");
    const changed = await second.saveLoanPayment({ ...payment, date: "2026-10-28", interest: 60000 }, records[0].id, 1);
    assert.equal(changed.revision, 2);
    const entry = await repository.moveToTrash("expense", records[0].id, 2);
    assert.equal((await second.listLoans())[0].repayments.length, 1);
    await second.restoreTrash(entry.id);
    assert.equal((await repository.listLoans())[0].repayments.at(-1)?.date, "2026-10-28");
    console.log("PASS: scheduled loan repayment, actual debit date, concurrent duplicate prevention, account isolation, edits, trash and restore in Neon.");
  } finally {
    await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner}, ${other})`;
  }
}
void main().catch(error => { console.error("Loan payment DB test failed:", error instanceof Error ? error.name : "unknown"); process.exitCode = 1; });
