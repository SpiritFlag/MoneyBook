import { z } from "zod";
import { currencyInfo, toMinor, orderAroundReferences, type Currency, type Expense } from "./expense";
import { parseDateQuery } from "./date";

export const assetKinds = { account: "계좌", cash: "현금", stored: "충전 잔액·재화", transport: "교통카드", receivable: "미수금" } as const;
import { currencySchema } from "./currency";
export function signedMinor(value: string, currency: Currency): number | null {
  const negative = value.startsWith("-");
  const amount = toMinor(negative ? value.slice(1) : value, currency);
  return amount === null ? null : negative ? -amount : amount;
}
// 환율은 원/1단위, 소수 8자리까지. 수량과 곱한 뒤 원 단위에서 반올림합니다.
export function rateUnits(value: string): bigint | null {
  if (!/^\d{1,9}(?:\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, "0"));
}
export function valueInWon(amount: number, currency: Currency, rate: string | null): number | null {
  if (currency === "KRW") return amount;
  const units = rate === null ? null : rateUnits(rate);
  if (units === null) return null;
  const numerator = BigInt(Math.abs(amount)) * units;
  const denominator = BigInt(10 ** currencyInfo(currency).digits) * BigInt(100_000_000);
  const rounded = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(rounded) * (amount < 0 ? -1 : 1);
}
export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "자산 이름을 입력해 주세요.").max(80),
  kind: z.enum(["account", "cash", "stored", "transport", "receivable"]),
  currency: currencySchema,
  openingDate: z.string().refine((v) => parseDateQuery(v) !== null, "기준일을 확인해 주세요."),
  openingBalance: z.string().max(19).nullable(),
  valuationRate: z.string().max(18).nullable(),
  rateDate: z.string().refine((v) => parseDateQuery(v) !== null, "환율 기준일을 확인해 주세요."),
  memo: z.string().max(1000),
}).superRefine((value, ctx) => {
  if (value.kind === "transport" && value.currency !== "KRW") ctx.addIssue({ code: "custom", path: ["currency"], message: "교통카드는 원화 자산으로 등록해 주세요." });
  if (value.openingBalance !== null && signedMinor(value.openingBalance, value.currency) === null) ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "기준잔액의 숫자·소수 자릿수·범위를 확인해 주세요." });
  if (value.currency !== "KRW" && value.valuationRate !== null && rateUnits(value.valuationRate) === null) ctx.addIssue({ code: "custom", path: ["valuationRate"], message: "환율은 0 이상, 정수 9자리·소수 8자리까지 입력해 주세요." });
});
export type AssetInput = z.infer<typeof assetInputSchema>;
export const assetSchema = assetInputSchema.safeExtend({ id: z.string().min(1).max(80), revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export type Asset = z.infer<typeof assetSchema>;
const orderedAssetIds = z.array(z.string().min(1).max(80)).max(1000);
export const assetOrderSchema = z.object({ ids: orderedAssetIds, expectedIds: orderedAssetIds }).superRefine((value, ctx) => {
  for (const field of ["ids", "expectedIds"] as const) if (new Set(value[field]).size !== value[field].length) ctx.addIssue({ code: "custom", path: [field], message: "자산 순서에 중복이 있어요." });
});
export type AssetOrderInput = z.infer<typeof assetOrderSchema>;
export function newAsset(date: string): AssetInput {
  return { name: "", kind: "account", currency: "KRW", openingDate: date, openingBalance: null, valuationRate: null, rateDate: date, memo: "" };
}
export function assetTransactions(asset: Asset, expenses: readonly Expense[]) {
  return expenses.filter((entry) => entry.assetId === asset.id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || (a.time ?? "24:00").localeCompare(b.time ?? "24:00") || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
type ExtraPosting = { id: string; assetId: string; date: string; time: string | null; title: string; amount: number; href: string; order: number; referenceId?: string };
function ledgerEntries(asset: Asset, expenses: readonly Expense[], extra: readonly ExtraPosting[]) {
  const rows = [...assetTransactions(asset, expenses).map((entry) => ({ id: entry.id, entry, amount: -(toMinor(entry.paidAmount, asset.currency) ?? 0), href: `/transactions/${entry.id}`, order: entry.sortOrder ?? 0 })), ...extra.filter((p) => p.assetId === asset.id).map((p) => ({ id: p.id, entry: { id: p.id, title: p.title, paymentDate: p.date, time: p.time }, amount: p.amount, href: p.href, order: p.order }))].sort((a, b) => a.entry.paymentDate.localeCompare(b.entry.paymentDate) || (a.entry.time ?? "24:00").localeCompare(b.entry.time ?? "24:00") || a.order - b.order || a.entry.id.localeCompare(b.entry.id));
  const source = new Map(expenses.map((e) => [e.id, e]));
  return orderAroundReferences(rows, (r) => {
    const e = source.get(r.id), target = e?.orderReference ? source.get(e.orderReference) : null;
    if (e?.time === null && e.orderReference && !target) {
      const matches = extra.filter(p => p.referenceId === e.orderReference && p.assetId === asset.id && p.date === e.paymentDate);
      const posting = matches[0];
      return posting?.id ?? null;
    }
    return e?.time === null && target?.assetId === asset.id && target?.paymentDate === e.paymentDate ? e.orderReference : null;
  }, (r) => source.get(r.id)?.orderSide ?? "after");
}
export function assetPosition(asset: Asset, expenses: readonly Expense[], date: string, extra: readonly ExtraPosting[] = []) {
  const effective = date >= asset.openingDate;
  const net = ledgerEntries(asset, expenses, extra).filter(({ entry }) => entry.paymentDate >= asset.openingDate && entry.paymentDate <= date).reduce((sum, entry) => sum + entry.amount, 0);
  const opening = asset.openingBalance === null ? null : signedMinor(asset.openingBalance, asset.currency);
  const balance = effective && opening !== null ? opening + net : null;
  return { net, balance, won: balance === null ? null : valueInWon(balance, asset.currency, asset.valuationRate), effective };
}
export function assetLedger(asset: Asset, expenses: readonly Expense[], extra: readonly ExtraPosting[] = []) {
  let balance = asset.openingBalance === null ? null : signedMinor(asset.openingBalance, asset.currency);
  return ledgerEntries(asset, expenses, extra).map(({ entry, amount, href }) => {
    const included = entry.paymentDate >= asset.openingDate;
    const before = included ? balance : null;
    if (included && balance !== null) balance += amount;
    return { entry, amount, before, after: included ? balance : null, included, href };
  });
}
