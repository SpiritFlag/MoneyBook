"use client";
import Link from "next/link";
import { useId } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowUpRight, GripVertical } from "lucide-react";
import { assetKinds, type Asset, type assetPosition } from "@/lib/asset";
import { useCurrencies } from "@/lib/use-currencies";

export function SortableAssetRow({ asset, position, index, disabled }: { asset: Asset; position: ReturnType<typeof assetPosition>; index: number; disabled: boolean }) {
  const { currencyInfo, formatMinor } = useCurrencies();
  const instructions = useId();
  const { ref, handleRef, isDragSource } = useSortable({ id: asset.id, index, disabled });
  const balance = position.balance === null ? "잔액 미확인" : formatMinor(position.balance, asset.currency);
  const won = position.won === null ? "원화 평가 미확정" : formatMinor(position.won, "KRW");
  return <li ref={ref} className={`book-sheet relative flex items-center gap-1 rounded-2xl bg-card px-2 py-2 sm:gap-2 sm:px-3 ${isDragSource ? "z-10 ring-2 ring-primary/40 shadow-lg" : ""}`}>
    <button ref={handleRef} type="button" disabled={disabled} aria-label={`${asset.name} 순서 이동`} aria-describedby={instructions} title="잡아서 위아래로 이동" className="flex h-12 w-9 shrink-0 touch-none items-center justify-center rounded-lg text-primary/65 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 enabled:cursor-grab enabled:active:cursor-grabbing"><GripVertical size={20} aria-hidden="true" /></button>
    <span id={instructions} className="sr-only">스페이스 또는 엔터로 잡고 위아래 방향키로 이동한 뒤 다시 눌러 놓으세요. Esc로 취소해요.</span>
    <Link href={`/assets/${asset.id}`} className="transaction-link flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 sm:gap-4">
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(9rem,auto)] sm:gap-x-6">
        <div className="min-w-0"><h2 className="break-words text-sm font-semibold sm:text-base">{asset.name}</h2><p className="mt-1 text-xs text-muted-foreground">{assetKinds[asset.kind]} · {currencyInfo(asset.currency).unit}</p>{position.balance === null ? <p className="mt-1 text-xs text-muted-foreground">{position.effective ? `순변동 ${formatMinor(position.net, asset.currency)}` : "잔액 기준일 이전"}</p> : null}</div>
        <div className="min-w-0 text-right"><p className="break-words text-base font-semibold tabular-nums sm:text-lg">{balance}</p><p className="mt-1 text-xs text-muted-foreground sm:hidden">{asset.currency === "KRW" && position.won !== null ? "원화 자산" : won}</p></div>
        <div className="hidden min-w-0 text-right sm:block"><p className="text-sm tabular-nums">{won}</p><p className="mt-1 text-xs text-muted-foreground">{asset.currency === "KRW" ? "원화 자산" : asset.valuationRate === null ? "환율 입력 필요" : `1 ${currencyInfo(asset.currency).unit} = ${asset.valuationRate}원`}</p></div>
      </div>
      <ArrowUpRight size={16} className="shrink-0 text-primary/60" aria-hidden="true" />
    </Link>
  </li>;
}
