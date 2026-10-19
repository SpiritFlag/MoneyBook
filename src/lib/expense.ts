import { z } from "zod";
import { bookDate, bookTimeOrder, parseDateQuery } from "./date";

import { currencyInfo, currencySchema, type Currency } from "./currency";
export { currencies, currencyInfo, type Currency } from "./currency";
export const categories = {
  food: { label: "식비", image: "/characters/expense_food.png" },
  transport: { label: "교통", image: "/characters/expense_transport.png" },
  goods: { label: "생활용품", image: "/characters/expense_goods.png" },
  housing: { label: "주거", image: "/characters/expense_housing.png" },
  digital: { label: "디지털", image: "/characters/expense_digital.png" },
  medical: { label: "의료", image: "/characters/expense_medical.png" },
  hobby: { label: "취미", image: "/characters/expense_hobby.png" },
  game: { label: "게임", image: "/characters/expense_game.png" },
  fashion: { label: "패션", image: "/characters/expense_fashion.png" },
  beauty: { label: "미용", image: "/characters/expense_beauty.png" },
  service: { label: "서비스", image: "/characters/expense_service.png" },
  donation: { label: "기부", image: "/characters/expense_donation.png" },
  dues: { label: "회비", image: "/characters/expense_dues.png" },
  fitness: { label: "운동", image: "/characters/expense_fitness.png" },
  gift: { label: "선물", image: "/characters/expense_gift.png" },
  insurance: { label: "보험", image: "/characters/expense_insurance.png" },
  membership: { label: "구독", image: "/characters/expense_membership.png" },
  tax: { label: "세금", image: "/characters/expense_tax.png" },
  telecom: { label: "통신", image: "/characters/expense_telecom.png" },
  vehicle: { label: "차량", image: "/characters/expense_vehicle.png" },
  secret: { label: "비밀", image: "/characters/expense_secret.png" },
  study: { label: "공부", image: "/characters/expense_study.png" },
  other: { label: "기타", image: "/characters/expense_other.png" },
} as const;
export type Category = keyof typeof categories;

// 금액은 문자열로 저장하고 계산할 때만 최소 단위 정수로 바꿉니다.
// USD 0.10 + 0.20 같은 계산에서 부동소수점 오차를 피합니다.
export function toMinor(value: string, currency: Currency): number | null {
  const digits = currencyInfo(currency).digits;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > digits) return null;
  const result = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(result) && result <= 1_000_000_000_000 ? result : null;
}
export function fromMinor(value: number, currency: Currency): string {
  return (value / 10 ** currencyInfo(currency).digits).toFixed(currencyInfo(currency).digits);
}
export function formatMinor(value: number, currency: Currency): string {
  return `${((value === 0 ? 0 : value) / 10 ** currencyInfo(currency).digits).toLocaleString("ko-KR", { maximumFractionDigits: currencyInfo(currency).digits })}${currency === "KRW" ? "원" : ` ${currencyInfo(currency).unit}`}`;
}
export function formatMoney(value: string, currency: Currency): string {
  const amount = toMinor(value, currency);
  return amount === null ? "금액 확인 필요" : formatMinor(amount, currency);
}

