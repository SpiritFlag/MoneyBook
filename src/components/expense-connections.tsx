"use client";
import { useBook } from "@/lib/use-operations";
import { toMinor, type ExpenseInput } from "@/lib/expense";
import { dailyOrderReferences } from "@/lib/daily-records";
import { valueInWon } from "@/lib/asset";
import { Field } from "./form-fields";
import { Button } from "./ui/button";
export function ExpenseConnections({
  value,
  change,
  id,
}: {
  value: ExpenseInput;
  change: (v: ExpenseInput) => void;
  id?: string;
}) {
  const { data: book, error, retry } = useBook();
  if (error)
    return (
      <p className="text-sm text-red-800">
        연결할 기록을 읽지 못했어요.{" "}
        <button type="button" onClick={retry}>
          다시 시도
        </button>
      </p>
    );
  if (!book)
    return (
      <p className="text-xs text-muted-foreground">연결 기록을 읽는 중…</p>
    );
  const rates = book.operations
    .filter((o) => o.kind === "transfer")
    .flatMap((o) =>
      o.rows
        .filter((r) => r.toId === value.assetId && r.rate !== "")
        .map((r) => ({
          id: `${o.id}/${r.id}`,
          title: `${o.title} · ${r.name || "충전"} · ${r.rate}원`,
          rate: r.rate,
        })),
    );
  const reference = dailyOrderReferences(book, value, id);
  const fixedCurrency = book.gameCurrencies?.find(c => c.code === value.currency);
  return (
    <div className="mt-5 space-y-5">
      {value.useKind === "once" && value.useTime === null ? (
        <div className="grid gap-4 rounded-xl bg-background/70 p-4 sm:grid-cols-[1fr_8rem]">
          <Field
            label="시각 미확인 · 순서 기준 거래"
            hint="기준 거래의 시각 부근에 정렬해요. 실제 시각은 미확인으로 유지해요."
          >
            <select
              className="form-control"
              value={value.orderReference ?? ""}
              onChange={(e) =>
                change({ ...value, orderReference: e.target.value || null })
              }
            >
              <option value="">기본 순서 · 시각 확인 거래 다음</option>
              {reference.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.time ?? "시각 미확인"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="배치 위치">
            <select
              className="form-control"
              value={value.orderSide}
              onChange={(e) =>
                change({
                  ...value,
                  orderSide: e.target.value as "before" | "after",
                })
              }
            >
              <option value="before">기준 시각 이전</option>
              <option value="after">기준 시각 이후</option>
            </select>
          </Field>
        </div>
      ) : null}
      {value.currency !== "KRW" &&
      !fixedCurrency &&
      value.paymentKind !== "card" &&
      rates.length ? (
        <Field
          label="연결된 충전의 평가 기준 불러오기"
          hint="선택한 환율과 소비 원화액을 이 거래에 복사해 고정해요."
        >
          <select
            className="form-control"
            value={value.valuationSource ?? ""}
            onChange={(e) => {
              const rate = rates.find((r) => r.id === e.target.value);
              const amount = toMinor(value.paidAmount, value.currency);
              const won =
                rate && amount !== null
                  ? valueInWon(amount, value.currency, rate.rate)
                  : null;
              if (rate && won !== null)
                change({
                  ...value,
                  valuationSource: rate.id,
                  valuationRate: rate.rate,
                  krwAmount: String(won),
                });
            }}
          >
            <option value="">평가 기준 선택</option>
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {!fixedCurrency && value.valuationRate !== null ? (
        <div className="rounded-xl bg-secondary/50 p-4 text-xs leading-6">
          고정한 평가 환율 · 1 {value.currency} = {value.valuationRate}원. 금액
          변경 시 원화 확정액도 확인하세요.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const amount = toMinor(value.paidAmount, value.currency);
              const won =
                amount === null
                  ? null
                  : valueInWon(amount, value.currency, value.valuationRate);
              if (won !== null) change({ ...value, krwAmount: String(won) });
            }}
          >
            고정 환율로 금액 다시 계산
          </Button>
        </div>
      ) : null}
    </div>
  );
}
