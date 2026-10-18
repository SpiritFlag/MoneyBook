import { Suspense } from "react";
import { RecordPage } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export const dynamic = "force-dynamic";
export default function Page() { return <Suspense><RecordPage today={todayInSeoul()} /></Suspense>; }
