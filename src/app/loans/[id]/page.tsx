import { LoanBook } from "@/components/loan-book";

export const metadata = { title: "대출 상세 · 머니북" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LoanBook id={id} />;
}
