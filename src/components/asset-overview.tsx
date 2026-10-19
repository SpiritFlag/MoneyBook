"use client";
import { GameCurrencies } from "./game-currencies";
import Link from "next/link";
import { useState } from "react";
import { Wallet, ArrowUpRight, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { DemoNotice, LedgerState } from "./ledger-state";
import { useAssets } from "@/lib/use-assets";
import { useOperations } from "@/lib/use-operations";
import { operationPostings } from "@/lib/operations";
import { useExpenses } from "@/lib/use-expenses";
import { assetKinds, assetPosition } from "@/lib/asset";
import { currencyInfo, formatMinor } from "@/lib/expense";
import { parseDateQuery } from "@/lib/date";

export function AssetOverview({ today }: { today: string }) {
  const assets = useAssets();
  const expenses = useExpenses(); const operations = useOperations();
  const [date, setDate] = useState(today);
  const positions = (assets.data ?? []).map((asset) => ({ asset, position: assetPosition(asset, expenses.data ?? [], date, operationPostings(operations.data ?? [], assets.data ?? [])) }));
  const ready = !!assets.data && !!expenses.data && !!operations.data;
  const total = positions.reduce((sum, { position }) => sum + (position.won ?? 0), 0);
  const unknown = positions.filter(({ position }) => position.won === null).length;
  const error = assets.error ?? expenses.error ?? operations.error;
  return <>
    <header className="mb-7 flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-widest text-primary">내 돈이 머무는 곳</p><h1 className="text-3xl font-bold">자산 현황</h1><p className="mt-3 text-sm text-muted-foreground">원래 단위의 잔액과 원화 가치를 함께 확인하세요.</p></div><Button asChild><Link href="/assets/new"><Plus size={16} />자산 추가</Link></Button></header>
    <section className="daily-summary book-sheet mb-6 rounded-3xl p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs text-muted-foreground">등록 자산의 원화 평가 합계</p><p className="mt-3 text-4xl font-bold text-primary tabular-nums">{ready && !error ? formatMinor(total, "KRW") : "—"}</p>{unknown > 0 && ready ? <p className="mt-3 text-sm text-amber-800">잔액·평가 미확정 {unknown}개 자산은 합계에서 제외</p> : null}</div><label className="grid gap-2 text-xs text-muted-foreground">잔액 조회일<input type="date" className="form-control" min="1900-01-01" max="9999-12-31" value={date} onChange={(e) => { if (parseDateQuery(e.target.value)) setDate(e.target.value); }} /></label></div><p className="mt-5 text-xs leading-6 text-muted-foreground">조회일까지 기록한 잔액에 각 자산의 현재 입력 환율을 적용해요. 과거 환율 조회나 전체 순자산(부채 포함) 합계는 아니에요.</p></section>
    {!ready || error ? <LedgerState error={error} retry={() => { void assets.mutate(); void expenses.mutate(); void operations.mutate(); }} /> : positions.length ? <div className="grid gap-4 lg:grid-cols-2">{positions.map(({ asset, position }) => <Link key={asset.id} href={`/assets/${asset.id}`} className="transaction-link book-sheet rounded-3xl bg-card p-6"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-secondary/60 p-3 text-primary"><Wallet size={20} /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{assetKinds[asset.kind]} · {currencyInfo(asset.currency).unit}</p><h2 className="mt-1 break-words text-lg font-semibold">{asset.name}</h2></div></div><ArrowUpRight size={18} className="shrink-0 text-primary/60" /></div><p className="mt-6 break-words text-2xl font-semibold tabular-nums">{position.balance === null ? "잔액 미확인" : formatMinor(position.balance, asset.currency)}</p><p className="mt-2 text-sm text-muted-foreground">{position.won === null ? "원화 평가 미확정" : `원화 평가 ${formatMinor(position.won, "KRW")}`}</p>{position.balance === null ? <p className="mt-2 text-xs text-muted-foreground">{position.effective ? `기준일 이후 순변동 ${formatMinor(position.net, asset.currency)}` : "잔액 기준일 이전이에요."}</p> : null}<p className="mt-5 text-xs text-primary">{asset.currency === "KRW" ? "원화 자산" : asset.valuationRate === null ? "환율 입력 필요" : `1 ${currencyInfo(asset.currency).unit} = ${asset.valuationRate}원 · ${asset.rateDate}`}</p></Link>)}</div> : <div className="book-sheet rounded-3xl bg-card px-6 py-16 text-center"><Wallet className="mx-auto mb-4 text-primary" size={32} /><h2 className="text-lg font-semibold">첫 자산을 등록해 보세요</h2><p className="mt-3 text-sm text-muted-foreground">계좌, 현금, 외화 지갑, 게임 재화를 같은 방식으로 관리해요.</p><Button asChild className="mt-6"><Link href="/assets/new">자산 추가하기</Link></Button></div>}
    <GameCurrencies />
    <DemoNotice />
  </>;
}
