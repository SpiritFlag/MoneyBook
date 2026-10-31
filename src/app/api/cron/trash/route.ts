import { purgeExpiredNeonTrash } from "@/lib/neon-repository";
import { localJson, localFailure } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return localJson({ message: "인증이 필요해요." }, 401);
  try {
    return localJson({ cleanedBooks: await purgeExpiredNeonTrash(process.env.DATABASE_URL ?? "") });
  } catch (error) { return localFailure(error); }
}
