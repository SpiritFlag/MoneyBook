import { ExpenseForm } from "@/components/expense-form";
import { parseDateQuery, todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "지출 기록 · 머니북" };
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <ExpenseForm date={parseDateQuery((await searchParams).date ?? null) ?? todayInSeoul()} />;
}
