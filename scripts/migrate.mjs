import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

try { loadEnvFile(process.env.MONEYBOOK_ENV_FILE ?? ".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const connection = new URL(process.env.DATABASE_URL);
  // Migration sessions use the direct endpoint, preserving the supplied database/role.
  connection.hostname = connection.hostname.replace("-pooler.", ".");
  const sql = neon(connection.toString());
  const source = await readFile(new URL("../migrations/001_books.sql", import.meta.url), "utf8");
  const statements = source.split(";").map((s) => s.trim()).filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log("Applied migration 001_books (idempotent). No existing records were changed.");
} catch (error) {
  console.error("Migration failed:", error.code ?? error.name);
  process.exitCode = 1;
}
