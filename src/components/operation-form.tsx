"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { mutate } from "swr";
import { Button } from "./ui/button";
import { Field } from "./form-fields";
import {
  TransferEditor,
  JourneyEditor,
  AllocationEditor,
  StatementEditor,
  PaymentEditor,
  AssetSelect,
  MoneyField,
  DateTimeFields,
} from "./operation-editors";
import {
  newOperation,
  newRow,
  operationLabels,
  operationInputSchema,
  type OperationKind,
  type OperationInput,
  type Operation,
  type BookData,
} from "@/lib/operations";
import { currencies, expenseInputSchema, type Currency } from "@/lib/expense";
import { saveOperation, operationsKey } from "@/lib/use-operations";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

export function OperationForm({
  kind,
  date,
  book,
  existing,
  source = "",
}: {
  kind: OperationKind;
  date: string;
  book: BookData;
  existing?: Operation;
  source?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<OperationInput>(() => {
    if (existing) return structuredClone(existing);
    const next = newOperation(kind, date);
    if (["transfer", "transit", "toll"].includes(kind))
      next.rows = [newRow(date, "first")];
    if (["recovery", "insurance", "toll-payment"].includes(kind))
      next.allocations = [
        { targetId: source, itemId: "", amount: "0", deductible: "0" },
      ];
    next.sourceId = source;
    const expense = book.expenses.find((e) => e.id === source);
    if (expense && kind === "template") {
      next.template = expenseInputSchema.parse(expense);
      next.title = expense.title;
    }
    if (expense && kind === "cancel") {
      next.title = `${expense.title} 취소`;
      next.amount =
        expense.currency === "KRW"
          ? expense.paidAmount
          : (expense.krwAmount ?? "0");
    }
    return next;
  });
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(existing?.id ?? ""),
    submitting = useRef(false);
  useUnsavedChanges(dirty);
  function change(next: OperationInput) {
    setValue(next);
    setDirty(true);
    setError("");
  }
  const editor = { value, change, book, id: existing?.id };
  return (
    <>
      <header className="mb-7">
        <Link href="/" className="text-sm text-muted-foreground">
          ← 장부로
        </Link>
        <h1 className="mt-5 text-3xl font-bold">
          {operationLabels[kind]} {existing ? "수정" : "기록"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          금액과 맥락을 함께 남기고, 연결된 원장에서 확인하세요.
        </p>
      </header>
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          const parsed = operationInputSchema.safeParse(value);
          if (!parsed.success) {
            setError(
              parsed.error.issues
                .map((i) => i.message)
                .slice(0, 3)
                .join(" "),
            );
            return;
          }
          submitting.current = true;
          setBusy(true);
          setError("");
          if (!requestId.current) requestId.current = crypto.randomUUID();
          try {
            await mutate(
              operationsKey,
              saveOperation(requestId.current, parsed.data, existing?.revision),
              { revalidate: false },
            );
            setDirty(false);
            router.push(`/records/${requestId.current}?saved=1`);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "저장하지 못했어요.",
            );
          } finally {
            submitting.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-6">
          <section className="book-sheet space-y-5 rounded-3xl bg-card p-5 sm:p-8">
            <Field label="기록 이름">
              <input
                className="form-control"
                value={value.title}
                maxLength={120}
                onChange={(e) => change({ ...value, title: e.target.value })}
              />
            </Field>
            {kind !== "template" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DateTimeFields
                  date={value.date}
                  time={value.time}
                  onDate={(date) =>
                    change({
                      ...value,
                      date,
                      rows:
                        kind === "transit"
                          ? value.rows.map((r) => ({ ...r, date }))
                          : value.rows,
                    })
                  }
                  onTime={(time) => change({ ...value, time })}
                />
                {kind !== "transfer" ? (
                  <MoneyField
                    label={
                      kind === "statement"
                        ? "명세서 청구 총액 · 원"
                        : "실제 총액"
                    }
                    value={value.amount}
                    onChange={(amount) => change({ ...value, amount })}
                  />
                ) : null}
                {["income", "recovery"].includes(kind) ? (
                  <Field label="통화">
                    <select
                      className="form-control"
                      value={value.currency}
                      onChange={(e) =>
                        change({
                          ...value,
                          currency: e.target.value as Currency,
                          assetId: "",
                        })
                      }
                    >
                      {Object.entries(currencies).map(([key, c]) => (
                        <option key={key} value={key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {["income", "recovery", "insurance", "toll-payment"].includes(
                  kind,
                ) ? (
                  <AssetSelect
                    label={kind === "toll-payment" ? "출금 자산" : "입금 자산"}
                    value={value.assetId}
                    onChange={(assetId) => change({ ...value, assetId })}
                    currency={value.currency}
                    book={book}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                원거래의 명세를 보관해요. 불러올 때 새 날짜로 시작하며 저장
                전까지 거래가 생기지 않아요.
              </p>
            )}
          </section>
          <section className="book-sheet space-y-6 rounded-3xl bg-card p-5 sm:p-8">
            {kind === "transfer" ? <TransferEditor {...editor} /> : null}
            {kind === "transit" || kind === "toll" ? (
              <JourneyEditor {...editor} />
            ) : null}
            {["recovery", "insurance", "toll-payment"].includes(kind) ? (
              <AllocationEditor {...editor} />
            ) : null}
            {kind === "statement" ? <StatementEditor {...editor} /> : null}
            {kind === "cancel" ? (
              <div className="space-y-5">
                <Field label="취소할 카드 거래">
                  <select
                    className="form-control"
                    value={value.sourceId}
                    onChange={(e) => {
                      const item = book.expenses.find(
                        (x) => x.id === e.target.value,
                      );
                      change({
                        ...value,
                        sourceId: e.target.value,
                        amount: item
                          ? item.currency === "KRW"
                            ? item.paidAmount
                            : (item.krwAmount ?? "0")
                          : "0",
                      });
                    }}
                  >
                    <option value="">원거래 선택</option>
                    {book.expenses
                      .filter((e) => e.paymentKind === "card")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} · {e.paymentMethod}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="취소금 처리">
                  <select
                    className="form-control"
                    value={value.cancelRoute}
                    onChange={(e) =>
                      change({
                        ...value,
                        cancelRoute: e.target
                          .value as OperationInput["cancelRoute"],
                        payment: null,
                      })
                    }
                  >
                    <option value="exclude">
                      검증 전 · 청구 대상에서 제외
                    </option>
                    <option value="credit">
                      납부 후 · 다음 명세서에서 차감
                    </option>
                    <option value="refund">납부 후 · 계좌로 환급</option>
                  </select>
                </Field>
                {value.cancelRoute === "credit" ? (
                  <Field label="취소전표 반영 월">
                    <input
                      type="month"
                      className="form-control"
                      value={value.month}
                      onChange={(e) =>
                        change({ ...value, month: e.target.value })
                      }
                    />
                  </Field>
                ) : null}
                {value.cancelRoute === "refund" ? (
                  <PaymentEditor {...editor} />
                ) : null}
                <p className="text-xs leading-6 text-muted-foreground">
                  전액 취소만 지원해요. 원거래는 보존하고 소비 반영만 취소해요.
                  충전·이동 내역은 별도로 유지돼요.
                </p>
              </div>
            ) : null}
            {kind === "template" ? (
              <Field label="저장할 원거래">
                <select
                  className="form-control"
                  value={value.sourceId}
                  onChange={(e) => {
                    const item = book.expenses.find(
                      (x) => x.id === e.target.value,
                    );
                    change({
                      ...value,
                      sourceId: e.target.value,
                      template: item ? expenseInputSchema.parse(item) : null,
                    });
                  }}
                >
                  <option value="">거래 선택</option>
                  {book.expenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="메모">
              <textarea
                className="form-control min-h-24"
                maxLength={2000}
                value={value.memo}
                onChange={(e) => change({ ...value, memo: e.target.value })}
              />
            </Field>
          </section>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit">{busy ? "저장 중…" : "기록 저장"}</Button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
