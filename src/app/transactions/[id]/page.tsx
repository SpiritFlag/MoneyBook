import { ExpenseView } from "@/components/expense-view";
export const dynamic = "force-dynamic";
export const metadata = { title: "거래 상세 · 머니북" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ExpenseView id={(await params).id} />;
}
