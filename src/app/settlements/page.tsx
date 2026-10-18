import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "정산·보험 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="settlements" today={todayInSeoul()} />; }
