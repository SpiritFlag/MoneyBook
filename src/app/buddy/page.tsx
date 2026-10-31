import { BuddyReviews } from "@/components/buddy-reviews";
import { todayInBook } from "@/lib/date";
import { notFound } from "next/navigation";
import { features } from "@/lib/features";
export const dynamic = "force-dynamic";
export const metadata = { title: "버디의 평가 · 머니북" };
export default function Page() {
  if (!features.buddyReviews) notFound();
  return <BuddyReviews initialMonth={todayInBook().slice(0, 7)} />;
}
