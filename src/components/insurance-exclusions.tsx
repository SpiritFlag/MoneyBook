"use client";
import { Field } from "./form-fields";
import { Button } from "./ui/button";
import type { Expense } from "@/lib/expense";
import type { OperationInput } from "@/lib/operations";
type Allocation = OperationInput["allocations"][number];

export function InsuranceExclusions({ expense, allocation, patch }: { expense?: Expense; allocation: Allocation; patch: (next: Partial<Allocation>) => void }) {
  if (allocation.itemId) return <Field label="기존 상품별 배분">
    <select className="form-control" value={allocation.itemId} onChange={event => patch({ itemId: event.target.value, excludedItemIds: [] })}>
      <option value="">거래 전체 · 비해당 항목 제외 방식으로 변경</option>
      {expense?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">기존 상품 연결과 귀속액을 유지하고 있어요. 같은 의료비를 여러 줄로 나눴다면 금액을 확인해 한 줄로 정리할 수 있어요.</p>
  </Field>;
  const excluded = allocation.excludedItemIds ?? [];
  return <div><Field label="비해당 항목 추가" hint="선택하지 않은 상품은 포함해요. 예: 제증명료만 제외.">
    <select className="form-control" value="" disabled={!expense?.items.length} onChange={event => { if (event.target.value) patch({ excludedItemIds: [...excluded, event.target.value] }); }}>
      <option value="">{expense?.items.length ? "제외할 상품 선택" : "원거래의 상품 명세가 없어요"}</option>
      {expense?.items.filter(item => !excluded.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name || "이름 없는 상품"}</option>)}
    </select>
    </Field>
    {excluded.length ? <ul className="mt-3 space-y-2">{excluded.map(itemId => {
      const name = expense?.items.find(item => item.id === itemId)?.name ?? "원거래에서 없어진 상품";
      return <li key={itemId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm"><span>비해당 · {name}</span><Button type="button" variant="ghost" size="sm" aria-label={`비해당 항목 ${name} 제거`} onClick={() => patch({ excludedItemIds: excluded.filter(id => id !== itemId) })}>제거</Button></li>;
    })}</ul> : <p className="mt-2 text-xs text-muted-foreground">거래 전체 포함</p>}
  </div>;
}
