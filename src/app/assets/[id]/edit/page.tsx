import { AssetView } from "@/components/asset-view";
import { todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export const metadata = { title: "자산 정보·환율 수정 · 머니북" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <AssetView id={(await params).id} today={todayInSeoul()} edit />; }
