"use client";
import Link from "next/link";
import { useId } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowUpRight, GripVertical } from "lucide-react";
import { assetKinds, type Asset, type assetPosition } from "@/lib/asset";
import { useCurrencies } from "@/lib/use-currencies";

type RowProps = {
  asset: Asset;
  position: ReturnType<typeof assetPosition>;
  index: number;
  editingOrder: boolean;
  savingOrder: boolean;
};

export function SortableAssetRow({ asset, position, index, editingOrder, savingOrder }: RowProps) {
  if (!editingOrder) {
    return <li className="book-sheet rounded-2xl bg-card px-2 py-2 sm:px-3">
      <AssetLink asset={asset} position={position} />
    </li>;
  }
  return <ReorderableRow asset={asset} position={position} index={index} savingOrder={savingOrder} />;
}

function ReorderableRow({ asset, position, index, savingOrder }: Omit<RowProps, "editingOrder">) {
  const instructions = useId();
  const { ref, handleRef, isDragSource } = useSortable({ id: asset.id, index, disabled: savingOrder });
  return <li ref={ref} className={`book-sheet relative flex items-center gap-1 rounded-2xl bg-card px-2 py-2 sm:gap-2 sm:px-3 ${isDragSource ? "z-10 ring-2 ring-primary/40 shadow-lg" : ""}`}>
      <button ref={handleRef} type="button" disabled={savingOrder} aria-label={`${asset.name} 순서 이동`} aria-describedby={instructions} title="잡아서 위아래로 이동" className="flex h-12 w-9 shrink-0 touch-none items-center justify-center rounded-lg text-primary/65 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 enabled:cursor-grab enabled:active:cursor-grabbing">
        <GripVertical size={20} aria-hidden="true" />
      </button>
      <span id={instructions} className="sr-only">스페이스 또는 엔터로 잡고 위아래 방향키로 이동한 뒤 다시 눌러 놓으세요. Esc로 취소해요.</span>
    <AssetLink asset={asset} position={position} />
  </li>;
}

function AssetLink({ asset, position }: Pick<RowProps, "asset" | "position">) {
  const { currencyInfo, formatMinor } = useCurrencies();
  const isCount = currencyInfo(asset.currency).unit === "회";
  let balance = isCount ? "남은 횟수 미확인" : "잔액 미확인";
  let detail = "";
  if (position.balance === null) {
    detail = position.effective ? `기준일 이후 순변동 ${formatMinor(position.net, asset.currency)}` : "잔액 기준일 이전";
  } else {
    balance = formatMinor(position.balance, asset.currency);
    if (isCount) balance = `${position.balance.toLocaleString("ko-KR")}회 남음`;
    if (asset.currency !== "KRW") {
      detail = position.won === null ? "원화 평가 미확정" : `원화 평가 ${formatMinor(position.won, "KRW")}`;
    }
  }

  return <Link href={`/assets/${asset.id}`} className="transaction-link flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 sm:gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-sm font-semibold sm:text-base">{asset.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{assetKinds[asset.kind]}</p>
      </div>
      <div className="min-w-0 max-w-[55%] text-right">
        <p className="break-words text-base font-semibold tabular-nums sm:text-lg">{balance}</p>
        {detail && <p className="mt-1 break-words text-xs tabular-nums text-muted-foreground">{detail}</p>}
      </div>
      <ArrowUpRight size={16} className="shrink-0 text-primary/60" aria-hidden="true" />
    </Link>;
}
