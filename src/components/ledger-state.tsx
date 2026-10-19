"use client";
import { Button } from "@/components/ui/button";

export function LedgerState({ error, retry }: { error?: Error; retry: () => void }) {
  return <div className="book-sheet rounded-3xl bg-card p-10 text-center" role={error ? "alert" : "status"}>
    <p className="font-medium">{error ? "장부를 불러오지 못했어요" : "장부를 펼치는 중이에요…"}</p>
    {error ? <><p className="mt-3 text-sm text-muted-foreground">{error.message}</p><Button className="mt-5" onClick={retry}>다시 불러오기</Button></> : null}
  </div>;
}
export function DemoNotice() {
  return <p className="mt-6 px-1 text-xs leading-6 text-muted-foreground">로그인한 계정의 장부를 이 PC에 저장해요. 클라우드 저장 연결 전이라 다른 기기와 동기화되지 않아요.</p>;
}
