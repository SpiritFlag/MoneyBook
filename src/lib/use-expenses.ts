"use client";

import useSWR from "swr";
import type { Expense, ExpenseInput } from "./expense";

export const ledgerKey = "/api/expenses";
async function fetchLedger(url: string): Promise<Expense[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "장부를 불러오지 못했어요.");
  return body;
}
export function useExpenses() {
  // 작은 체험 장부 전체를 한 키로 읽어 날짜 재방문과 상세 이동은 즉시 처리합니다.
  // 서버 저장 응답 역시 전체 장부이므로 수정 전후 날짜·월간 합계를 동시에 교체합니다.
  return useSWR<Expense[]>(ledgerKey, fetchLedger, { dedupingInterval: 30_000, focusThrottleInterval: 30_000, revalidateOnFocus: true, errorRetryCount: 2 });
}
export async function saveExpense(id: string, expense: ExpenseInput, revision?: number): Promise<Expense[]> {
  const response = await fetch(ledgerKey, { method: revision ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expense, revision }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "저장하지 못했어요.");
  return body;
}
