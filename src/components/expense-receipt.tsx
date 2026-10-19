import { formatMoney, formatMinor, toMinor, type ExpenseInput } from "@/lib/expense";
import { ReceiptSummary } from "./receipt-summary";

export function ExpenseReceipt({ expense }: { expense: ExpenseInput }) {
  return <section aria-label="상품과 할인 명세" className="expense-receipt">
    <h2 className="sr-only">상품과 명세</h2>
    {expense.items.length || expense.adjustments.length ? <ul className="receipt-timeline">
      {expense.items.map(item => <li key={item.id} className="receipt-root">
        <div className="receipt-line"><div className="min-w-0"><p className="break-words font-medium">{item.name}</p>{item.quantity !== 1 ? <p className="mt-1 text-xs text-muted-foreground">{formatMoney(item.unitPrice, expense.receiptCurrency)} × {item.quantity}</p> : null}</div><span className="receipt-amount">{formatMinor((toMinor(item.unitPrice, expense.receiptCurrency) ?? 0) * item.quantity, expense.receiptCurrency)}</span></div>
        {item.discounts.length ? <ul className="receipt-branches">{item.discounts.map(discount => <li key={discount.id}><div className="receipt-line"><span className="min-w-0 break-words">{discount.name}</span><span className="receipt-amount">−{formatMoney(discount.amount, expense.receiptCurrency)}</span></div></li>)}</ul> : null}
      </li>)}
      {expense.adjustments.map(line => <li key={line.id} className={`receipt-root ${line.kind === "discount" ? "receipt-discount" : ""}`}><div className="receipt-line"><span className="min-w-0 break-words">{line.name}</span><span className="receipt-amount">{line.kind === "discount" ? "−" : "+"}{formatMoney(line.amount, expense.receiptCurrency)}</span></div></li>)}
    </ul> : <p className="py-4 text-sm text-muted-foreground">아직 상품 명세가 없어요. 총액만 기록한 거래예요.</p>}
    <div className="mt-7"><ReceiptSummary expense={expense} compact /></div>
  </section>;
}
