import { z } from "zod";

export const currencies = {
  KRW: { label: "원 · KRW", unit: "원", digits: 0 },
  USD: { label: "미국 달러 · USD", unit: "USD", digits: 2 },
  EUR: { label: "유로 · EUR", unit: "EUR", digits: 2 },
  JPY: { label: "일본 엔 · JPY", unit: "JPY", digits: 0 },
  MCASH: { label: "M캐시", unit: "M캐시", digits: 0 },
  RC: { label: "로얄 크리스탈", unit: "RC", digits: 0 },
} as const;
// 재화 코드는 연결을 위한 고정 식별자이며 명칭·표시 약어는 별도로 수정한다.
export const currencySchema = z.string().min(1).max(40).refine(v => Object.hasOwn(currencies, v) || /^[^\s:][^:]*$/.test(v), "통화·재화를 확인해 주세요.");
export function isCustomCurrency(code: string) { return !Object.hasOwn(currencies, code); }
export type Currency = z.infer<typeof currencySchema>;
export function currencyInfo(currency: Currency, definitions: readonly GameCurrency[] = []): { label: string; unit: string; digits: number } {
  const base = Object.hasOwn(currencies, currency) ? currencies[currency as keyof typeof currencies] : { label: currency, unit: currency, digits: 0 };
  const definition = definitions.find(d => d.code === currency);
  const name = definition?.name ?? base.label;
  const unit = definition?.unit ?? base.unit;
  return { label: name === unit ? name : `${name} · ${unit}`, unit, digits: base.digits };
}
export const gameCurrencyInputSchema = z.object({
  code: currencySchema.refine(v => v === "MCASH" || v === "RC" || isCustomCurrency(v), "게임 재화만 정의할 수 있어요."),
  name: z.string().trim().min(1, "게임 재화 명칭을 입력해 주세요.").max(60).optional(),
  unit: z.string().trim().min(1, "표시 약어를 입력해 주세요.").max(20).optional(),
  fixedRate: z.string().regex(/^\d{1,9}(?:\.\d{1,8})?$/, "고정 환율은 정수 9자리·소수 8자리까지 입력해 주세요."),
});
export const gameCurrencySchema = gameCurrencyInputSchema.extend({ revision: z.number().int().positive() });
export type GameCurrency = z.infer<typeof gameCurrencySchema>;
export function currencyOptions(definitions: readonly GameCurrency[] = []): Record<string, { label: string; unit: string; digits: number }> {
  return { ...currencies, ...Object.fromEntries(definitions.map(d => [d.code, currencyInfo(d.code, definitions)])) };
}
