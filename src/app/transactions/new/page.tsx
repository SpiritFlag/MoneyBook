import { ExpenseCreate } from "@/components/expense-create";
import { parseDateQuery, todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "지출 기록 · 머니북" };
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; asset?: string; template?: string; card?: string; recurring?: string; month?: string }> }) {
  const query = await searchParams;
  return <ExpenseCreate date={parseDateQuery(query.date ?? null) ?? todayInSeoul()} assetId={query.asset} templateId={query.template} cardId={query.card} recurringId={query.recurring} recurringMonth={query.month} />;
}
