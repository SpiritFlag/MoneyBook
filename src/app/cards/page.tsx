import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "카드 관리 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="cards" today={todayInSeoul()} />; }
