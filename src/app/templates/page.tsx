import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "자주 쓰는 거래 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="templates" today={todayInSeoul()} />; }
