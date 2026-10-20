import type { Asset } from "./asset";
import type { Operation } from "./operations";

export function transitAssets(assets: readonly Asset[], operations: readonly Operation[]) {
  const used = new Set(operations.filter(op => op.kind === "transit").map(op => op.assetId));
  return assets.filter(asset => asset.currency === "KRW" && (asset.kind === "transport" || (asset.kind === "stored" && used.has(asset.id))));
}

export function defaultTransitAsset(assets: readonly Asset[], operations: readonly Operation[]) {
  const candidates = transitAssets(assets, operations);
  const classified = candidates.filter(asset => asset.kind === "transport");
  const choices = classified.length ? classified : candidates;
  if (choices.length === 1) return choices[0].id;
  const last = operations.filter(op => op.kind === "transit" && choices.some(asset => asset.id === op.assetId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "24:00").localeCompare(a.time ?? "24:00") || b.createdAt.localeCompare(a.createdAt))[0];
  return last?.assetId ?? "";
}
