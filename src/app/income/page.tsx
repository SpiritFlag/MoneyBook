import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "수입·입금 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="income" today={todayInSeoul()} />; }
