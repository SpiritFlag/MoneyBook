import { MonthlyLoanPaymentBook } from "@/components/monthly-loan-payments";
import { loanPaymentMonthSchema } from "@/lib/monthly-loan-payments";
import { todayInSeoul } from "@/lib/date";

export const metadata = { title: "원리금 납입 · 머니북" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const parsed = loanPaymentMonthSchema.safeParse((await searchParams).month);
  return <MonthlyLoanPaymentBook key={parsed.success ? parsed.data : todayInSeoul().slice(0, 7)} initialMonth={parsed.success ? parsed.data : todayInSeoul().slice(0, 7)} />;
}
