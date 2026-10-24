import { LoanBook } from "@/components/loan-book";

export const metadata = { title: "대출 노트 · 머니북" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <LoanBook />;
}
