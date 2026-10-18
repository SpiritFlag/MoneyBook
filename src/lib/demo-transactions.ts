export type Transaction = {
  id: string;
  date: string;
  title: string;
  category: "food" | "transport" | "goods";
  paymentMethod: string;
  paidAmount: number;
  personalAmount: number;
  time: string | null;
};

export const categories = {
  food: { label: "식비", image: "/characters/expense_food.png" },
  transport: { label: "교통", image: "/characters/expense_transport.png" },
  goods: { label: "생활용품", image: "/characters/expense_goods.png" },
} satisfies Record<Transaction["category"], { label: string; image: string }>;

// 모두 새로 만든 가상 예시입니다. 이름·금액·카테고리를 바꾸며 화면을 실험해 보세요.
export const demoTransactions: readonly Transaction[] = [
  { id: "demo-1", date: "2026-10-18", title: "동네 식당에서 점심", category: "food", paymentMethod: "예시 카드", paidAmount: 24000, personalAmount: 12000, time: "12:30" },
  { id: "demo-2", date: "2026-10-18", title: "오후의 커피", category: "food", paymentMethod: "예시 체크카드", paidAmount: 4500, personalAmount: 4500, time: "14:10" },
  { id: "demo-3", date: "2026-10-18", title: "주방 수세미", category: "goods", paymentMethod: "예시 계좌", paidAmount: 3000, personalAmount: 3000, time: null },
  { id: "demo-4", date: "2026-10-17", title: "집으로 오는 버스", category: "transport", paymentMethod: "예시 교통카드", paidAmount: 1500, personalAmount: 1500, time: "18:20" },
];

// 추후 인증된 조회로 교체할 경계입니다. 지금은 DB 요청이나 조회 캐시가 없습니다.
export function getDailyTransactions(date: string): readonly Transaction[] {
  return demoTransactions.filter((transaction) => transaction.date === date);
}

export function getTransaction(id: string): Transaction | undefined {
  return demoTransactions.find((transaction) => transaction.id === id);
}

export function sumPersonalSpending(transactions: readonly Transaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.personalAmount, 0);
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
