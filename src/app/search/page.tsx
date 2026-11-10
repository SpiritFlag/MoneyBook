import { Suspense } from "react";
import { RecordSearch } from "@/components/record-search";

export const metadata = { title: "내역 검색 · 머니북" };
export default function Page() {
  return <Suspense fallback={<p role="status">검색 화면을 여는 중이에요…</p>}><RecordSearch /></Suspense>;
}
