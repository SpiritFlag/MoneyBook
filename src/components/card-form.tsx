"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useSWRConfig } from "swr";
import { Button } from "./ui/button";
import { Field } from "./form-fields";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { ledgerKey } from "@/lib/use-expenses";
import { operationsKey } from "@/lib/use-operations";
import { cardInputSchema, type Card } from "@/lib/card";
import { cardsKey, saveCard } from "@/lib/use-cards";
import { useAssets } from "@/lib/use-assets";
export function CardForm({ existing }: { existing?: Card }) {
  const [name, setName] = useState(existing?.name ?? ""), [issuer, setIssuer] = useState(existing?.issuer ?? "");
  const [kind, setKind] = useState<"credit" | "debit">(existing?.kind ?? "credit");
  const [assetId, setAssetId] = useState(existing?.assetId ?? "");
  const assets = useAssets();
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const requestId = useRef(existing?.id ?? ""), submitting = useRef(false);
  const { mutate } = useSWRConfig();
  const router = useRouter();
  useUnsavedChanges(dirty);
  return <><header className="mb-7"><Link href="/cards" className="text-sm text-muted-foreground">← 카드 관리로</Link><h1 className="mt-5 text-3xl font-bold">{existing ? "카드 수정" : "카드 추가"}</h1><p className="mt-3 text-sm text-muted-foreground">신용카드와 체크카드를 등록하고 결제 내역을 연결하세요.</p></header>
    <form className="book-sheet max-w-2xl rounded-3xl bg-card p-6 sm:p-8" onSubmit={async e => {
      e.preventDefault(); if (submitting.current) return;
      const parsed = cardInputSchema.safeParse({ name, issuer, kind, assetId: kind === "debit" ? assetId || null : null });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      if (kind === "debit" && !assetId) { setError("체크카드의 출금 계좌를 선택해 주세요."); return; }
      submitting.current = true; setBusy(true); setError("");
      requestId.current ||= crypto.randomUUID();
      try { await mutate(cardsKey, saveCard(requestId.current, parsed.data, existing?.revision), { revalidate: false }); if (existing) await Promise.all([mutate(ledgerKey), mutate(operationsKey)]); setDirty(false); router.push("/cards?registered=1"); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "카드를 등록하지 못했어요."); }
      finally { submitting.current = false; setBusy(false); }
    }}><fieldset disabled={busy} className="space-y-6"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><CreditCard aria-hidden="true" /></div>
    <Field label="카드 종류"><select className="form-control" value={kind} onChange={e => { setKind(e.target.value as "credit" | "debit"); setDirty(true); setError(""); }}><option value="credit">신용카드</option><option value="debit">체크카드</option></select></Field>
    <Field label="카드 이름" hint={existing ? "이름을 바꾸면 연결된 승인·명세서·자주 쓰는 거래에도 함께 반영돼요." : "같은 카드사의 여러 카드는 별명으로 구분해 주세요. 기존 거래와 같은 이름으로 등록하면 함께 조회돼요."}><input lang="ko" inputMode="text" autoFocus required maxLength={80} className="form-control" placeholder="예: 생활비 카드" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></Field>
    <Field label="카드사 (선택)"><input lang="ko" inputMode="text" maxLength={80} className="form-control" placeholder="예: 신한카드" value={issuer} onChange={e => { setIssuer(e.target.value); setDirty(true); }} /></Field>
    {kind === "debit" ? <Field label="출금 계좌" hint="이 카드로 결제하면 선택한 계좌의 원장에 전체 결제액을 반영해요."><select className="form-control" required disabled={!assets.data || !!assets.error} value={assetId} onChange={e => { setAssetId(e.target.value); setDirty(true); setError(""); }}><option value="">계좌 선택</option>{assets.data?.filter(a => a.kind === "account").map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select>{assets.error ? <button type="button" className="mt-2 text-sm text-destructive" onClick={() => void assets.mutate()}>계좌 목록 다시 불러오기</button> : null}<Link className="mt-2 inline-block text-sm text-primary" href="/assets/new">+ 출금 계좌 추가</Link></Field> : null}
    <p className="rounded-xl bg-background/70 p-4 text-xs leading-6 text-muted-foreground">카드번호·CVC는 입력하지 않아요. {kind === "debit" ? "체크카드는 결제일에 연결 계좌에서 바로 차감해요." : "신용카드 승인은 예금 잔액을 바로 줄이지 않고, 명세서의 실제 납부를 연결할 때 출금돼요."}{existing ? " 거래가 연결된 카드의 종류와 출금 계좌는 유지해 주세요." : ""}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<Button type="submit">{busy ? "저장 중…" : existing ? "수정 저장" : "카드 등록"}</Button></fieldset></form></>;
}
