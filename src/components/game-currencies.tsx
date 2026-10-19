"use client";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { useCurrencies, currenciesKey } from "@/lib/use-currencies";
import { currencyInfo, gameCurrencyInputSchema } from "@/lib/currency";
import { assetsKey } from "@/lib/use-assets";
import { Field } from "./form-fields";
import { Button } from "./ui/button";

export function GameCurrencies() {
  const currencies = useCurrencies();
  const { mutate } = useSWRConfig();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="book-sheet mt-6 rounded-3xl bg-card p-6">
    <h2 className="text-lg font-semibold">게임 재화와 고정 환율</h2>
    <p className="mt-2 text-sm text-muted-foreground">재화를 한 번 정의하면 자산과 지출에서 함께 사용해요. 수량은 정수, 환율은 재화 1개당 원화예요. 환율을 수정하면 같은 재화의 자산 평가가 함께 바뀌며 과거 소비는 유지돼요.</p>
    <div className="mt-4 flex flex-wrap gap-2">{[...new Set(["MCASH", "RC", ...(currencies.data ?? []).map(c => c.code)])].map(key => {
      const definition = currencies.data?.find(c => c.code === key);
      return <Button key={key} type="button" variant="secondary" onClick={() => { setCode(key); setName(currencyInfo(key).unit); setRate(definition?.fixedRate ?? ""); setRevision(definition?.revision ?? null); setMessage(""); }}>{currencyInfo(key).unit} · {definition ? `${definition.fixedRate}원` : "환율 미정의"}</Button>;
    })}<Button type="button" variant="ghost" onClick={() => { setCode(""); setName(""); setRate(""); setRevision(null); setMessage(""); }}>+ 새 게임 재화</Button></div>
    <form className="mt-5 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const parsed = gameCurrencyInputSchema.safeParse({ code: code || name.trim(), fixedRate: rate });
      if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }
      setBusy(true); setMessage("");
      try {
        const response = await fetch(currenciesKey, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency: parsed.data, revision }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message ?? "저장하지 못했어요.");
        await mutate(currenciesKey, body, { revalidate: false }); await mutate(assetsKey);
        setCode(parsed.data.code); setRevision(body.find((c: {code:string}) => c.code === parsed.data.code).revision); setMessage("재화 정의를 저장했어요.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했어요."); }
      finally { setBusy(false); }
    }}>
      <Field label="게임 재화 이름"><input className="form-control" lang="ko" inputMode="text" value={name} disabled={busy || !!code} maxLength={37} placeholder="예: 게임명 골드" onChange={e => setName(e.target.value)} /></Field>
      <Field label="고정 환율 · 1개당 원"><input className="form-control" inputMode="decimal" value={rate} disabled={busy} onChange={e => setRate(e.target.value)} /></Field>
      <Button disabled={busy || !currencies.data || !!currencies.error}>{busy ? "저장 중…" : "재화 정의 저장"}</Button>
    </form>
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    {currencies.error ? <p role="alert" className="mt-3 text-sm text-destructive">재화를 불러오지 못했어요. 새로고침해 주세요.</p> : null}
  </section>;
}
