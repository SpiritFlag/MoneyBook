import { FinanceBook } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "교통·하이패스 · 머니북" };
export const dynamic = "force-dynamic";
export default function Page() { return <FinanceBook section="transport" today={todayInSeoul()} />; }
