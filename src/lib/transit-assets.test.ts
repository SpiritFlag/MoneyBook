import test from "node:test";
import assert from "node:assert/strict";
import { assetInputSchema, newAsset, type Asset } from "./asset";
import { newOperation, type Operation } from "./operations";
import { defaultTransitAsset, transitAssets } from "./transit-assets";
const date = "2026-10-20";
const asset = (id: string, kind: Asset["kind"]): Asset => ({ ...newAsset(date), id, name: id, kind, revision: 1, createdAt: date, updatedAt: date });
const trip = (assetId: string, date: string): Operation => ({ ...newOperation("transit", date), assetId, id: assetId + date, revision: 1, createdAt: date, updatedAt: date });

test("교통카드는 원화 타입이며 한 장·최근 사용에 따라 자동 선택하고 일반 충전 잔액은 제외한다", () => {
  const card = asset("card", "transport"), other = asset("other", "transport"), stored = asset("stored", "stored");
  assert.equal(assetInputSchema.safeParse({ ...card, currency: "USD" }).success, false);
  assert.equal(defaultTransitAsset([card, stored], []), "card");
  assert.equal(defaultTransitAsset([card, other, stored], []), "");
  assert.equal(defaultTransitAsset([card, other, stored], [trip("card", "2026-10-01"), trip("other", date)]), "other");
  assert.deepEqual(transitAssets([stored], []), []);
  assert.equal(defaultTransitAsset([stored], [trip("stored", date)]), "stored");
  assert.equal(defaultTransitAsset([stored, card], [trip("stored", date)]), "card");
});
