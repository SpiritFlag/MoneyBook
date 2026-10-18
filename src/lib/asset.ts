import { z } from "zod";
import { currencies, toMinor, type Currency, type Expense } from "./expense";
import { parseDateQuery } from "./date";

export const assetKinds = { account: "계좌", cash: "현금", stored: "충전 잔액·재화" } as const;
const currencySchema = z.enum(["KRW", "USD", "EUR", "JPY", "MCASH", "RC"]);
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
  const denominator = BigInt(10 ** currencies[currency].digits) * BigInt(100_000_000);
  const rounded = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(rounded) * (amount < 0 ? -1 : 1);
}
export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "자산 이름을 입력해 주세요.").max(80),
  kind: z.enum(["account", "cash", "stored"]),
  currency: currencySchema,
  openingDate: z.string().refine((v) => parseDateQuery(v) !== null, "기준일을 확인해 주세요."),
  openingBalance: z.string().max(19).nullable(),
  valuationRate: z.string().max(18).nullable(),
  rateDate: z.string().refine((v) => parseDateQuery(v) !== null, "환율 기준일을 확인해 주세요."),
  memo: z.string().max(1000),
}).superRefine((value, ctx) => {
  if (value.openingBalance !== null && signedMinor(value.openingBalance, value.currency) === null) ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "기준잔액의 숫자·소수 자릿수·범위를 확인해 주세요." });
  if (value.currency !== "KRW" && value.valuationRate !== null && rateUnits(value.valuationRate) === null) ctx.addIssue({ code: "custom", path: ["valuationRate"], message: "환율은 0 이상, 정수 9자리·소수 8자리까지 입력해 주세요." });
});
export type AssetInput = z.infer<typeof assetInputSchema>;
export const assetSchema = assetInputSchema.safeExtend({ id: z.string().min(1).max(80), revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export type Asset = z.infer<typeof assetSchema>;
export function newAsset(date: string): AssetInput {
  return { name: "", kind: "account", currency: "KRW", openingDate: date, openingBalance: null, valuationRate: null, rateDate: date, memo: "" };
}
export function assetTransactions(asset: Asset, expenses: readonly Expense[]) {
  return expenses.filter((entry) => entry.assetId === asset.id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || (a.time ?? "24:00").localeCompare(b.time ?? "24:00") || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function assetPosition(asset: Asset, expenses: readonly Expense[], date: string) {
  const effective = date >= asset.openingDate;
  const net = assetTransactions(asset, expenses).filter((entry) => entry.paymentDate >= asset.openingDate && entry.paymentDate <= date).reduce((sum, entry) => sum - (toMinor(entry.paidAmount, asset.currency) ?? 0), 0);
  const opening = asset.openingBalance === null ? null : signedMinor(asset.openingBalance, asset.currency);
  const balance = effective && opening !== null ? opening + net : null;
  return { net, balance, won: balance === null ? null : valueInWon(balance, asset.currency, asset.valuationRate), effective };
}
export function assetLedger(asset: Asset, expenses: readonly Expense[]) {
  let balance = asset.openingBalance === null ? null : signedMinor(asset.openingBalance, asset.currency);
  return assetTransactions(asset, expenses).map((entry) => {
    const included = entry.paymentDate >= asset.openingDate;
    const amount = -(toMinor(entry.paidAmount, asset.currency) ?? 0);
    const before = included ? balance : null;
    if (included && balance !== null) balance += amount;
    return { entry, amount, before, after: included ? balance : null, included };
  });
}
