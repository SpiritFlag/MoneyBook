import { auth } from "@clerk/nextjs/server";
import { buddyMonthSchema } from "@/lib/buddy-review";
import { createNeonBuddyReviews } from "@/lib/neon-buddy-review";
import { RepositoryError } from "@/lib/expense-repository";
import { localJson, localFailure, requireLocal } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The web exposes only GET. Saving reviews is an authenticated MCP operation.
export async function GET(request: Request) {
  try {
    requireLocal(request);
    const { userId } = await auth();
    if (!userId) throw new RepositoryError("로그인 후 장부를 열어 주세요.", 401);
    const parsed = buddyMonthSchema.safeParse(new URL(request.url).searchParams.get("month"));
    if (!parsed.success) return localJson({ message: "올바른 조회 월을 선택해 주세요." }, 400);
    return localJson(await createNeonBuddyReviews(userId, process.env.DATABASE_URL ?? "").read(parsed.data));
  } catch (error) { return localFailure(error); }
}
