"use client";
import Link from "next/link";
import useSWR from "swr";
import type { LoanSample, LoanSummary } from "@/lib/loan";
import { LoanList } from "./loan-list";
import { LoanDetail } from "./loan-detail";
import { LedgerState } from "./ledger-state";

async function readLoans(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.message ?? "대출을 불러오지 못했어요."), { status: response.status });
  return body;
}
export function LoanBook({ id }: { id?: string }) {
  const { data, error, mutate } = useSWR<LoanSample | LoanSummary[], Error & { status?: number }>(id ? `/api/loans/${encodeURIComponent(id)}` : "/api/loans", readLoans, { dedupingInterval: 30_000, focusThrottleInterval: 30_000, errorRetryCount: 2 });
  if (error?.status === 404) return <div className="book-sheet rounded-3xl bg-card p-10 text-center"><p>현재 계정에서 대출을 찾을 수 없어요.</p><Link href="/loans" className="mt-4 inline-block text-primary">대출 노트로 돌아가기</Link></div>;
  if (!data || error) return <LedgerState error={error} retry={() => { void mutate(); }} />;
  return Array.isArray(data) ? <LoanList loans={data} stored /> : <LoanDetail key={data.id} loan={data} stored />;
}