const dateSchema = z.string().refine((value) => parseDateQuery(value) !== null, "실제 있는 날짜를 입력해 주세요.");
const moneySchema = z.string().max(18).regex(/^\d+(?:\.\d+)?$/, "금액을 숫자로 입력해 주세요.");
const namedAmount = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1, "할인·가산 이름을 입력해 주세요.").max(100), amount: moneySchema });
const baseExpenseSchema = z.object({
  title: z.string().trim().min(1, "거래명을 입력해 주세요.").max(120),
  category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
  currency: currencySchema,
  paidAmount: moneySchema,
  paymentMethod: z.string().trim().min(1, "결제수단을 입력해 주세요.").max(80),
  assetId: z.string().min(1).max(80).nullable().default(null),
  topup: z.object({ fromId: z.string().max(80), cardId: z.string().max(120).optional(), amount: moneySchema, received: moneySchema, sameTime: z.boolean(), date: dateSchema, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), rate: z.string().max(20) }).nullable().default(null),
  paymentKind: z.enum(["card", "account", "cash", "stored"]),
  paymentDate: dateSchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각을 확인해 주세요.").nullable(),
  useKind: z.enum(["once", "period"]),
  useDate: dateSchema,
  useDateFollowsPayment: z.boolean().optional(),
  useTimeFollowsPayment: z.boolean().optional(),
  sortOrder: z.number().finite().default(0),
  orderReference: z.string().max(80).nullable().default(null),
  orderSide: z.enum(["before", "after"]).default("after"),
  valuationRate: z.string().max(20).nullable().default(null),
  valuationSource: z.string().max(160).nullable().default(null),
  useTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "이용 시각을 확인해 주세요.").nullable().default(null),
  useEnd: dateSchema.nullable(),
  allocation: z.enum(["start", "annual"]),
  shared: z.boolean(),
  ownAmount: moneySchema.nullable(),
  krwAmount: moneySchema.nullable(),
  receiptCurrency: currencySchema,
  receiptTotal: moneySchema.nullable(),
  items: z.array(z.object({
    id: z.string().min(1).max(80), name: z.string().trim().min(1, "상품명을 입력해 주세요.").max(120),
    unitPrice: moneySchema, quantity: z.number().int().min(1).max(100_000), discounts: z.array(namedAmount).max(20),
  })).max(100),
  adjustments: z.array(namedAmount.extend({ kind: z.enum(["discount", "surcharge"]) })).max(30),
  memo: z.string().max(2000),
});
export type ExpenseInput = z.infer<typeof baseExpenseSchema>;
export const expenseInputSchema = baseExpenseSchema.superRefine((value, ctx) => {
  function check(amount: string | null, currency: Currency, path: (string | number)[]) {
    if (amount !== null && toMinor(amount, currency) === null) ctx.addIssue({ code: "custom", message: `${currencyInfo(currency).unit} 금액의 소수 자릿수 또는 범위를 확인해 주세요.`, path });
  }
  check(value.paidAmount, value.currency, ["paidAmount"]);
  check(value.ownAmount, value.currency, ["ownAmount"]);
  check(value.krwAmount, "KRW", ["krwAmount"]);
  check(value.receiptTotal, value.receiptCurrency, ["receiptTotal"]);
  const paid = toMinor(value.paidAmount, value.currency);
  const own = value.ownAmount === null ? null : toMinor(value.ownAmount, value.currency);
  if (value.shared && (own === null || paid === null || own > paid)) ctx.addIssue({ code: "custom", message: "본인 부담액은 0 이상, 실제 결제액 이하여야 해요.", path: ["ownAmount"] });
  if (value.useKind === "period" && (!value.useEnd || value.useEnd < value.useDate)) ctx.addIssue({ code: "custom", message: "이용 종료일은 시작일 이후로 입력해 주세요.", path: ["useEnd"] });
  if (value.useKind === "period" && value.allocation === "annual" && value.useDate.slice(0, 4) === "9999") ctx.addIssue({ code: "custom", message: "연간 배분의 시작 연도는 9998년까지 지원해요.", path: ["useDate"] });
  value.items.forEach((item, index) => {
    check(item.unitPrice, value.receiptCurrency, ["items", index, "unitPrice"]);
    item.discounts.forEach((discount, i) => check(discount.amount, value.receiptCurrency, ["items", index, "discounts", i, "amount"]));
    const gross = (toMinor(item.unitPrice, value.receiptCurrency) ?? 0) * item.quantity;
    const discount = item.discounts.reduce((sum, d) => sum + (toMinor(d.amount, value.receiptCurrency) ?? 0), 0);
    if (!Number.isSafeInteger(gross) || gross > 1_000_000_000_000) ctx.addIssue({ code: "custom", message: "상품 합계가 허용 범위를 초과했어요.", path: ["items", index] });
    if (discount > gross) ctx.addIssue({ code: "custom", message: "상품 할인은 해당 상품 금액을 넘을 수 없어요.", path: ["items", index, "discounts"] });
  });
  value.adjustments.forEach((a, index) => check(a.amount, value.receiptCurrency, ["adjustments", index, "amount"]));
  if (receiptSummary(value).sum < 0) ctx.addIssue({ code: "custom", message: "전체 할인 후 명세 합계는 음수가 될 수 없어요.", path: ["adjustments"] });
  const ids = [...value.items.map((i) => i.id), ...value.items.flatMap((i) => i.discounts.map((d) => d.id)), ...value.adjustments.map((a) => a.id)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "명세 행 ID가 중복되었어요.", path: ["items"] });
});

