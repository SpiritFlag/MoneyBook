"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { TimeInput } from "./time-input";
import { bookDate } from "@/lib/date";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Save } from "lucide-react";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { DemoNotice } from "@/components/ledger-state";
import { Field, FormSection } from "@/components/form-fields";
import { ReceiptEditor } from "@/components/receipt-editor";
import { ReceiptSummary } from "@/components/receipt-summary";
import { changeExpenseDate, followsPaymentDate, categories, expenseInputSchema, formatMoney, formatMinor, newExpense, ownKrw, ownMinor, toMinor, type Currency, type Expense, type ExpenseInput } from "@/lib/expense";
import { useCards } from "@/lib/use-cards";
import Link from "next/link";
import { useAssets } from "@/lib/use-assets";
import { valueInWon, type Asset } from "@/lib/asset";
import { ExpenseConnections } from "./expense-connections";
import { TopupEditor } from "./topup-editor";
import { operationsKey } from "@/lib/use-operations";
import { ledgerKey, saveExpense } from "@/lib/use-expenses";

export function ExpenseForm({ date, existing, initialAsset, initialDraft }: { date: string; existing?: Expense; initialAsset?: Asset; initialDraft?: ExpenseInput }) {
  const currencyDefinitions = useCurrencies();
  const currencies = currencyDefinitions.options;
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const assets = useAssets();
  const cards = useCards();
  const [value, setValue] = useState<ExpenseInput>(() => existing ? structuredClone(existing) : initialDraft ? structuredClone(initialDraft) : initialAsset ? { ...newExpense(date), assetId: initialAsset.id, paymentKind: initialAsset.kind, paymentMethod: initialAsset.name, currency: initialAsset.currency, receiptCurrency: initialAsset.currency } : newExpense(date));
  const [revision] = useState(existing?.revision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const requestId = useRef(existing?.id ?? "");
  const errorRef = useRef<HTMLDivElement>(null);
  function change(next: ExpenseInput) {
    const definition = currencyDefinitions.data?.find(c => c.code === next.currency);
    if (definition) {
      const amount = toMinor(next.paidAmount, next.currency);
      const won = amount === null ? null : valueInWon(amount, next.currency, definition.fixedRate);
      next = { ...next, krwAmount: won === null ? null : String(won), valuationRate: definition.fixedRate, valuationSource: "재화 고정 환율" };
    }
    setValue(next); setDirty(true); setError(""); }
  function field<K extends keyof ExpenseInput>(key: K, next: ExpenseInput[K]) { change((key === "paymentDate" || key === "useDate") && typeof next === "string" ? changeExpenseDate(value, key, next) : { ...value, [key]: next }); }
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const guardLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link && !link.getAttribute("href")?.startsWith("#") && !window.confirm("저장하지 않은 입력이 있어요. 입력을 버리고 이동할까요?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [dirty]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function cancel() {
    if (!dirty || window.confirm("저장하지 않은 입력이 있어요. 입력을 버리고 돌아갈까요?")) router.push(existing ? `/transactions/${existing.id}` : `/?date=${date}`);
  }
  const card = value.paymentKind === "card";
  const fixedCurrency = currencyDefinitions.data?.find(c => c.code === value.currency);
  const personalKrw = ownKrw(value);
  return <>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><Button type="button" variant="ghost" size="sm" className="mb-3 -ml-3 text-muted-foreground" onClick={cancel}><ArrowLeft size={16} />{existing ? "상세로 돌아가기" : "일일 내역으로"}</Button><h1 className="text-3xl font-bold tracking-tight">{existing ? "지출 수정" : "지출 기록"}</h1><p className="mt-2 text-sm text-muted-foreground">결제한 총액부터, 기억나는 이야기까지.</p></div><span className="demo-badge">나의 장부</span></header>
    <form noValidate onSubmit={async (event) => {
      event.preventDefault();
      if (submitting.current) return;
      const parsed = expenseInputSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).filter((message, index, all) => all.indexOf(message) === index).slice(0, 4).join(" ")); return; }
      submitting.current = true; setBusy(true); setError("");
      if (!requestId.current) requestId.current = crypto.randomUUID();
      try {
        await mutate(ledgerKey, saveExpense(requestId.current, parsed.data, revision), { revalidate: false, populateCache: true });
        await mutate(operationsKey);
        setDirty(false);
        router.push(`/transactions/${requestId.current}?saved=1`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <FormSection number="01" title="실제 결제">
            <div className="mb-6 flex flex-wrap gap-2">{(["once", "period"] as const).map((kind) => <Button type="button" key={kind} variant={value.useKind === kind ? "secondary" : "ghost"} aria-pressed={value.useKind === kind} onClick={() => field("useKind", kind)}>{value.useKind === kind ? <Check size={14} /> : null}{kind === "once" ? "일회성 이용" : "기간형 이용"}</Button>)}</div>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field label={card ? "카드 승인금액" : "실제 결제 총액"} hint="명세를 바꿔도 이 금액은 자동으로 바뀌지 않아요."><input autoFocus className="form-control amount-input" inputMode="decimal" value={value.paidAmount} placeholder="0" onChange={(e) => field("paidAmount", e.target.value)} /></Field>
              <Field label="결제 통화·재화"><select className="form-control" value={value.currency} onChange={(e) => { const currency = e.target.value as Currency; change({ ...value, currency, assetId: null, topup: null, krwAmount: null, valuationRate: null, valuationSource: null, paymentMethod: value.assetId ? "" : value.paymentMethod, receiptCurrency: value.receiptCurrency === value.currency ? currency : value.receiptCurrency }); }}>{Object.entries(currencies).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></Field>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_10rem]"><Field label="거래명"><input lang="ko" inputMode="text" className="form-control" maxLength={120} placeholder="어디에 쓴 돈인가요?" value={value.title} onChange={(e) => field("title", e.target.value)} /></Field><Field label="카테고리"><select className="form-control" value={value.category} onChange={(e) => field("category", e.target.value as ExpenseInput["category"])}>{Object.entries(categories).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></Field></div>
          </FormSection>
          <FormSection number="02" title="상품과 명세" description="확인한 내용만 채워도 괜찮아요. 할인은 해당 상품 아래에, 전체 할인·가산은 따로 기록해요."><ReceiptEditor value={value} onChange={change} /></FormSection>
          <FormSection number="03" title="결제수단과 날짜">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="결제 방식"><select className="form-control" value={value.paymentKind} onChange={(e) => change({ ...value, paymentKind: e.target.value as ExpenseInput["paymentKind"], assetId: null, topup: null, paymentMethod: value.assetId ? "" : value.paymentMethod })}><option value="card">신용카드 승인</option><option value="account">계좌·체크카드</option><option value="cash">현금</option><option value="stored">충전 잔액·재화</option></select></Field>
              <Field label={card ? "카드 이름" : "사용 자산"} hint={card ? "신용카드 승인은 자산에서 즉시 출금하지 않아요." : "같은 종류·통화의 자산을 선택하면 원장에 전체 결제액을 반영해요."}>
                {card ? <><select className="form-control" disabled={!cards.data || !!cards.error} value={value.paymentMethod} onChange={e => field("paymentMethod", e.target.value)}><option value="">신용카드 선택</option>{value.paymentMethod && !cards.data?.some(c => c.name === value.paymentMethod) ? <option value={value.paymentMethod}>{value.paymentMethod} · 기존 기록</option> : null}{cards.data?.map(c => <option key={c.id} value={c.name}>{c.name}{c.issuer ? ` · ${c.issuer}` : ""}</option>)}</select>{cards.error ? <button type="button" className="mt-2 text-xs text-red-700" onClick={() => void cards.mutate()}>카드 목록을 불러오지 못했어요 · 다시 시도</button> : null}<Link href="/cards/new" className="mt-2 inline-block text-xs font-medium text-primary">+ 신용카드 추가</Link></> : <select className="form-control" disabled={!assets.data || !!assets.error} value={value.assetId ?? ""} onChange={(e) => { const asset = assets.data?.find((a) => a.id === e.target.value); change({ ...value, assetId: asset?.id ?? null, topup: null, paymentMethod: asset?.name ?? "" }); }}><option value="">자산 연결 없이 기록</option>{(assets.data ?? []).filter((asset) => asset.kind === value.paymentKind && asset.currency === value.currency).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>}
              </Field>
              {!card && !value.assetId ? <Field label="결제수단 이름" hint="자산을 연결하지 않으면 잔액과 원장에는 반영되지 않아요."><input lang="ko" inputMode="text" className="form-control" placeholder="예: 예시 계좌" value={value.paymentMethod} onChange={(e) => field("paymentMethod", e.target.value)} /></Field> : null}
              {!card && assets.error ? <p role="alert" className="text-sm text-destructive">자산을 불러오지 못했어요. <button type="button" className="underline" onClick={() => { void assets.mutate(); }}>다시 불러오기</button></p> : null}
              <Field label={card ? "승인일" : "결제일"}><input className="form-control" type="date" min="1900-01-01" max="9999-12-31" value={value.paymentDate} onChange={(e) => field("paymentDate", e.target.value)} /></Field>
              <Field label={card ? "승인 시각 (선택)" : "결제 시각 (선택)"} hint="모르면 비워 두세요. 시각 미확인으로 남겨요."><TimeInput value={value.time} onChange={time => field("time", time)} /></Field>
              <Field label={value.useKind === "period" ? "이용 시작일" : "이용일"} hint={followsPaymentDate(value) ? "결제일을 따라가요. 직접 바꾸면 별도 이용일로 유지돼요." : "직접 지정한 이용일이에요. 결제일을 바꿔도 유지돼요."}><input className="form-control" type="date" min="1900-01-01" max="9999-12-31" value={value.useDate} onChange={(e) => field("useDate", e.target.value)} /></Field>
              <Field label={value.useKind === "period" ? "이용 시작 시각 (선택)" : "이용 시각 (선택)"} hint="일일 내역을 정렬할 시각이에요. 모르면 비워 두세요."><TimeInput value={value.useTime} onChange={time => field("useTime", time)} /></Field>
              {value.useKind === "period" ? <Field label="이용 종료일"><input className="form-control" type="date" min={value.useDate} max="9999-12-31" value={value.useEnd ?? ""} onChange={(e) => field("useEnd", e.target.value || null)} /></Field> : <div className="flex items-end"><Button type="button" variant="ghost" className="text-primary" onClick={() => change({ ...value, useDate: value.paymentDate, useDateFollowsPayment: true })}>결제일과 같게 · 자동 연결</Button></div>}
            </div>
            {value.useKind === "period" ? <div className="mt-5"><Field label="월간 소비 반영"><select className="form-control" value={value.allocation} onChange={(e) => field("allocation", e.target.value as ExpenseInput["allocation"])}><option value="start">시작월에 전액</option><option value="annual">연간 결제 · 12개월 배분</option></select></Field><p className="mt-3 text-xs leading-5 text-muted-foreground">기간형은 일일 소비에 더하지 않고 월간 정기지출에 반영해요. 연간 배분의 원 단위 나머지는 첫 달에 더해요.</p></div> : null}
          </FormSection>
          {!card && assets.data ? <TopupEditor value={value} change={change} assets={assets.data} cards={cards.data ?? []} fixedRate={fixedCurrency?.fixedRate} /> : null}
          <FormSection number="04" title="내가 부담한 금액">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.shared} onChange={(e) => change({ ...value, shared: e.target.checked, ownAmount: e.target.checked ? value.ownAmount ?? (value.paidAmount || "0") : null })} />다른 사람과 비용을 나눴어요</label>
            {value.shared ? <div className="mt-4"><Field label="본인 부담액" hint="결제 전체액은 유지하고 내 몫만 소비로 반영해요."><input className="form-control" inputMode="decimal" value={value.ownAmount ?? ""} onChange={(e) => field("ownAmount", e.target.value)} /></Field></div> : null}
            {fixedCurrency ? <p className="mt-5 rounded-xl bg-secondary/50 p-4 text-sm">재화 고정 환율 · 1 {value.currency} = {fixedCurrency.fixedRate}원 · 원화 소비는 자동 계산해요.</p> : value.currency !== "KRW" ? <div className="mt-5"><Field label={card ? "확정 원화 청구액 (선택)" : "확정 원화 평가액 (선택)"} hint="실제 결제 전체액의 원화 금액이에요. 모르면 비워 두고 나중에 수정하세요. 임의 환율로 합산하지 않아요."><input className="form-control" inputMode="numeric" value={value.krwAmount ?? ""} placeholder="원화 미확정" onChange={(e) => field("krwAmount", e.target.value || null)} /></Field></div> : null}
          </FormSection>
          <ExpenseConnections value={value} change={change} id={existing?.id} />
          <FormSection number="05" title="메모"><Field label="기억해 둘 내용 (선택)"><textarea lang="ko" inputMode="text" className="form-control min-h-24 resize-y" maxLength={2000} placeholder="영수증에서 확인할 내용이나 거래의 맥락을 남겨보세요." value={value.memo} onChange={(e) => field("memo", e.target.value)} /></Field></FormSection>
        </div>
        <aside className="min-w-0 xl:sticky xl:top-7 xl:self-start">
          <div className="daily-summary rounded-3xl p-6"><h2 className="text-sm font-semibold">저장 전 확인</h2><dl className="mt-5 space-y-4"><div><dt className="text-xs text-muted-foreground">실제 결제</dt><dd className="mt-1 break-words text-2xl font-semibold tabular-nums">{formatMoney(value.paidAmount || "0", value.currency)}</dd></div><div><dt className="text-xs text-muted-foreground">내 소비</dt><dd className="mt-1 break-words text-xl font-semibold text-primary tabular-nums">{formatMinor(ownMinor(value), value.currency)}</dd></div></dl>{value.currency !== "KRW" ? <p className="mt-3 text-xs text-muted-foreground">{personalKrw === null ? "원화 미확정 · 원화 합계에서 분리" : `원화 소비 ${formatMinor(personalKrw, "KRW")}`}</p> : null}<p className="mt-4 text-xs leading-5 text-muted-foreground">{value.useKind === "period" ? "월간 정기지출에 반영" : `${value.useDate ? bookDate(value.useDate, value.useTime) : "이용일 미입력"} 소비에 반영 · 05시 기준`}</p></div>
          <div className="mt-4"><ReceiptSummary expense={value} /></div>
          <div ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className={error ? "mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-destructive" : ""}>{error}</div>
          <Button type="submit" size="lg" disabled={busy} className="mt-5 w-full"><Save size={16} />{busy ? "저장 중…" : existing ? "수정 저장" : "저장하고 상세 보기"}</Button>
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={cancel}>취소</Button>
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">로그인한 계정의 장부에 저장돼요.</p>
        </aside>
      </fieldset>
    </form>
    <DemoNotice />
  </>;
}
