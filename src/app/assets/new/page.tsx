import { AssetForm } from "@/components/asset-form";
import { todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "자산 추가 · 머니북" };
export default function Page() { return <AssetForm date={todayInSeoul()} />; }
