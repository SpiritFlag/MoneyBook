import { CardActivityPage } from "@/components/card-activity";
import { todayInSeoul } from "@/lib/date";
export const metadata = { title: "카드 승인내역 · 머니북" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CardActivityPage id={(await params).id} today={todayInSeoul()} />;
}
