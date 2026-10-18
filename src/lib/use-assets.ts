"use client";
import useSWR from "swr";
import type { Asset, AssetInput } from "./asset";
export const assetsKey = "/api/assets";
async function fetchAssets(url: string): Promise<Asset[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "자산을 불러오지 못했어요.");
  return body;
}
export function useAssets() { return useSWR<Asset[]>(assetsKey, fetchAssets, { dedupingInterval: 30_000, focusThrottleInterval: 30_000, errorRetryCount: 2 }); }
export async function saveAsset(id: string, asset: AssetInput, revision?: number): Promise<Asset[]> {
  const response = await fetch(assetsKey, { method: revision ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, asset, revision }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "자산을 저장하지 못했어요.");
  return body;
}
