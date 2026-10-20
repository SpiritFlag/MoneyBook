"use client";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useCurrencies, currenciesKey } from "@/lib/use-currencies";
import { currencies as builtInCurrencies, currencyInfo, gameCurrencyInputSchema } from "@/lib/currency";
import { assetsKey } from "@/lib/use-assets";
import { Field } from "./form-fields";
import { Button } from "./ui/button";

export function GameCurrencies() {
  const currencies = useCurrencies();
  const { mutate } = useSWRConfig();
  const newCode = useRef("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="book-sheet mt-6 rounded-3xl bg-card p-6">
    <h2 className="text-lg font-semibold">게임 재화 관리</h2>
    <p className="mt-2 text-sm text-muted-foreground">게임 재화의 명칭·표시 약어·고정 환율을 수정해요. 명칭과 약어는 기존 거래에도 함께 표시되며, 거래 연결과 잔액은 유지돼요. 환율을 바꿔도 과거 소비의 원화액은 유지해요.</p>
    <div className="mt-4 flex flex-wrap gap-2">{[...new Set(["MCASH", "RC", ...(currencies.data ?? []).map(c => c.code)])].map(key => {
      const definition = currencies.data?.find(c => c.code === key);
      const info = currencyInfo(key, currencies.data);
      return <Button key={key} type="button" variant="secondary" disabled={busy || !currencies.data || !!currencies.error} aria-pressed={code === key} aria-label={`${info.label} 수정`} onClick={() => { setCode(key); setName(definition?.name ?? (Object.hasOwn(builtInCurrencies, key) ? builtInCurrencies[key as keyof typeof builtInCurrencies].label : key)); setUnit(info.unit); setRate(definition?.fixedRate ?? ""); setRevision(definition?.revision ?? null); setMessage(""); }}>{info.label} · {definition ? `${definition.fixedRate}원` : "환율 미정의"}</Button>;
    })}<Button type="button" variant="ghost" disabled={busy} onClick={() => { newCode.current = ""; setCode(""); setName(""); setUnit(""); setRate(""); setRevision(null); setMessage(""); }}>+ 새 게임 재화</Button></div>
    <form className="mt-5 grid items-end gap-4 sm:grid-cols-2" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const parsed = gameCurrencyInputSchema.safeParse({ code: code || (newCode.current ||= crypto.randomUUID()), name: name.trim(), unit: unit.trim(), fixedRate: rate });
      if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }
      setBusy(true); setMessage("");
      try {
        const response = await fetch(currenciesKey, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency: parsed.data, revision }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message ?? "저장하지 못했어요.");
        await mutate(currenciesKey, body, { revalidate: false }); await mutate(assetsKey);
        setCode(parsed.data.code); setRevision(body.find((c: {code:string}) => c.code === parsed.data.code).revision); setName(parsed.data.name!); setUnit(parsed.data.unit!); setMessage("게임 재화의 명칭·약어·고정 환율을 저장했어요.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했어요."); }
      finally { setBusy(false); }
    }}>
      <Field label="게임 재화 명칭"><input className="form-control" lang="ko" inputMode="text" value={name} disabled={busy} maxLength={60} placeholder="예: 게임명 골드" onChange={e => setName(e.target.value)} /></Field>
      <Field label="표시 약어" hint="금액 뒤에 붙는 단위예요. 예: M캐시, RC"><input className="form-control" lang="ko" inputMode="text" value={unit} disabled={busy} maxLength={20} placeholder="예: M캐시" onChange={e => setUnit(e.target.value)} /></Field>
      <Field label="고정 환율 · 1개당 원"><input className="form-control" inputMode="decimal" value={rate} disabled={busy} onChange={e => setRate(e.target.value)} /></Field>
      <p className="self-center text-sm text-muted-foreground">표시 예시 · 1,000 {unit || "약어"}{name ? ` (${name})` : ""}</p>
      <Button className="sm:col-span-2 sm:justify-self-end" disabled={busy || !currencies.data || !!currencies.error}>{busy ? "저장 중…" : code ? "게임 재화 수정 저장" : "새 게임 재화 등록"}</Button>
    </form>
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    {currencies.error ? <p role="alert" className="mt-3 text-sm text-destructive">재화를 불러오지 못했어요. 새로고침해 주세요.</p> : null}
  </section>;
}
