"use client";
import useSWR from "swr";
import type { TrashEntry } from "./trash";

export const trashKey = "/api/trash";
export const trashAffectedKeys = ["/api/expenses", "/api/operations", trashKey, "/api/loans"];
async function fetchTrash(url: string): Promise<TrashEntry[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "휴지통을 불러오지 못했어요.");
  return body;
}
export const useTrash = () => useSWR<TrashEntry[]>(trashKey, fetchTrash, { errorRetryCount: 2 });
export async function changeTrash(method: "DELETE" | "POST", value: { id: string; kind?: "expense" | "operation"; revision?: number }) {
  const response = await fetch(trashKey, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "휴지통을 변경하지 못했어요.");
}
