import { neon } from "@neondatabase/serverless";
import { createBookRepository, storedSchema, RepositoryError, type Book, type BookStorage, type PersistBook } from "./expense-repository";

type Snapshot = { revision: number; book: Book };
const emptyBook = (): Book => ({ version: 1, gameCurrencies: [], cards: [], expenses: [], assets: [], operations: [], loans: [] });
class WriteConflict extends Error {}

// 같은 서버에 동시에 도착한 조회만 합칩니다. 완료된 데이터는 서버에 캐시하지 않습니다.
const reads = new Map<string, Promise<Snapshot>>();

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
