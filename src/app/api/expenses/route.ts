import { z } from "zod";
import { expenseInputSchema } from "@/lib/expense";
import { expenseRepository } from "@/lib/expense-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({ id: z.string().uuid(), expense: expenseInputSchema });
const updateSchema = z.object({ id: z.string().min(1).max(80), revision: z.number().int().positive(), expense: expenseInputSchema });
export async function GET(request: Request) {
  try { requireLocal(request); return localJson(await expenseRepository.list()); } catch (error) { return localFailure(error); }
}
async function mutate(request: Request, update: boolean) {
  try {
    const parsed = (update ? updateSchema : requestSchema).safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: parsed.error.issues[0].message }, 400);
    const value = parsed.data;
    const revision = "revision" in value && typeof value.revision === "number" ? value.revision : null;
    return localJson(await expenseRepository.save(value.expense, value.id, revision), update ? 200 : 201);
  } catch (error) { return localFailure(error); }
}
export async function POST(request: Request) { return mutate(request, false); }
export async function PUT(request: Request) { return mutate(request, true); }
