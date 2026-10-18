"use client";
import useSWR from "swr";
import { useAssets } from "./use-assets";
import { useExpenses } from "./use-expenses";
import type { Operation, OperationInput } from "./operations";
export const operationsKey = "/api/operations";
async function fetchOperations(url: string): Promise<Operation[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message ?? "연결 기록을 읽지 못했어요.");
  return body;
}
export function useOperations() {
  return useSWR<Operation[]>(operationsKey, fetchOperations, {
    dedupingInterval: 30_000,
    focusThrottleInterval: 30_000,
    errorRetryCount: 2,
  });
}
export function useBook() {
  const assets = useAssets(),
    expenses = useExpenses(),
    operations = useOperations();
  return {
    data:
      assets.data && expenses.data && operations.data
        ? {
            assets: assets.data,
            expenses: expenses.data,
            operations: operations.data,
          }
        : undefined,
    error: assets.error ?? expenses.error ?? operations.error,
    retry: () => {
      void assets.mutate();
      void expenses.mutate();
      void operations.mutate();
    },
  };
}
export async function saveOperation(
  id: string,
  operation: OperationInput,
  revision?: number,
): Promise<Operation[]> {
  const response = await fetch(operationsKey, {
    method: revision ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, operation, revision }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "저장하지 못했어요.");
  return body;
}
