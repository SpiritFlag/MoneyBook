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
export async function POST(request: Request) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const parsed = z.object({ id: z.string().uuid(), card: cardInputSchema }).safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: parsed.error.issues[0].message }, 400);
    return localJson(await repository.saveCard(parsed.data.card, parsed.data.id), 201);
  } catch (error) { return localFailure(error); }
}
