import { authenticatedRepository } from "@/lib/authenticated-repository";
import { localJson, localFailure, requireLocal } from "@/lib/local-api";
import { RepositoryError } from "@/lib/expense-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireLocal(request);
    const repository = await authenticatedRepository();
    const { id } = await params;
    const loan = (await repository.listLoans()).find(row => row.id === id);
    if (!loan) throw new RepositoryError("현재 계정에서 대출을 찾을 수 없어요.", 404);
    return localJson(loan);
  } catch (error) { return localFailure(error); }
}
