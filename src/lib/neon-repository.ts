import { neon } from "@neondatabase/serverless";
import { createBookRepository, storedSchema, RepositoryError, type Book, type BookStorage, type PersistBook } from "./expense-repository";
import { TRASH_RETENTION_MS } from "./trash";

type Snapshot = { revision: number; book: Book };
const emptyBook = (): Book => ({ version: 1, gameCurrencies: [], cards: [], expenses: [], assets: [], operations: [], loans: [] });
class WriteConflict extends Error {}

// 같은 서버에 동시에 도착한 조회만 합칩니다. 완료된 데이터는 서버에 캐시하지 않습니다.
const reads = new Map<string, Promise<Snapshot>>();

// One atomic UPDATE preserves concurrent edits via the same book revision used by writers.
export async function purgeExpiredNeonTrash(connectionString: string) {
  if (!connectionString) throw new RepositoryError("DB 연결 설정이 필요해요.", 503);
  const sql = neon(connectionString);
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  const rows = await sql`
    UPDATE moneybook.books
    SET payload = jsonb_set(payload, '{trash}', COALESCE((
      SELECT jsonb_agg(entry ORDER BY position)
      FROM jsonb_array_elements(payload->'trash') WITH ORDINALITY AS entries(entry, position)
      WHERE (entry->>'deletedAt')::timestamptz > ${cutoff}::timestamptz
    ), '[]'::jsonb)), revision = revision + 1, updated_at = now()
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'trash', '[]'::jsonb)) AS entries(entry)
      WHERE (entry->>'deletedAt')::timestamptz <= ${cutoff}::timestamptz
    )
    RETURNING owner_id`;
  reads.clear();
  return rows.length;
}

function neonBookSource(userId: string, connectionString: string) {
  if (!userId) throw new RepositoryError("로그인이 필요해요.", 401);
  if (!connectionString) throw new RepositoryError("DB 연결 설정이 필요해요.", 503);
  const sql = neon(connectionString);
  // 비밀 연결 문자열은 캐시 키나 로그에 보관하지 않습니다.
  const database = new URL(connectionString);
  const key = `${database.hostname}${database.pathname}:${userId}`;
  async function readSnapshot(): Promise<Snapshot> {
    const rows = await sql`SELECT revision, payload FROM moneybook.books WHERE owner_id = ${userId}`;
    if (!rows.length) return { revision: 0, book: emptyBook() };
    return { revision: Number(rows[0].revision), book: storedSchema.parse(rows[0].payload) };
  }
  async function read(): Promise<Book> {
    let pending = reads.get(key);
    if (!pending) {
      pending = readSnapshot();
      reads.set(key, pending);
      void pending.finally(() => { if (reads.get(key) === pending) reads.delete(key); }).catch(() => undefined);
    }
    return structuredClone((await pending).book);
  }
  return { sql, key, readSnapshot, read };
}

// MCP receives only this SELECT reader, with no mutation interface.
export function createNeonBookReader(userId: string, connectionString: string) {
  return neonBookSource(userId, connectionString).read;
}

// Same single SELECT as the existing reader; no repository/read-time cleanup.
// A fresh snapshot per MCP call exposes changes between follow-ups and pages.
export function createNeonBookSnapshotReader(userId: string, connectionString: string) {
  const source = neonBookSource(userId, connectionString);
  return async () => {
    const snapshot = await source.readSnapshot();
    return { book: snapshot.book, revision: String(snapshot.revision) };
  };
}

export function createNeonRepository(userId: string, connectionString: string) {
  const { sql, key, readSnapshot, read } = neonBookSource(userId, connectionString);
  const storage: BookStorage = {
    read,
    async transact<T>(operation: (book: Book, persist: PersistBook) => Promise<T>): Promise<T> {
      // 다른 서버에서 동시에 저장해도 DB의 버전 비교로 충돌을 감지합니다.
      for (let attempt = 0; attempt < 5; attempt++) {
        const snapshot = await readSnapshot();
        try {
          return await operation(snapshot.book, async (book) => {
            const payload = JSON.stringify(storedSchema.parse(book));
            const changed = snapshot.revision === 0
              ? await sql`INSERT INTO moneybook.books (owner_id, payload) VALUES (${userId}, ${payload}::jsonb) ON CONFLICT (owner_id) DO NOTHING RETURNING revision`
              : await sql`UPDATE moneybook.books SET payload = ${payload}::jsonb, revision = revision + 1, updated_at = now() WHERE owner_id = ${userId} AND revision = ${snapshot.revision} RETURNING revision`;
            if (!changed.length) throw new WriteConflict();
            reads.delete(key);
          });
        } catch (error) {
          if (!(error instanceof WriteConflict)) throw error;
        }
      }
      throw new RepositoryError("동시에 다른 수정이 저장됐어요. 입력을 유지했으니 다시 저장해 주세요.", 409);
    },
  };
  return createBookRepository(storage);
}
