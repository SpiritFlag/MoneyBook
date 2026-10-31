"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { GameCurrencies } from "./game-currencies";
import Link from "next/link";
import { useRef, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { SortableAssetRow } from "./sortable-asset-row";
import { Wallet, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { DemoNotice, LedgerState } from "./ledger-state";
import { useAssets, saveAssetOrder } from "@/lib/use-assets";
import { useOperations } from "@/lib/use-operations";
import { operationPostings } from "@/lib/operations";
import { useExpenses } from "@/lib/use-expenses";
import { assetPosition, type Asset } from "@/lib/asset";

import { parseDateQuery } from "@/lib/date";

export function AssetOverview({ today }: { today: string }) {
  const { formatMinor } = useCurrencies();
  const assets = useAssets();
  const expenses = useExpenses(); const operations = useOperations();
  const [date, setDate] = useState(today);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const draggedAssets = useRef<Asset[] | null>(null);
  const orderBusy = useRef(false);
  const postings = operationPostings(operations.data ?? [], assets.data ?? []);
  const positions = (assets.data ?? []).map((asset) => ({ asset, position: assetPosition(asset, expenses.data ?? [], date, postings) }));
  const ready = !!assets.data && !!expenses.data && !!operations.data;
  const total = positions.reduce((sum, { position }) => sum + (position.won ?? 0), 0);
  const unknown = positions.filter(({ position }) => position.won === null).length;
  const error = assets.error ?? expenses.error ?? operations.error;
  return <>
    <header className="mb-7 flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-widest text-primary">내 돈이 머무는 곳</p><h1 className="text-3xl font-bold">자산 현황</h1><p className="mt-3 text-sm text-muted-foreground">원래 단위의 잔액과 원화 가치를 함께 확인하세요.</p></div><Button asChild><Link href="/assets/new"><Plus size={16} />자산 추가</Link></Button></header>
    <section className="daily-summary book-sheet mb-6 rounded-3xl p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs text-muted-foreground">등록 자산의 원화 평가 합계</p><p className="mt-3 text-4xl font-bold text-primary tabular-nums">{ready && !error ? formatMinor(total, "KRW") : "—"}</p>{unknown > 0 && ready ? <p className="mt-3 text-sm text-amber-800">잔액·평가 미확정 {unknown}개 자산은 합계에서 제외</p> : null}</div><label className="grid gap-2 text-xs text-muted-foreground">잔액 조회일<input type="date" className="form-control" min="1900-01-01" max="9999-12-31" value={date} onChange={(e) => { if (parseDateQuery(e.target.value)) setDate(e.target.value); }} /></label></div><p className="mt-5 text-xs leading-6 text-muted-foreground">조회일까지 기록한 잔액에 각 자산의 현재 입력 환율을 적용해요. 과거 환율 조회나 전체 순자산(부채 포함) 합계는 아니에요.</p></section>
    {!ready || error ? <LedgerState error={error} retry={() => { void assets.mutate(); void expenses.mutate(); void operations.mutate(); }} /> : positions.length ? <section aria-label="자산 목록">
      <p className="mb-3 text-xs text-muted-foreground">왼쪽 손잡이를 끌어 순서를 바꿔보세요. 지출·이체·납입의 자산 선택 순서에도 함께 적용돼요.</p>
      {orderError ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">{orderError}</p> : null}
      <p role="status" aria-live="polite" className="mb-2 text-xs text-primary">{savingOrder ? "자산 순서를 저장하고 있어요…" : orderStatus}</p>
      <DragDropProvider onDragStart={() => { draggedAssets.current = assets.data ?? []; }} onDragEnd={async event => {
        const original = draggedAssets.current ?? assets.data ?? [];
        draggedAssets.current = null;
        if (event.canceled || orderBusy.current) return;
        const reordered = move(original, event);
        if (reordered.every((asset, index) => asset.id === original[index]?.id)) return;
        orderBusy.current = true; setSavingOrder(true); setOrderError(""); setOrderStatus("");
        try {
          await assets.mutate(saveAssetOrder({ ids: reordered.map(asset => asset.id), expectedIds: original.map(asset => asset.id) }), { optimisticData: reordered, rollbackOnError: true, revalidate: false });
          setOrderStatus("자산 순서를 저장했어요. 다른 자산 선택 목록에도 적용했어요.");
        } catch (error) {
          setOrderError(error instanceof Error ? error.message : "자산 순서를 저장하지 못했어요.");
          await assets.mutate().catch(() => undefined);
        } finally { orderBusy.current = false; setSavingOrder(false); }
      }}>
        <ul className="space-y-2">{positions.map(({ asset, position }, index) => <SortableAssetRow key={asset.id} asset={asset} position={position} index={index} disabled={savingOrder || positions.length < 2} />)}</ul>
      </DragDropProvider>
    </section> : <div className="book-sheet rounded-3xl bg-card px-6 py-16 text-center"><Wallet className="mx-auto mb-4 text-primary" size={32} /><h2 className="text-lg font-semibold">첫 자산을 등록해 보세요</h2><p className="mt-3 text-sm text-muted-foreground">계좌, 현금, 외화 지갑, 게임 재화를 같은 방식으로 관리해요.</p><Button asChild className="mt-6"><Link href="/assets/new">자산 추가하기</Link></Button></div>}
    <GameCurrencies />
    <DemoNotice />
  </>;
}
