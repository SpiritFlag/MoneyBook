"use client";
import { Button } from "@/components/ui/button";

export function LedgerState({ error, retry }: { error?: Error; retry: () => void }) {
  return <div className="book-sheet rounded-3xl bg-card p-10 text-center" role={error ? "alert" : "status"}>
    <p className="font-medium">{error ? "장부를 불러오지 못했어요" : "장부를 펼치는 중이에요…"}</p>
    {error ? <><p className="mt-3 text-sm text-muted-foreground">{error.message}</p><Button className="mt-5" onClick={retry}>다시 불러오기</Button></> : null}
  </div>;
}
export function DemoNotice() {
  return <p className="mt-6 px-1 text-xs leading-6 text-muted-foreground">로그인한 계정의 장부를 클라우드에 저장해요. 저장을 마친 기록은 같은 계정으로 다시 확인할 수 있어요.</p>;
}
