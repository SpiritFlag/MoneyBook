"use client";
import useSWR from "swr";
import { currencyOptions, type GameCurrency } from "./currency";
export const currenciesKey = "/api/currencies";
export function useCurrencies() {
  const result = useSWR<GameCurrency[]>(currenciesKey, async url => {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "재화를 불러오지 못했어요.");
    return body;
  }, { dedupingInterval: 30_000, errorRetryCount: 2 });
  return { ...result, options: currencyOptions(result.data) };
}
