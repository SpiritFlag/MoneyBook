import { z } from "zod";
import { cardInputSchema } from "@/lib/card";
import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { requireLocal(request); return localJson(await (await authenticatedRepository()).listCards()); }
  catch (error) { return localFailure(error); }
}
async function save(request: Request, update: boolean) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const schema = z.object({ id: z.string().uuid(), card: cardInputSchema });
    const parsed = (update ? schema.extend({ revision: z.number().int().positive() }) : schema).safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: parsed.error.issues[0].message }, 400);
    return localJson(await repository.saveCard(parsed.data.card, parsed.data.id, "revision" in parsed.data ? parsed.data.revision as number : null), update ? 200 : 201);
  } catch (error) { return localFailure(error); }
}

export async function POST(request: Request) { return save(request, false); }
export async function PUT(request: Request) { return save(request, true); }
