import { z } from "zod";
import { operationInputSchema } from "@/lib/operations";
import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const createSchema = z.object({ id: z.string().uuid(), operation: operationInputSchema });
const updateSchema = createSchema.extend({ revision: z.number().int().positive() });
export async function GET(request: Request) { try { requireLocal(request); const expenseRepository = await authenticatedRepository(); return localJson(await expenseRepository.listOperations()); } catch (error) { return localFailure(error); } }
async function save(request: Request, update: boolean) {
  try {
    requireLocal(request);
    const expenseRepository = await authenticatedRepository();
    const parsed = (update ? updateSchema : createSchema).safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: parsed.error.issues[0].message }, 400);
    const value = parsed.data;
    const revision = "revision" in value && typeof value.revision === "number" ? value.revision : null;
    return localJson(await expenseRepository.saveOperation(value.operation, value.id, revision), update ? 200 : 201);
  } catch (error) { return localFailure(error); }
}
export async function POST(request: Request) { return save(request, false); }
export async function PUT(request: Request) { return save(request, true); }
