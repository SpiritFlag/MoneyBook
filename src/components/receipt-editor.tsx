"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form-fields";
import { ReceiptSummary } from "@/components/receipt-summary";
import { formatMinor, toMinor, type Currency, type ExpenseInput } from "@/lib/expense";

export function ReceiptEditor({ value, onChange }: { value: ExpenseInput; onChange: (value: ExpenseInput) => void }) {
  const currencyDefinitions = useCurrencies();
  const currencies = currencyDefinitions.options;
  function updateItem(index: number, patch: Partial<ExpenseInput["items"][number]>) {
    onChange({ ...value, items: value.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="명세 통화·재화"><select className="form-control" value={value.receiptCurrency} onChange={(e) => onChange({ ...value, receiptCurrency: e.target.value as Currency })}>{Object.entries(currencies).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></Field>
      {value.currency !== value.receiptCurrency ? <Field label="명세 대조 총액" hint="모르면 비워 두세요. 서로 다른 통화끼리 빼지 않아요."><input className="form-control" inputMode="decimal" placeholder="미확인" value={value.receiptTotal ?? ""} onChange={(e) => onChange({ ...value, receiptTotal: e.target.value || null })} /></Field> : null}
    </div>
    {value.items.length === 0 ? <p className="rounded-xl bg-background/70 px-4 py-6 text-center text-sm leading-6 text-muted-foreground">명세 없이도 저장할 수 있어요.<br />확인한 상품이 있다면 아래에서 추가해 주세요.</p> : null}
    <div className="space-y-5">
      {value.items.map((item, index) => <div key={item.id} className="receipt-node relative space-y-3 rounded-2xl bg-background/55 p-4">
        <div className="flex items-end gap-2"><Field label={`상품 ${index + 1}`} className="flex-1"><input lang="ko" inputMode="text" className="form-control" placeholder="상품명" maxLength={120} value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /></Field><Button variant="ghost" size="icon" type="button" aria-label={`상품 ${index + 1} 삭제`} onClick={() => onChange({ ...value, items: value.items.filter((_, i) => i !== index) })}><Trash2 size={16} /></Button></div>
        <div className="grid grid-cols-[1fr_5rem] gap-3 sm:grid-cols-[1fr_6rem_1fr]">
          <Field label={`상품 ${index + 1} 단가`}><input className="form-control" inputMode="decimal" placeholder="0" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} /></Field>
          <Field label={`상품 ${index + 1} 수량`}><input className="form-control" type="number" min={1} max={100000} value={item.quantity || ""} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} /></Field>
          <div className="col-span-2 flex items-center justify-end text-sm font-medium tabular-nums sm:col-span-1 sm:pt-6">{formatMinor((toMinor(item.unitPrice, value.receiptCurrency) ?? 0) * item.quantity - item.discounts.reduce((sum, d) => sum + (toMinor(d.amount, value.receiptCurrency) ?? 0), 0), value.receiptCurrency)}</div>
        </div>
        {item.discounts.map((discount, di) => <div key={discount.id} className="ml-2 grid grid-cols-[1fr_6rem_2rem] items-end gap-2 border-l-2 border-primary/15 pl-3">
          <Field label={`상품 ${index + 1} 할인 ${di + 1} 이름`}><input lang="ko" inputMode="text" className="form-control" value={discount.name} placeholder="쿠폰 할인" onChange={(e) => updateItem(index, { discounts: item.discounts.map((d, i) => i === di ? { ...d, name: e.target.value } : d) })} /></Field>
          <Field label={`상품 ${index + 1} 할인 ${di + 1} 금액`}><input className="form-control" inputMode="decimal" value={discount.amount} onChange={(e) => updateItem(index, { discounts: item.discounts.map((d, i) => i === di ? { ...d, amount: e.target.value } : d) })} /></Field>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`상품 ${index + 1} 할인 ${di + 1} 삭제`} onClick={() => updateItem(index, { discounts: item.discounts.filter((_, i) => i !== di) })}><Trash2 size={14} /></Button>
        </div>)}
        <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => updateItem(index, { discounts: [...item.discounts, { id: crypto.randomUUID(), name: "", amount: "" }] })}><Plus size={14} />상품 할인 추가</Button>
      </div>)}
    </div>
    <Button type="button" variant="secondary" onClick={() => onChange({ ...value, items: [...value.items, { id: crypto.randomUUID(), name: "", unitPrice: "", quantity: 1, discounts: [] }] })}><Plus size={16} />상품 추가</Button>
    {value.adjustments.length ? <div className="space-y-3 pt-3"><h3 className="text-sm font-semibold">거래 전체 할인·가산</h3>{value.adjustments.map((row, index) => <div key={row.id} className="grid grid-cols-[1fr_6rem_2rem] items-end gap-2">
      <Field label={`${row.kind === "discount" ? "전체 할인" : "전체 가산"} ${index + 1} 이름`}><input lang="ko" inputMode="text" className="form-control" value={row.name} placeholder={row.kind === "discount" ? "장바구니 쿠폰" : "배송비·세금"} onChange={(e) => onChange({ ...value, adjustments: value.adjustments.map((a, i) => i === index ? { ...a, name: e.target.value } : a) })} /></Field>
      <Field label={`전체 조정 ${index + 1} 금액`}><input className="form-control" inputMode="decimal" value={row.amount} onChange={(e) => onChange({ ...value, adjustments: value.adjustments.map((a, i) => i === index ? { ...a, amount: e.target.value } : a) })} /></Field>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`전체 조정 ${index + 1} 삭제`} onClick={() => onChange({ ...value, adjustments: value.adjustments.filter((_, i) => i !== index) })}><Trash2 size={14} /></Button>
    </div>)}</div> : null}
    <div className="flex flex-wrap gap-2">{(["discount", "surcharge"] as const).map((kind) => <Button key={kind} type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, adjustments: [...value.adjustments, { id: crypto.randomUUID(), kind, name: "", amount: "" }] })}><Plus size={14} />전체 {kind === "discount" ? "할인" : "가산"} 추가</Button>)}</div>
    <ReceiptSummary expense={value} />
  </div>;
}
