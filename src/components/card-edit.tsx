"use client";
import Link from "next/link";
import { useCards } from "@/lib/use-cards";
import { CardForm } from "./card-form";
import { LedgerState } from "./ledger-state";
export function CardEdit({ id }: { id: string }) {
  const { data, error, mutate } = useCards();
  if (!data || error) return <LedgerState error={error} retry={() => { void mutate(); }} />;
  const card = data.find(c => c.id === id);
  if (!card) return <div><p>수정할 카드를 찾을 수 없어요.</p><Link href="/cards">카드 관리로</Link></div>;
  return <CardForm key={card.id} existing={card} />;
}
