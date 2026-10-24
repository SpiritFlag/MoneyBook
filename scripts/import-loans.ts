import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { loanBatchSchema } from "../src/lib/loan";
import { storedSchema } from "../src/lib/expense-repository";
import { createNeonBookReader, createNeonRepository } from "../src/lib/neon-repository";

// Run only after all production writers understand Book.loans. No fixture is bundled here.
async function main() {
  const { values } = parseArgs({ options: { input: { type: "string" }, "owner-file": { type: "string" }, "env-file": { type: "string", default: ".env.local" }, apply: { type: "boolean", default: false } } });
  if (!values.input || !values["owner-file"]) throw new Error("--input and --owner-file are required");
  const env = parseEnv(await readFile(values["env-file"]!, "utf8"));
  if (!env.DATABASE_URL || env.DATABASE_URL === "[SENSITIVE]") throw new Error("A local-only DATABASE_URL is required");
  const target = JSON.parse(await readFile(values["owner-file"], "utf8"));
  if (!/^user_[A-Za-z0-9]+$/.test(target.ownerId) || new URL(env.DATABASE_URL).hostname !== target.databaseHost) throw new Error("Owner/database target mismatch");
  const incoming = loanBatchSchema.parse(JSON.parse(await readFile(values.input, "utf8")));
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`SELECT revision, payload FROM moneybook.books WHERE owner_id = ${target.ownerId}`;
  if (rows.length !== 1) throw new Error("The verified owner's existing book is required");
  const before = storedSchema.parse(rows[0].payload);
  for (const loan of incoming) {
    const previous = before.loans.find(row => row.id === loan.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(loan)) throw new Error("Conflicting existing loan; no changes written");
  }
  console.log(JSON.stringify({ mode: values.apply ? "apply" : "plan", incoming: incoming.length, existing: before.loans.length, newLoans: incoming.filter(row => !before.loans.some(old => old.id === row.id)).length, repayments: incoming.reduce((sum, row) => sum + row.repayments.length, 0) }));
  if (!values.apply) return;
  await mkdir("backups", { recursive: true });
  const backup = `backups/loans-before-${new Date().toISOString().replaceAll(":", "-")}.json`;
  await writeFile(backup, JSON.stringify({ ownerId: target.ownerId, revision: rows[0].revision, payload: rows[0].payload }, null, 2), { flag: "wx", mode: 0o600 });
  const saved = await createNeonRepository(target.ownerId, env.DATABASE_URL).importLoans(incoming);
  const after = await createNeonBookReader(target.ownerId, env.DATABASE_URL)();
  for (const loan of incoming) if (JSON.stringify(after.loans.find(row => row.id === loan.id)) !== JSON.stringify(loan)) throw new Error("Read-back verification failed; backup retained");
  const withoutLoans = (book: typeof before) => { const { loans: _loans, ...rest } = book; void _loans; return createHash("sha256").update(JSON.stringify(rest)).digest("hex"); };
  console.log(JSON.stringify({ ...saved, readBackVerified: true, otherSectionsUnchanged: withoutLoans(before) === withoutLoans(after), backup }));
}
main().catch(error => { console.error(error instanceof Error && ["Error", "ZodError", "RepositoryError"].includes(error.name) ? error.message : "Loan import failed; inspect local target and backup"); process.exitCode = 1; });
