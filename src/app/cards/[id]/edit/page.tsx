import { CardEdit } from "@/components/card-edit";
export const metadata = { title: "신용카드 수정 · 머니북" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <CardEdit id={(await params).id} />; }
