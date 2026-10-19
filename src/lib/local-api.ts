import { RepositoryError } from "./expense-repository";
export function localJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function requireLocal(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (process.env.VERCEL || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new RepositoryError("이 체험 저장소는 로컬 PC에서만 사용할 수 있어요.", 403);
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { throw new RepositoryError("올바른 로컬 화면에서 다시 요청해 주세요.", 403); }
    if (originHost !== host) throw new RepositoryError("같은 로컬 화면에서 다시 요청해 주세요.", 403);
  }
}
export function localFailure(error: unknown) {
  if (error instanceof RepositoryError) return localJson({ message: error.message }, error.status);
  if (error instanceof Error && error.name === "RepositoryError" && "status" in error && typeof error.status === "number" && [400, 401, 403, 404, 409, 413, 415, 500].includes(error.status)) return localJson({ message: error.message }, error.status);
  console.error("체험 장부 요청 실패", error instanceof Error ? error.message : "알 수 없는 오류");
  return localJson({ message: "장부를 처리하지 못했어요. 입력을 유지했으니 잠시 후 다시 시도해 주세요." }, 500);
}
export async function readLocalBody(request: Request): Promise<unknown> {
  requireLocal(request);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RepositoryError("JSON 형식의 요청이 필요해요.", 415);
  const text = await request.text();
  if (text.length > 250_000) throw new RepositoryError("한 번에 저장할 수 있는 크기를 초과했어요.", 413);
  try { return JSON.parse(text); } catch { throw new RepositoryError("요청 내용을 읽을 수 없어요.", 400); }
}
