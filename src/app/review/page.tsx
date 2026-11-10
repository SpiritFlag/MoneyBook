import type { Metadata } from "next";
import { ReviewBook } from "@/components/review-book";

export const metadata: Metadata = { title: "정리할 일 · 머니북" };

export default function Page() {
  return <ReviewBook />;
}
