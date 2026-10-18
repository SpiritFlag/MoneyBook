"use client";
import { ExpenseForm } from "./expense-form";
import { LedgerState } from "./ledger-state";
import { useAssets } from "@/lib/use-assets";
import Link from "next/link";
export function ExpenseCreate({ date, assetId }: { date: string; assetId?: string }) {
  const { data, error, mutate } = useAssets();
  if (assetId && (!data || error)) return <LedgerState error={error} retry={() => { void mutate(); }} />;
  const asset = data?.find((entry) => entry.id === assetId);
  if (assetId && !asset) return <div className="rounded-3xl bg-card p-10"><p>선택한 자산을 찾을 수 없어요.</p><Link href="/assets">자산 현황으로</Link></div>;
  return <ExpenseForm key={assetId ?? "new"} date={date} initialAsset={asset} />;
}
