import { z } from "zod";
import { gameCurrencyInputSchema } from "@/lib/currency";
import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { requireLocal(request); return localJson(await (await authenticatedRepository()).listGameCurrencies()); }
  catch (error) { return localFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireLocal(request);
    const repo = await authenticatedRepository();
    const body = z.object({ currency: gameCurrencyInputSchema, revision: z.number().int().positive().nullable() }).parse(await readLocalBody(request));
    return localJson(await repo.saveGameCurrency(body.currency, body.revision));
  } catch (error) { return localFailure(error); }
}
