import { z } from "zod";
import { expenseSchema } from "./expense";
import { operationSchema } from "./operations";

export const trashEntrySchema = z.object({
  id: z.string().min(1),
  deletedAt: z.string().datetime(),
  expenses: z.array(expenseSchema),
  operations: z.array(operationSchema),
});
export type TrashEntry = z.infer<typeof trashEntrySchema>;
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const trashExpiresAt = (entry: TrashEntry) => new Date(Date.parse(entry.deletedAt) + TRASH_RETENTION_MS);
export const retainedTrash = (entries: TrashEntry[], now = Date.now()) => entries.filter(entry => trashExpiresAt(entry).getTime() > now);
