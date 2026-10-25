import { neon } from "@neondatabase/serverless";
import { RepositoryError, storedSchema } from "./expense-repository";
import { createBuddyReviewService, type BuddySnapshot, type BuddyStored } from "./buddy-review";

// Review writes have no access to book mutation methods. Every query is bound
// to the verified user, and the original financial JSONB is never updated.
export function createNeonBuddyReviews(userId: string, connectionString: string) {
  if (!userId) throw new RepositoryError("로그인이 필요해요.", 401);
  if (!connectionString) throw new RepositoryError("DB 연결 설정이 필요해요.", 503);
  const sql = neon(connectionString);
  return createBuddyReviewService({
    async read(month) {
      const [row] = await sql`SELECT b.revision,b.payload,now() read_at,
        (SELECT jsonb_build_object('revision',r.revision,'reviews',r.reviews,'summary',r.summary,'generatedAt',r.generated_at)
         FROM moneybook.buddy_reviews r WHERE r.owner_id=${userId} AND r.month=${month} ORDER BY r.revision DESC LIMIT 1) snapshot
        FROM (SELECT 1) anchor LEFT JOIN moneybook.books b ON b.owner_id=${userId}`;
      return { book: storedSchema.parse(row.payload ?? { version: 1, expenses: [], assets: [], operations: [] }), bookRevision: Number(row.revision ?? 0), snapshot: row.snapshot as BuddySnapshot | null, readAt: new Date(row.read_at).toISOString() };
    },
    async replay(key) {
      const [row] = await sql`SELECT month,revision,reviews,summary,generated_at "generatedAt",request_fingerprint "requestFingerprint",idempotency_key "idempotencyKey" FROM moneybook.buddy_reviews WHERE owner_id=${userId} AND idempotency_key=${key}`;
      return row ? row as BuddyStored & { month: string } : null;
    },
    async insert(month, bookRevision, expectedRevision, value) {
      try {
        const rows = await sql`WITH source AS MATERIALIZED (SELECT revision FROM moneybook.books WHERE owner_id=${userId} FOR SHARE)
          INSERT INTO moneybook.buddy_reviews(owner_id,month,revision,reviews,summary,generated_at,idempotency_key,request_fingerprint)
          SELECT ${userId},${month},${value.revision},${JSON.stringify(value.reviews)}::jsonb,${JSON.stringify(value.summary)}::jsonb,${value.generatedAt}::timestamptz,${value.idempotencyKey},${value.requestFingerprint}
          WHERE coalesce((SELECT revision FROM source),0)=${bookRevision}
          AND coalesce((SELECT max(revision) FROM moneybook.buddy_reviews WHERE owner_id=${userId} AND month=${month}),0)=${expectedRevision}
          RETURNING revision`;
        return rows.length === 1;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") return false;
        throw error;
      }
    },
  });
}
