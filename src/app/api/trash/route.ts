import { z } from "zod";
import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const deleteSchema = z.object({ kind: z.enum(["expense", "operation"]), id: z.string().min(1).max(80), revision: z.number().int().positive() });
const restoreSchema = z.object({ id: z.string().uuid() });
export async function GET(request: Request) {
  try {
    requireLocal(request);
    return localJson(await (await authenticatedRepository()).listTrash());
  } catch (error) { return localFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const parsed = deleteSchema.safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: "삭제할 거래를 확인해 주세요." }, 400);
    return localJson(await repository.moveToTrash(parsed.data.kind, parsed.data.id, parsed.data.revision));
  } catch (error) { return localFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const parsed = restoreSchema.safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: "복원할 거래를 확인해 주세요." }, 400);
    return localJson(await repository.restoreTrash(parsed.data.id));
  } catch (error) { return localFailure(error); }
}
