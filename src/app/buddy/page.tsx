import { BuddyReviews } from "@/components/buddy-reviews";
import { todayInBook } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "버디의 평가 · 머니북" };
export default function Page() { return <BuddyReviews initialMonth={todayInBook().slice(0, 7)} />; }
