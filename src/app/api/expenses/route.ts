import { z } from "zod";
import { expenseInputSchema } from "@/lib/expense";
import { expenseRepository, RepositoryError } from "@/lib/expense-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({ id: z.string().uuid(), expense: expenseInputSchema });
const updateSchema = z.object({ id: z.string().min(1).max(80), revision: z.number().int().positive(), expense: expenseInputSchema });

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
function localOnly(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (process.env.VERCEL || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new RepositoryError("이 체험 저장소는 로컬 PC에서만 사용할 수 있어요.", 403);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) throw new RepositoryError("같은 로컬 화면에서 다시 요청해 주세요.", 403);
}
function failure(error: unknown) {
  if (error instanceof RepositoryError) return json({ message: error.message }, error.status);
  console.error("체험 장부 요청 실패", error instanceof Error ? error.message : "알 수 없는 오류");
  return json({ message: "장부를 처리하지 못했어요. 입력을 유지했으니 잠시 후 다시 시도해 주세요." }, 500);
}
export async function GET(request: Request) {
  try { localOnly(request); return json(await expenseRepository.list()); } catch (error) { return failure(error); }
}
async function mutate(request: Request, update: boolean) {
  try {
    localOnly(request);
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "JSON 형식의 요청이 필요해요." }, 415);
    const text = await request.text();
    if (text.length > 250_000) return json({ message: "한 번에 저장할 수 있는 명세 크기를 초과했어요." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ message: "요청 내용을 읽을 수 없어요." }, 400); }
    const parsed = (update ? updateSchema : requestSchema).safeParse(body);
    if (!parsed.success) return json({ message: parsed.error.issues[0].message, issues: parsed.error.issues }, 400);
    const value = parsed.data;
    const revision = "revision" in value && typeof value.revision === "number" ? value.revision : null;
    return json(await expenseRepository.save(value.expense, value.id, revision), update ? 200 : 201);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) { return mutate(request, false); }
export async function PUT(request: Request) { return mutate(request, true); }
