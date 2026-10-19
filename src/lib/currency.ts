import { z } from "zod";

export const currencies = {
  KRW: { label: "원 · KRW", unit: "원", digits: 0 },
  USD: { label: "미국 달러 · USD", unit: "USD", digits: 2 },
  EUR: { label: "유로 · EUR", unit: "EUR", digits: 2 },
  JPY: { label: "일본 엔 · JPY", unit: "JPY", digits: 0 },
  MCASH: { label: "M캐시", unit: "M캐시", digits: 0 },
  RC: { label: "로얄 크리스탈", unit: "RC", digits: 0 },
} as const;
// 사용자 재화는 이름을 안정적인 단위 식별자로 사용한다. 재화 수량은 정수다.
export const currencySchema = z.string().min(1).max(40).refine(v => Object.hasOwn(currencies, v) || /^[^\s:][^:]*$/.test(v), "통화·재화를 확인해 주세요.");
export function isCustomCurrency(code: string) { return !Object.hasOwn(currencies, code); }
export type Currency = z.infer<typeof currencySchema>;
export function currencyInfo(currency: Currency): { label: string; unit: string; digits: number } {
  if (Object.hasOwn(currencies, currency)) return currencies[currency as keyof typeof currencies];
  return { label: currency, unit: currency, digits: 0 };
}
export const gameCurrencyInputSchema = z.object({
  code: currencySchema.refine(v => v === "MCASH" || v === "RC" || isCustomCurrency(v), "게임 재화만 정의할 수 있어요."),
  fixedRate: z.string().regex(/^\d{1,9}(?:\.\d{1,8})?$/, "고정 환율은 정수 9자리·소수 8자리까지 입력해 주세요."),
});
export const gameCurrencySchema = gameCurrencyInputSchema.extend({ revision: z.number().int().positive() });
export type GameCurrency = z.infer<typeof gameCurrencySchema>;
export function currencyOptions(definitions: readonly GameCurrency[] = []) {
  return { ...currencies, ...Object.fromEntries(definitions.map(d => [d.code, currencyInfo(d.code)])) };
}
