import { z } from "zod";
export const cardInputSchema = z.object({
  name: z.string().trim().min(1, "카드 이름을 입력해 주세요.").max(80),
  issuer: z.string().trim().max(80),
});
export const cardSchema = cardInputSchema.extend({ id: z.string().uuid(), createdAt: z.string(), revision: z.number().int().positive().default(1) });
export type CardInput = z.infer<typeof cardInputSchema>;
export type Card = z.infer<typeof cardSchema>;
