import { Suspense } from "react";
import { RecordPage } from "@/components/finance-book";
import { todayInSeoul } from "@/lib/date";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Suspense><RecordPage id={id} today={todayInSeoul()} edit /></Suspense>; }
