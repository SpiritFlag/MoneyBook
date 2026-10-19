"use client";
import useSWR from "swr";
import type { Card, CardInput } from "./card";
export const cardsKey = "/api/cards";
async function fetchCards(url: string): Promise<Card[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "카드를 읽지 못했어요.");
  return body;
}
export function useCards() { return useSWR<Card[]>(cardsKey, fetchCards, { dedupingInterval: 30000, focusThrottleInterval: 30000, errorRetryCount: 2 }); }
export async function saveCard(id: string, card: CardInput, revision?: number): Promise<Card[]> {
  const response = await fetch(cardsKey, { method: revision ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, card, revision }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "카드를 등록하지 못했어요.");
  return body;
}
