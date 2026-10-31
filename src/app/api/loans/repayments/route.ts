import { z } from "zod";
import { loanPaymentInputSchema } from "@/lib/loan-payment";
import { loanPaymentMonthSchema } from "@/lib/monthly-loan-payments";
import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal, readLocalBody } from "@/lib/local-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const createSchema = z.object({ id: z.string().uuid(), payment: loanPaymentInputSchema });
const updateSchema = createSchema.extend({ revision: z.number().int().positive() });
export async function GET(request: Request) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const parsed = loanPaymentMonthSchema.safeParse(new URL(request.url).searchParams.get("month"));
    if (!parsed.success) return localJson({ message: "조회 월을 확인해 주세요." }, 400);
    return localJson(await repository.listMonthlyLoanPayments(parsed.data));
  } catch (error) { return localFailure(error); }
}
async function save(request: Request, update: boolean) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const parsed = (update ? updateSchema : createSchema).safeParse(await readLocalBody(request));
    if (!parsed.success) return localJson({ message: parsed.error.issues[0].message }, 400);
    const value = parsed.data;
    const revision = "revision" in value ? value.revision as number : null;
    return localJson(await repository.saveLoanPayment(value.payment, value.id, revision), update ? 200 : 201);
  } catch (error) { return localFailure(error); }
}
export async function POST(request: Request) { return save(request, false); }
export async function PUT(request: Request) { return save(request, true); }
