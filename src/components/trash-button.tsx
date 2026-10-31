"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useSWRConfig } from "swr";
import { changeTrash, trashAffectedKeys } from "@/lib/use-trash";
import { Button } from "./ui/button";

export function TrashButton({ kind, id, revision, title }: { kind: "expense" | "operation"; id: string; revision: number; title: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try {
      await changeTrash("DELETE", { kind, id, revision });
      await Promise.allSettled(trashAffectedKeys.map(key => mutate(key)));
      await mutate(key => typeof key === "string" && key.startsWith("/api/loans/"));
      router.push("/trash");
    } catch (error) { setError(error instanceof Error ? error.message : "삭제하지 못했어요."); setBusy(false); }
  }
  return <div className="w-full border-t border-border/70 pt-6">
    {confirming ? <div className="rounded-2xl bg-secondary/50 p-5">
      <p className="font-medium">‘{title}’을 휴지통으로 옮길까요?</p>
      <p className="mt-2 text-sm text-muted-foreground">목록·소비 합계·자산 원장에서 제외돼요. 연결해 입력한 충전도 함께 옮기며, 30일 동안 복원할 수 있어요. 이후에는 완전히 삭제돼요.</p>
      <div className="mt-4 flex gap-2"><Button disabled={busy} onClick={remove}>{busy ? "옮기는 중…" : "휴지통으로 이동"}</Button><Button variant="secondary" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>돌아가기</Button></div>
    </div> : <Button variant="secondary" onClick={() => setConfirming(true)}><Trash2 size={16} />거래 삭제</Button>}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </div>;
}
