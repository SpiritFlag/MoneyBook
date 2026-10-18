import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "이동·충전 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="transfers" today={todayInSeoul()} />; }
