import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";

// 접속 정보나 테이블 내용을 출력하지 않는 읽기 전용 점검입니다.
try { loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const secret = process.env.CLERK_SECRET_KEY ?? "";
const mode = publishable.startsWith("pk_test_") ? "development" : publishable.startsWith("pk_live_") ? "production" : "invalid";
console.log("Clerk key mode:", mode);
console.log("Clerk key pair mode matches:", mode === "development" ? secret.startsWith("sk_test_") : mode === "production" && secret.startsWith("sk_live_"));
if (!process.env.DATABASE_URL) {
  console.log("Neon: DATABASE_URL is missing");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`select count(*)::int as count from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`;
    console.log("Neon: connected; visible user tables:", rows[0].count);
  } catch (error) {
    // Driver messages can contain connection details; expose only the error code.
    console.error("Neon: connection failed", error.code ?? error.name);
    process.exitCode = 1;
  }
}
