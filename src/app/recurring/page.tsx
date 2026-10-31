import { RecurringTransactions } from "@/components/recurring-transactions";
import { todayInSeoul } from "@/lib/date";
import { validMonth } from "@/lib/recurring";

export const dynamic = "force-dynamic";
export const metadata = { title: "반복 거래 관리 · 머니북" };
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <RecurringTransactions initialMonth={month && validMonth(month) ? month : todayInSeoul().slice(0, 7)} />;
}
