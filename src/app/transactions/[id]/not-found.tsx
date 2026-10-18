import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function TransactionNotFound() {
  return <section className="book-sheet rounded-3xl bg-card px-6 py-14 text-center">
    <BookOpen aria-hidden="true" className="mx-auto mb-5 text-primary" size={32} />
    <h1 className="text-xl font-semibold">거래를 찾을 수 없어요</h1>
    <p className="mt-3 text-sm text-muted-foreground">주소가 올바른지 확인하거나 일일 내역에서 다시 선택해 주세요.</p>
    <Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm font-medium text-primary hover:bg-accent"><ArrowLeft size={16} />일일 내역으로</Link>
  </section>;
}