export type Expense = ExpenseInput & { id: string; revision: number; createdAt: string; updatedAt: string };
export const expenseSchema = expenseInputSchema.safeExtend({ id: z.string().min(1).max(80), revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export function newExpense(date: string): ExpenseInput {
  return { title: "", category: "food", currency: "KRW", paidAmount: "", paymentMethod: "", assetId: null, topup: null, paymentKind: "card", paymentDate: date, time: null, useKind: "once", useDate: date, useDateFollowsPayment: true, useTime: null, sortOrder: 0, orderReference: null, orderSide: "after", valuationRate: null, valuationSource: null, useEnd: null, allocation: "start", shared: false, ownAmount: null, krwAmount: null, receiptCurrency: "KRW", receiptTotal: null, items: [], adjustments: [], memo: "" };
}
export function receiptSummary(value: ExpenseInput) {
  const currency = value.receiptCurrency;
  const gross = value.items.reduce((sum, item) => sum + (toMinor(item.unitPrice, currency) ?? 0) * item.quantity, 0);
  const itemDiscounts = value.items.reduce((sum, item) => sum + item.discounts.reduce((s, d) => s + (toMinor(d.amount, currency) ?? 0), 0), 0);
  const discounts = value.adjustments.filter((a) => a.kind === "discount").reduce((sum, a) => sum + (toMinor(a.amount, currency) ?? 0), 0);
  const surcharges = value.adjustments.filter((a) => a.kind === "surcharge").reduce((sum, a) => sum + (toMinor(a.amount, currency) ?? 0), 0);
  const sum = gross - itemDiscounts - discounts + surcharges;
  const target = value.currency === currency ? toMinor(value.paidAmount, currency) : value.receiptTotal === null ? null : toMinor(value.receiptTotal, currency);
  const difference = target === null ? null : target - sum;
  return { gross, itemDiscounts, discounts, surcharges, sum, target, difference, status: difference === null ? "pending" : difference > 0 ? "unknown" : difference < 0 ? "over" : "matched" } as const;
}
export function ownMinor(value: ExpenseInput): number {
  return toMinor(value.shared ? value.ownAmount ?? "0" : value.paidAmount, value.currency) ?? 0;
}
export function ownKrw(value: ExpenseInput): number | null {
  if (value.currency === "KRW") return ownMinor(value);
  if (value.krwAmount === null) return null;
  const total = toMinor(value.krwAmount, "KRW");
  const paid = toMinor(value.paidAmount, value.currency) ?? 0;
  if (!value.shared) return total;
  if (total === null) return null;
  if (paid === 0) return 0;
  // 비율을 먼저 소수로 만들지 않고 정수 나눗셈에서 반올림합니다.
  const numerator = BigInt(total) * BigInt(ownMinor(value));
  return Number((numerator * BigInt(2) + BigInt(paid)) / (BigInt(paid) * BigInt(2)));
}
export function appearsOnDay(value: ExpenseInput, date: string): boolean {
  return bookDate(value.paymentDate, value.time) === date || (value.useKind === "once" && bookDate(value.useDate, value.useTime) === date);
}
// 이용일에는 이용 시각을, 결제 기록으로만 나타난 날에는 결제 시각을 씁니다.
export function dayTime(value: ExpenseInput, date: string): string | null {
  return value.useKind === "once" && bookDate(value.useDate, value.useTime) === date ? value.useTime ?? null : value.time;
}
export function expenseOrderReferences(values: readonly Expense[], value: ExpenseInput, id?: string) {
  const date = bookDate(value.useDate, value.useTime);
  return dailyExpenses(values, date).filter(e => e.id !== id);
}
export function dailyExpenses(values: readonly Expense[], date: string): Expense[] {
  const sorted = values.filter((value) => appearsOnDay(value, date)).sort((a, b) => {
    const left = dayTime(a, date), right = dayTime(b, date);
    if (left !== right) return bookTimeOrder(left) - bookTimeOrder(right);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
  return orderAroundReferences(sorted, (e) => dayTime(e, date) === null ? e.orderReference : null, (e) => e.orderSide);
}
// 시각을 만들어 채우지 않고, 알려진 기준 거래 주변에 표시 순서만 배치합니다.
export function orderAroundReferences<T extends { id: string }>(rows: T[], reference: (row: T) => string | null, side: (row: T) => "before" | "after"): T[] {
  const ids = new Set(rows.map((r) => r.id)), visited = new Set<string>(), result: T[] = [];
  const children = new Map<string, T[]>();
  for (const row of rows) { const parent = reference(row); if (parent && parent !== row.id && ids.has(parent)) children.set(parent, [...children.get(parent) ?? [], row]); }
  function visit(row: T) { if (visited.has(row.id)) return; visited.add(row.id); const nested = children.get(row.id) ?? []; nested.filter((r) => side(r) === "before").forEach(visit); result.push(row); nested.filter((r) => side(r) === "after").forEach(visit); }
  rows.filter((r) => !reference(r) || !ids.has(reference(r)!) || reference(r) === r.id).forEach(visit);
  rows.forEach(visit);
  return result;
}
export function daySummary(values: Expense[], date: string) {
  const consumption = values.filter((value) => value.useKind === "once" && bookDate(value.useDate, value.useTime) === date);
  return { total: consumption.reduce((sum, value) => sum + (ownKrw(value) ?? 0), 0), pending: consumption.filter((value) => ownKrw(value) === null).length };
}
export function monthAmount(value: ExpenseInput, month: string): number | null | undefined {
  const start = (value.useKind === "once" ? bookDate(value.useDate, value.useTime) : value.useDate).slice(0, 7);
  if (value.useKind === "once" || value.allocation === "start") return start === month ? ownKrw(value) : undefined;
  const [year, m] = month.split("-").map(Number);
  const [sy, sm] = start.split("-").map(Number);
  const offset = (year - sy) * 12 + m - sm;
  if (offset < 0 || offset > 11) return undefined;
  const amount = ownKrw(value);
  return amount === null ? null : Math.floor(amount / 12) + (offset === 0 ? amount % 12 : 0);
}

export function followsPaymentDate(value: ExpenseInput): boolean {
  return value.useDateFollowsPayment ?? value.useDate === value.paymentDate;
}
export function followsPaymentTime(value: ExpenseInput): boolean {
  return value.useTimeFollowsPayment ?? value.useTime === value.time;
}
export function changeExpenseTime(value: ExpenseInput, field: "time" | "useTime", time: string | null): ExpenseInput {
  if (field === "useTime") return { ...value, useTime: time, useTimeFollowsPayment: false };
  const follows = followsPaymentTime(value);
  return { ...value, time, useTime: follows ? time : value.useTime, useTimeFollowsPayment: follows };
}
export function changeExpenseDate(value: ExpenseInput, field: "paymentDate" | "useDate", date: string): ExpenseInput {
  if (field === "useDate") return { ...value, useDate: date, useDateFollowsPayment: false };
  const follows = followsPaymentDate(value);
  return { ...value, paymentDate: date, useDate: follows ? date : value.useDate, useDateFollowsPayment: follows };
}
