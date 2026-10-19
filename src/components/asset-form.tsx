"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Button } from "./ui/button";
import { Field, FormSection } from "./form-fields";
import { DemoNotice } from "./ledger-state";
import { currencies, formatMinor, type Currency } from "@/lib/expense";
import { assetKinds, assetInputSchema, newAsset, signedMinor, valueInWon, type Asset, type AssetInput } from "@/lib/asset";
import { assetsKey, saveAsset } from "@/lib/use-assets";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

export function AssetForm({ date, existing, linked = false }: { date: string; existing?: Asset; linked?: boolean }) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [value, setValue] = useState<AssetInput>(() => existing ? { ...existing } : newAsset(date));
  const [revision] = useState(existing?.revision);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const requestId = useRef(existing?.id ?? "");
  useUnsavedChanges(dirty);
  function field<K extends keyof AssetInput>(key: K, next: AssetInput[K]) { setValue((old) => ({ ...old, [key]: next })); setDirty(true); setError(""); }
  function cancel() { if (!dirty || window.confirm("입력한 내용을 버리고 돌아갈까요?")) router.push(existing ? `/assets/${existing.id}` : "/assets"); }
  const opening = value.openingBalance === null ? null : signedMinor(value.openingBalance, value.currency);
  const won = opening === null ? null : valueInWon(opening, value.currency, value.valuationRate);
  return <>
    <header className="mb-7"><Button variant="ghost" className="mb-3 -ml-3" onClick={cancel}>← 자산으로 돌아가기</Button><h1 className="text-3xl font-bold">{existing ? "자산 정보·환율 수정" : "자산 추가"}</h1><p className="mt-3 text-sm text-muted-foreground">보유한 단위 그대로 기록하고, 원화 가치를 함께 살펴보세요.</p></header>
    <form noValidate onSubmit={async (event) => {
      event.preventDefault(); if (submitting.current) return;
      const parsed = assetInputSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      submitting.current = true; setBusy(true); setError("");
      if (!requestId.current) requestId.current = crypto.randomUUID();
      try { await mutate(assetsKey, saveAsset(requestId.current, parsed.data, revision), { populateCache: true, revalidate: false }); setDirty(false); router.push(`/assets/${requestId.current}?saved=1`); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <FormSection number="01" title="자산의 이름과 단위">
            <Field label="자산 이름"><input lang="ko" inputMode="text" autoFocus className="form-control" maxLength={80} placeholder="예: 생활비 계좌, 달러 지갑" value={value.name} onChange={(e) => field("name", e.target.value)} /></Field>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="자산 종류"><select className="form-control" disabled={linked} value={value.kind} onChange={(e) => field("kind", e.target.value as AssetInput["kind"])}>{Object.entries(assetKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
              <Field label="자산 통화·재화"><select className="form-control" disabled={linked} value={value.currency} onChange={(e) => { field("currency", e.target.value as Currency); field("valuationRate", null); }}>{Object.entries(currencies).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}</select></Field>
            </div>
            {linked ? <p className="mt-3 text-xs text-muted-foreground">거래가 연결되어 있어 종류와 단위는 유지해요.</p> : null}
          </FormSection>
          <FormSection number="02" title="어디서부터 기록할까요?" description="기준일 시작 시점의 잔액이에요. 기준일 당일을 포함해 이후 결제 내역을 더하고 빼요.">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="잔액 기준일"><input type="date" className="form-control" min="1900-01-01" max="9999-12-31" value={value.openingDate} onChange={(e) => field("openingDate", e.target.value)} /></Field><Field label={`기준잔액 (${currencies[value.currency].unit})`} hint="모르면 비워 두세요. 확인된 0과 구분해요."><input className="form-control" inputMode="decimal" placeholder="잔액 미확인" value={value.openingBalance ?? ""} onChange={(e) => field("openingBalance", e.target.value === "" ? null : e.target.value)} /></Field></div>
            {existing ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">기준일·기준잔액을 수정하면 이후 원장 잔액을 다시 계산해요. 거래의 결제액은 바뀌지 않아요.</p> : null}
          </FormSection>
          <FormSection number="03" title="현재 원화 평가" description="현재 보유량의 가치에만 적용해요. 지출에 확정한 원화 금액은 바꾸지 않아요.">
            {value.currency === "KRW" ? <p className="rounded-xl bg-secondary/50 p-4 text-sm text-primary">원화 자산은 1원 = 1원으로 평가해요.</p> : <div className="grid gap-4 sm:grid-cols-2"><Field label={`평가 환율 · 1 ${currencies[value.currency].unit}당 원`} hint="예: 1 USD = 1,400원이면 1400. 미확정이면 비워 두세요."><input className="form-control" inputMode="decimal" placeholder="직접 입력" value={value.valuationRate ?? ""} onChange={(e) => field("valuationRate", e.target.value === "" ? null : e.target.value)} /></Field><Field label="환율 기준일"><input className="form-control" type="date" min="1900-01-01" max="9999-12-31" value={value.rateDate} onChange={(e) => field("rateDate", e.target.value)} /></Field></div>}
          </FormSection>
          <FormSection number="04" title="메모"><Field label="자산 메모 (선택)"><textarea lang="ko" inputMode="text" className="form-control min-h-24" maxLength={1000} value={value.memo} onChange={(e) => field("memo", e.target.value)} placeholder="자산을 구분하는 데 필요한 내용을 남겨보세요." /></Field></FormSection>
        </div>
        <aside className="xl:sticky xl:top-7 xl:self-start"><div className="daily-summary rounded-3xl p-6"><p className="text-xs text-muted-foreground">시작할 기준잔액</p><p className="mt-3 break-words text-2xl font-bold text-primary">{opening === null ? "잔액 미확인" : formatMinor(opening, value.currency)}</p><p className="mt-4 text-sm">{won === null ? "원화 평가 미확정" : `기준잔액 평가 ${formatMinor(won, "KRW")}`}</p><p className="mt-4 text-xs leading-6 text-muted-foreground">잔액을 모르면 기준일 이후의 순변동만 보여줘요. 신용카드 승인과 자동 연동되는 은행 잔액은 별도로 다뤄요.</p></div>
          {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="mt-5 w-full">{busy ? "저장 중…" : existing ? "자산 정보 저장" : "자산 추가하고 원장 보기"}</Button><Button type="button" variant="ghost" className="mt-2 w-full" onClick={cancel}>취소</Button>
        </aside>
      </fieldset>
    </form><DemoNotice />
  </>;
}
