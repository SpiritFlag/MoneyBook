import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal } from "@/lib/local-api";
import { loanSummary } from "@/lib/loan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    return localJson((await repository.listLoans()).map(loanSummary));
  } catch (error) { return localFailure(error); }
}
