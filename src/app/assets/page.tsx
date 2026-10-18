import { AssetOverview } from "@/components/asset-overview";
import { todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "자산 현황 · 머니북" };
export default function Page() { return <AssetOverview today={todayInSeoul()} />; }
