"use client";
import useSWR from "swr";
import { currencyOptions, currencyInfo, type Currency, type GameCurrency } from "./currency";
import { formatMoney, formatMinor } from "./expense";
export const currenciesKey = "/api/currencies";
export function useCurrencies() {
  const result = useSWR<GameCurrency[]>(currenciesKey, async url => {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "재화를 불러오지 못했어요.");
    return body;
  }, { dedupingInterval: 30_000, errorRetryCount: 2 });
  return { ...result, options: currencyOptions(result.data),
    currencyInfo: (code: Currency) => currencyInfo(code, result.data),
    formatMoney: (value: string, code: Currency) => formatMoney(value, code, result.data),
    formatMinor: (value: number, code: Currency) => formatMinor(value, code, result.data) };
}
