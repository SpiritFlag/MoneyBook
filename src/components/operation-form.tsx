"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSWRConfig } from "swr";
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
  incomeCategories,
  changeOperationDate,
  newRow,
  operationLabels,
  operationInputSchema,
  remainingCardAmount,
  type OperationKind,
  type OperationInput,
  type Operation,
  type BookData,
} from "@/lib/operations";
import { expenseInputSchema, type Currency } from "@/lib/expense";
import { saveOperation, operationsKey } from "@/lib/use-operations";
import { ledgerKey } from "@/lib/use-expenses";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { newTransitLeg } from "@/lib/transit";
import { defaultTransitAsset } from "@/lib/transit-assets";
import { normalizeTransitOperation } from "@/lib/operations";
import { TransitEditor } from "./transit-editor";
import { formatMoney } from "@/lib/expense";

export function OperationForm({
  kind,
  date,
  book,
  existing,
  source = "",
  initialStatement,
}: {
  kind: OperationKind;
  date: string;
  book: BookData;
  existing?: Operation;
  source?: string;
  initialStatement?: { card: string; start: string | null; end: string | null };
}) {
  const { mutate } = useSWRConfig();
  const currencyDefinitions = useCurrencies();
  const currencies = currencyDefinitions.options;
  const router = useRouter();
  const [value, setValue] = useState<OperationInput>(() => {
    if (existing) return { ...structuredClone(existing), ...(kind === "cancel" ? { sourceRevision: book.expenses.find(e => e.id === existing.sourceId)?.revision } : {}) };
    const next = newOperation(kind, date);
    if (kind === "statement" && initialStatement) {
      next.card = initialStatement.card;
      if (initialStatement.start) next.start = initialStatement.start;
      if (initialStatement.end) next.end = initialStatement.end;
    }
    if (kind === "transit") { next.journey = [newTransitLeg("first")]; next.assetId = defaultTransitAsset(book.assets, book.operations); }
    if (["transfer", "transit", "toll"].includes(kind))
      next.rows = [newRow(date, "first")];
    if (["recovery", "insurance"].includes(kind))
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
      next.cancelScope = "full";
      next.sourceRevision = expense.revision;
      next.amount = String(remainingCardAmount(expense, book.operations) ?? 0);
      const billed = book.operations.find(o => o.kind === "statement" && o.verified && o.payment && o.selected.includes(expense.id));
      if (billed) {
        next.cancelRoute = "credit";
        const [year, month] = (billed.month > date.slice(0, 7) ? billed.month : date.slice(0, 7)).split("-").map(Number);
        next.month = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
      }
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
    setValue(normalizeTransitOperation(next));
    setDirty(true);
    setError("");
  }
  const editor = { value, change, book, id: existing?.id };
  const cancelExpense = book.expenses.find(e => e.id === value.sourceId);
  const cancelRemaining = cancelExpense ? remainingCardAmount(cancelExpense, book.operations.filter(o => o.id !== existing?.id)) : null;
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
          실제 달력 날짜·시각을 입력하세요. 05시 전 기록은 전날의 하루 내역에 표시돼요.
        </p>
      </header>
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const draft = kind === "statement" && submitter instanceof HTMLButtonElement && submitter.value === "draft";
          const parsed = operationInputSchema.safeParse(normalizeTransitOperation(
            draft ? { ...value, verified: false, payment: null } : kind === "cancel" ? { ...value, amount: value.cancelScope === "full" ? String(cancelRemaining ?? 0) : value.amount } : value,
          ));
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
            if (kind === "cancel") await mutate(ledgerKey);
            router.push(kind === "cancel" && value.cancelScope === "full" && value.cancelRoute === "exclude" ? "/cards" : `/records/${requestId.current}?saved=1`);
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
              <input lang="ko" inputMode="text"
                className="form-control"
                value={value.title}
                maxLength={120}
                onChange={(e) => change({ ...value, title: e.target.value })}
              />
            </Field>
            {kind !== "template" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {kind === "transit" && value.journey !== undefined ? <Field label="이용일"><input type="date" className="form-control" value={value.date} onChange={e => change(changeOperationDate(value, e.target.value))} /></Field> : <DateTimeFields
                  date={value.date}
                  time={value.time}
                  onDate={(date) => change(changeOperationDate(value, date))}
                  onTime={(time) => change({ ...value, time })}
                />}
                {kind === "transit" && value.journey !== undefined ? <p className="self-end pb-3 text-sm font-semibold">교통비 합계 {formatMoney(value.amount, "KRW")} · 운임에서 자동 계산</p> : kind === "toll-payment" ? <p className="self-end pb-3 text-sm font-semibold" aria-live="polite">출금 합계 {formatMoney(value.amount, "KRW")} · 체크한 이용에서 자동 계산</p> : kind !== "transfer" && kind !== "cancel" ? (
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
                {kind === "income" ? <Field label="수입 종류"><select className="form-control" value={value.incomeCategory} onChange={e => change({ ...value, incomeCategory: e.target.value as OperationInput["incomeCategory"] })}>{Object.entries(incomeCategories).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}</select>{value.incomeCategory === "loan" ? <p className="mt-2 text-xs leading-6 text-primary">대출금 입금은 자산 원장에 반영하고 수입 집계에서 제외해요.</p> : null}</Field> : null}
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
            {kind === "transit" && value.journey !== undefined ? <TransitEditor {...editor} /> : null}
            {(kind === "transit" && value.journey === undefined) || kind === "toll" ? (
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
                    disabled={!!existing}
                    onChange={(e) => {
                      const item = book.expenses.find(
                        (x) => x.id === e.target.value,
                      );
                      const billed = book.operations.find(o => o.kind === "statement" && o.verified && o.payment && o.selected.includes(e.target.value));
                      const currentMonth = value.date.slice(0, 7) || date.slice(0, 7);
                      const [year, month] = (billed && billed.month > currentMonth ? billed.month : currentMonth).split("-").map(Number);
                      change({
                        ...value,
                        sourceId: e.target.value,
                        cancelScope: "full",
                        sourceRevision: item?.revision,
                        amount: item ? String(remainingCardAmount(item, book.operations) ?? 0) : "0",
                        cancelRoute: billed ? "credit" : "exclude",
                        month: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7),
                        payment: null,
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
                <Field label="취소 범위">
                  <select className="form-control" value={value.cancelScope ?? "full"} disabled={!!existing} onChange={e => change({ ...value, cancelScope: e.target.value as "full" | "partial", amount: String(cancelRemaining ?? 0) })}>
                    <option value="full">전액 취소 · 남은 금액 전체</option>
                    <option value="partial">부분 취소</option>
                  </select>
                </Field>
                <p className="text-sm text-muted-foreground">취소 가능 금액 {cancelRemaining === null ? "원화 확정 필요" : formatMoney(String(cancelRemaining), "KRW")}</p>
                {value.cancelScope === "partial" ? <MoneyField label="취소금액 (원)" value={value.amount} onChange={amount => change({ ...value, amount })} /> : null}
                {value.cancelScope === "partial" && cancelExpense?.shared ? <p className="text-xs text-muted-foreground">공동 지출의 소비 차감은 기존 본인 부담 비율을 적용해요. 이미 회수한 분담금은 자동으로 반환하지 않아요.</p> : null}
                <Field label="취소금 처리">
                  <select
                    className="form-control"
                    value={value.cancelRoute}
                    disabled={!!existing}
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
                      대금 출금 전 · 해당 명세서 조정
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
                  대금 출금 전 전액 취소는 지출을 삭제해요. 부분 취소와 출금 후 취소는 원래 날짜의 소비에서 차감해요. 출금 후에는 기존 납부를 유지하고 지정한 다음 명세서에 취소매출을 반영해요. 충전·이동 내역은 별도로 유지돼요.
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
              <textarea lang="ko" inputMode="text"
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
          {kind === "statement" && !value.payment ? <p className="text-sm text-muted-foreground">금액이 맞지 않거나 대조가 덜 끝나도 임시저장할 수 있어요. 저장한 내역은 카드 관리에서 이어서 대조하세요.</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            {kind === "statement" && !value.payment && !existing?.payment ? <Button type="submit" name="intent" value="draft" variant="outline">{busy ? "저장 중…" : "임시저장"}</Button> : null}
            <Button type="submit" disabled={kind === "statement" && !value.verified}>{busy ? "저장 중…" : kind === "cancel" && value.cancelScope === "full" && value.cancelRoute === "exclude" ? "전액 취소 · 지출 삭제" : kind === "statement" ? value.payment ? "납부 저장" : "검산 완료 저장" : "기록 저장"}</Button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
