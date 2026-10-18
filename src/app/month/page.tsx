import { MonthlyBook } from "@/components/monthly-book";
import { todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "월간 소비 · 머니북" };
export default function Page() { return <MonthlyBook initialMonth={todayInSeoul().slice(0, 7)} />; }
