"use client";
import { Field } from "./form-fields";
import type { Asset } from "@/lib/asset";
import type { Card } from "@/lib/card";
type Source = { fromId: string; cardId?: string; debitCardId?: string };

export function FundingSource({ value, change, assets, cards, suffix = "" }: { value: Source; change: (next: Source) => void; assets: Asset[]; cards: Card[]; suffix?: string }) {
  const mode = value.debitCardId !== undefined ? "debit" : value.cardId !== undefined ? "card" : "asset";
  const account = assets.find(a => a.id === value.fromId);
  return <>
    <Field label={`충전 결제 방식${suffix}`}><select className="form-control" value={mode} onChange={event => change({ fromId: "", cardId: event.target.value === "card" ? "" : undefined, debitCardId: event.target.value === "debit" ? "" : undefined })}><option value="asset">자산에서 출금</option><option value="card">신용카드 승인</option><option value="debit">체크카드 승인</option></select></Field><div />
    {mode === "asset" ? <Field label={`출발 자산${suffix}`}><select className="form-control" value={value.fromId} onChange={event => change({ fromId: event.target.value, cardId: undefined, debitCardId: undefined })}><option value="">자산 선택</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.currency}</option>)}</select></Field> : <Field label={`충전 ${mode === "debit" ? "체크카드" : "신용카드"}${suffix}`} hint={mode === "debit" ? `승인일에 연결 계좌에서 출금해요.${account ? ` 출금 계좌: ${account.name} · ${account.currency}` : ""}` : "카드 명세서에 승인으로 표시하고 실제 납부할 때 계좌에서 출금해요."}>
      <select className="form-control" value={mode === "debit" ? value.debitCardId : value.cardId} onChange={event => { const card = cards.find(c => c.id === event.target.value); change(mode === "debit" ? { debitCardId: event.target.value, cardId: undefined, fromId: card?.assetId ?? "" } : { cardId: event.target.value, debitCardId: undefined, fromId: "" }); }}><option value="">카드 선택</option>{cards.filter(card => mode === "debit" ? card.kind === "debit" : card.kind !== "debit").map(card => <option key={card.id} value={card.id}>{card.name}</option>)}</select>
    </Field>}
  </>;
}
