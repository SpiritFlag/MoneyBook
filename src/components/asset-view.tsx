"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { AssetForm } from "./asset-form";
import { DemoNotice, LedgerState } from "./ledger-state";
import { useAssets } from "@/lib/use-assets";
import { useOperations } from "@/lib/use-operations";
import { operationPostings } from "@/lib/operations";
import { useExpenses } from "@/lib/use-expenses";
import { assetKinds, assetPosition, assetLedger, signedMinor } from "@/lib/asset";
import { currencies, formatMinor } from "@/lib/expense";

export function AssetView({ id, today, edit = false }: { id: string; today: string; edit?: boolean }) {
  const assets = useAssets(); const expenses = useExpenses(); const operations = useOperations(); const query = useSearchParams();
  const error = assets.error ?? expenses.error ?? operations.error;
  if (!assets.data || !expenses.data || !operations.data || error) return <LedgerState error={error} retry={() => { void assets.mutate(); void expenses.mutate(); void operations.mutate(); }} />;
  const asset = assets.data.find((entry) => entry.id === id);
  if (!asset) return <div className="rounded-3xl bg-card p-10"><h1 className="text-xl font-bold">자산을 찾을 수 없어요</h1><Link href="/assets" className="mt-4 block text-primary">자산 현황으로</Link></div>;
  const rows = assetLedger(asset, expenses.data, operationPostings(operations.data, assets.data));
  if (edit) return <AssetForm key={id} date={today} existing={asset} linked={rows.length > 0} />;
  const position = assetPosition(asset, expenses.data, today, operationPostings(operations.data, assets.data));
  const opening = asset.openingBalance === null ? null : signedMinor(asset.openingBalance, asset.currency);
  return <>
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href="/assets" className="text-sm text-muted-foreground hover:text-primary">← 자산 현황으로</Link><Button asChild variant="secondary"><Link href={`/assets/${id}/edit`}>자산 정보·환율 수정</Link></Button></header>
    {query.get("saved") === "1" ? <p role="status" className="mb-4 rounded-xl bg-secondary px-5 py-3 text-sm text-primary">자산을 저장했어요.</p> : null}
    <article className="book-sheet overflow-hidden rounded-3xl bg-card"><header className="daily-summary p-6 sm:p-8"><p className="text-xs text-primary">{assetKinds[asset.kind]} · {currencies[asset.currency].unit}</p><h1 className="mt-2 break-words text-3xl font-bold">{asset.name}</h1><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">{today}까지 기록된 잔액</p><p className="mt-2 break-words text-3xl font-bold text-primary tabular-nums">{position.balance === null ? "잔액 미확인" : formatMinor(position.balance, asset.currency)}</p><p className="mt-2 text-sm text-muted-foreground">기준일 이후 순변동 {formatMinor(position.net, asset.currency)}</p></div><div><p className="text-xs text-muted-foreground">현재 입력 환율로 평가</p><p className="mt-2 text-2xl font-semibold tabular-nums">{position.won === null ? "원화 평가 미확정" : formatMinor(position.won, "KRW")}</p><p className="mt-2 text-xs text-muted-foreground">{asset.currency === "KRW" ? "1원 = 1원" : asset.valuationRate === null ? "평가 환율을 입력해 주세요." : `1 ${currencies[asset.currency].unit} = ${asset.valuationRate}원 · ${asset.rateDate} 기준`}</p></div></div></header>
      <div className="p-5 sm:p-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">자산 원장</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">기준잔액과 연결한 입출금·이동·지출을 반영해요. 본인 부담액과 관계없이 전체 결제액이 출금돼요.</p></div><Button asChild size="sm"><Link href={`/transactions/new?date=${today}&asset=${id}`}>이 자산으로 지출 기록</Link></Button></div>
        <div className="mb-5 rounded-2xl bg-background p-4 text-sm"><p className="font-medium">기준잔액 · {asset.openingDate} 시작 시점</p><p className="mt-2 text-muted-foreground">{opening === null ? "잔액을 모르므로 원장에는 순변동만 표시해요." : formatMinor(opening, asset.currency)}</p><p className="mt-2 text-xs text-muted-foreground">기준일 이전 내역은 기준잔액에 포함된 것으로 보고 다시 차감하지 않아요.</p></div>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3 pr-4 font-medium">결제일·시각</th><th className="pb-3 pr-4 font-medium">내역</th><th className="pb-3 pr-4 text-right font-medium">거래 전</th><th className="pb-3 pr-4 text-right font-medium">입출금</th><th className="pb-3 text-right font-medium">거래 후</th></tr></thead><tbody>{rows.map(({ entry, href, amount, before, after, included }) => <tr key={entry.id} className="hover:bg-background/60"><td className="py-4 pr-4 align-top whitespace-nowrap"><p>{entry.paymentDate}</p><p className="mt-1 text-xs text-muted-foreground">{entry.time ?? "시각 미확인"}</p></td><td className="max-w-64 py-4 pr-4 align-top"><Link className="font-medium text-primary hover:underline" href={href}>{entry.title}</Link>{!included ? <p className="mt-1 text-xs text-muted-foreground">기준일 이전 · 잔액 반영 제외</p> : entry.paymentDate > today ? <p className="mt-1 text-xs text-amber-800">미래 기록 · 현재 잔액 제외</p> : null}</td><td className="py-4 pr-4 text-right align-top whitespace-nowrap text-muted-foreground tabular-nums">{before === null ? "미확인" : formatMinor(before, asset.currency)}</td><td className="py-4 pr-4 text-right align-top whitespace-nowrap tabular-nums">{formatMinor(amount, asset.currency)}</td><td className="py-4 text-right align-top whitespace-nowrap font-semibold tabular-nums">{after === null ? "미확인" : formatMinor(after, asset.currency)}</td></tr>)}</tbody></table></div> : <p className="rounded-2xl bg-background/50 p-10 text-center text-sm text-muted-foreground">연결된 거래가 없어요. 지출 입력에서 이 자산을 선택해 주세요.</p>}
        <p className="mt-5 text-xs leading-6 text-muted-foreground">시각 미확인은 같은 날의 마지막에 표시해요. 거래 후 잔액은 이 표시 순서로 계산한 값이며, 미확인 시각의 실제 거래 순서를 확정한 것은 아니에요.</p>
        {asset.memo ? <p className="mt-6 whitespace-pre-wrap break-words rounded-xl bg-background p-4 text-sm leading-6 text-muted-foreground">{asset.memo}</p> : null}
      </div>
    </article><DemoNotice />
  </>;
}
