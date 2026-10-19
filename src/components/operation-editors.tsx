"use client";
import { Field } from "./form-fields";
import { Button } from "./ui/button";
import { currencies, formatMinor } from "@/lib/expense";
import { rateUnits, valueInWon } from "@/lib/asset";
import {
  newRow,
  transferOrderWarning,
  statementRows,
  sharedRemaining,
  tollRemaining,
  insuranceRecovered,
  type OperationInput,
  type BookData,
} from "@/lib/operations";
import { ownKrw, toMinor } from "@/lib/expense";
export type EditorProps = {
  value: OperationInput;
  change: (next: OperationInput) => void;
  book: BookData;
  id?: string;
};
export function AssetSelect({
  label,
  value,
  onChange,
  book,
  currency,
  kind,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  book: BookData;
  currency?: string;
  kind?: string;
}) {
  return (
    <Field label={label}>
      <select
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">자산 선택</option>
        {book.assets
          .filter(
            (a) =>
              (!currency || a.currency === currency) &&
              (!kind || a.kind === kind),
          )
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="form-control"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function DateTimeFields({
  date,
  time,
  onDate,
  onTime,
}: {
  date: string;
  time: string | null;
  onDate: (v: string) => void;
  onTime: (v: string | null) => void;
}) {
  return (
    <>
      <Field label="날짜">
        <input
          type="date"
          className="form-control"
          value={date}
          min="1900-01-01"
          max="9999-12-31"
          onChange={(e) => onDate(e.target.value)}
        />
      </Field>
      <Field label="시각 (선택)">
        <input
          type="time"
          className="form-control"
          value={time ?? ""}
          onChange={(e) => onTime(e.target.value || null)}
        />
      </Field>
    </>
  );
}
export function TransferEditor({ value, change, book }: EditorProps) {
  return (
    <div className="space-y-5">
      {transferOrderWarning(value) ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">단계 번호와 날짜·시각 순서가 달라요. 자산 원장은 실제 날짜·시각순으로 계산하니 각 단계 날짜를 확인해 주세요.</p> : null}
      {value.rows.map((row, index) => {
        const from = book.assets.find((a) => a.id === row.fromId),
          to = book.assets.find((a) => a.id === row.toId);
        const patch = (next: Partial<typeof row>) =>
          change({
            ...value,
            rows: value.rows.map((r, i) =>
              i === index ? { ...r, ...next } : r,
            ),
          });
        const amount = to ? toMinor(row.received, to.currency) : null;
        const won =
          amount !== null && to && row.rate && rateUnits(row.rate) !== null
            ? valueInWon(amount, to.currency, row.rate)
            : null;
        return (
          <div key={row.id} className="rounded-2xl bg-background/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">이동 {index + 1}</h3>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  change({
                    ...value,
                    rows: value.rows.filter((r) => r.id !== row.id),
                  })
                }
              >
                단계 삭제
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`단계 ${index + 1} 이름`}>
                <input
                  className="form-control"
                  value={row.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="예: 생활비 이체, 재화 충전"
                />
              </Field>
              <div />
              <AssetSelect
                label={`출발 자산 ${index + 1}`}
                value={row.fromId}
                onChange={(fromId) => patch({ fromId })}
                book={book}
              />
              <AssetSelect
                label={`도착 자산 ${index + 1}`}
                value={row.toId}
                onChange={(toId) => patch({ toId })}
                book={book}
              />
              <MoneyField
                label={`실제 출금액 ${index + 1} · ${from?.currency ?? "출발 단위"}`}
                value={row.amount}
                onChange={(amount) => patch({ amount })}
              />
              <MoneyField
                label={`최종 수령량 ${index + 1} · ${to?.currency ?? "도착 단위"}`}
                value={row.received}
                onChange={(received) => patch({ received })}
              />
              <DateTimeFields
                date={row.date}
                time={row.time}
                onDate={(date) => patch({ date })}
                onTime={(time) => patch({ time })}
              />
            </div>
            <details
              className="mt-5"
              open={row.baseAmount !== "" || row.baseReceived !== ""}
            >
              <summary className="text-sm font-medium text-primary">
                환전·충전의 할인, 보너스, 평가 기준
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <MoneyField
                  label="기준 교환 금액"
                  value={row.baseAmount}
                  onChange={(baseAmount) => patch({ baseAmount })}
                />
                <MoneyField
                  label="포인트·쿠폰 할인"
                  value={row.discount}
                  onChange={(discount) => patch({ discount })}
                />
                <MoneyField
                  label="기본 수령량"
                  value={row.baseReceived}
                  onChange={(baseReceived) => patch({ baseReceived })}
                />
                <MoneyField
                  label="보너스 수령량"
                  value={row.bonus}
                  onChange={(bonus) => patch({ bonus })}
                />
                <MoneyField
                  label="평가 환율 · 도착 1단위당 원"
                  value={row.rate}
                  onChange={(rate) => patch({ rate })}
                  hint="출발 금액이 원화가 아니면 확인한 원화 평가 환율을 직접 입력하세요."
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    from?.currency !== "KRW" || !(Number(row.baseReceived) > 0)
                  }
                  onClick={() =>
                    patch({
                      rate: (Number(row.baseAmount) / Number(row.baseReceived))
                        .toFixed(8)
                        .replace(/\.?0+$/, ""),
                    })
                  }
                >
                  기준 금액 ÷ 기본 수령량 적용
                </Button>
              </div>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                할인은 기준 금액에서, 보너스는 기본 수령량에 반영해요. 실제 지급
                단가를 평가 환율로 자동 대체하지 않아요.
              </p>
              {won !== null ? (
                <p className="mt-3 text-sm text-primary">
                  최종 수령량의 평가액 {formatMinor(won, "KRW")}
                </p>
              ) : null}
            </details>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          change({
            ...value,
            rows: [...value.rows, newRow(value.rows.at(-1)?.date ?? value.date, crypto.randomUUID())],
          })
        }
      >
        이동 단계 추가
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        분기·합류도 단계별 자산을 선택해 기록해요. 단계 금액을 서로 다른
        통화끼리 합치지 않으며, 이동은 소비·수입에 더하지 않아요.
      </p>
    </div>
  );
}
export function JourneyEditor({ value, change, book }: EditorProps) {
  const transit = value.kind === "transit";
  const sum = value.rows.reduce(
    (s, r) => s + (toMinor(r.amount, "KRW") ?? 0),
    0,
  );
  return (
    <div className="space-y-5">
      {transit ? (
        <AssetSelect
          label="선불교통카드 자산"
          value={value.assetId}
          onChange={(assetId) => change({ ...value, assetId })}
          currency="KRW"
          kind="stored"
          book={book}
        />
      ) : null}
      {value.rows.map((row, index) => {
        const patch = (next: Partial<typeof row>) =>
          change({
            ...value,
            rows: value.rows.map((r, i) =>
              i === index ? { ...r, ...next } : r,
            ),
          });
        return (
          <div key={row.id} className="rounded-2xl bg-background/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {transit ? "여정 사건" : "기관별 청구"} {index + 1}
              </h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  change({
                    ...value,
                    rows: value.rows.filter((r) => r.id !== row.id),
                  })
                }
              >
                행 삭제
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={
                  transit ? `정류장·역 ${index + 1}` : `기관명 ${index + 1}`
                }
              >
                <input
                  className="form-control"
                  value={row.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              {transit ? (
                <>
                  <Field label="승하차·환승">
                    <select
                      className="form-control"
                      value={row.action}
                      onChange={(e) =>
                        patch({ action: e.target.value as typeof row.action })
                      }
                    >
                      <option value="board">승차</option>
                      <option value="alight">하차</option>
                      <option value="transfer">환승</option>
                    </select>
                  </Field>
                  <Field label="노선·구간">
                    <input
                      className="form-control"
                      value={row.route}
                      onChange={(e) => patch({ route: e.target.value })}
                    />
                  </Field>
                  <Field label="승하차 시각 (선택)">
                    <input
                      type="time"
                      className="form-control"
                      value={row.time ?? ""}
                      onChange={(e) => patch({ time: e.target.value || null })}
                    />
                  </Field>
                </>
              ) : null}
              <MoneyField
                label={`운임 ${index + 1} · 원`}
                value={row.amount}
                onChange={(amount) => patch({ amount })}
                hint={
                  transit
                    ? "하차·환승 시 실제 차감액. 0원도 사건으로 남겨요."
                    : "기관별 미정산액으로 기록해요."
                }
              />
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          change({
            ...value,
            rows: [...value.rows, newRow(value.date, crypto.randomUUID())],
          })
        }
      >
        {transit ? "승하차·환승 추가" : "기관 추가"}
      </Button>
      <div className="rounded-xl bg-secondary/50 p-4 text-sm">
        세부 합계 {formatMinor(sum, "KRW")} · 총액과 차이{" "}
        {formatMinor((toMinor(value.amount, "KRW") ?? 0) - sum, "KRW")}
        <Button
          className="ml-3"
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => change({ ...value, amount: String(sum) })}
        >
          세부 합계를 총액에 적용
        </Button>
      </div>
    </div>
  );
}
export function AllocationEditor({ value, change, book, id }: EditorProps) {
  const insurance = value.kind === "insurance",
    toll = value.kind === "toll-payment";
  const targets = toll
    ? book.operations
        .filter((o) => o.kind === "toll")
        .flatMap((o) =>
          o.rows.map((r) => ({
            id: `${o.id}/${r.id}`,
            title: `${o.title} · ${r.name}`,
            remaining: tollRemaining(o, r, book.operations, id),
            currency: "KRW" as const,
          })),
        )
    : book.expenses
        .filter((e) =>
          insurance
            ? e.category === "medical" && ownKrw(e) !== null
            : e.shared && e.currency === value.currency,
        )
        .map((e) => ({
          id: e.id,
          title: e.title,
          remaining: insurance
            ? (ownKrw(e) ?? 0) -
              insuranceRecovered(
                e.id,
                book.operations.filter((o) => o.id !== id),
              )
            : sharedRemaining(e, book.operations, id),
          currency: insurance ? ("KRW" as const) : e.currency,
        }));
  const sum = value.allocations.reduce(
    (s, a) => s + (toMinor(a.amount, value.currency) ?? 0),
    0,
  );
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {insurance
          ? "입금 한 건을 관련 의료비·상품에 직접 배분하세요. 자기부담금은 지급명세이며 소비를 추가하지 않아요."
          : toll
            ? "실제로 출금된 기관별 항목만 선택하세요. 미출금 기관은 그대로 남아요."
            : "입금 한 건에 여러 원지출을 연결할 수 있어요. 회수해도 원래 본인 소비는 유지돼요."}
      </p>
      {value.allocations.map((allocation, index) => {
        const patch = (next: Partial<typeof allocation>) =>
          change({
            ...value,
            allocations: value.allocations.map((a, i) =>
              i === index ? { ...a, ...next } : a,
            ),
          });
        const e = book.expenses.find((e) => e.id === allocation.targetId);
        return (
          <div key={index} className="rounded-2xl bg-background/70 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`정산 항목 ${index + 1}`}>
                <select
                  className="form-control"
                  value={allocation.targetId}
                  onChange={(event) =>
                    patch({ targetId: event.target.value, itemId: "" })
                  }
                >
                  <option value="">원거래 선택</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · 잔여 {formatMinor(t.remaining, t.currency)}
                    </option>
                  ))}
                </select>
              </Field>
              <MoneyField
                label={`귀속액 ${index + 1} · ${currencies[value.currency].unit}`}
                value={allocation.amount}
                onChange={(amount) => patch({ amount })}
              />
              {insurance ? (
                <>
                  <Field label="의료비 상품 (선택)">
                    <select
                      className="form-control"
                      value={allocation.itemId}
                      onChange={(event) =>
                        patch({ itemId: event.target.value })
                      }
                    >
                      <option value="">거래 전체</option>
                      {e?.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <MoneyField
                    label="자기부담금 · 원"
                    value={allocation.deductible}
                    onChange={(deductible) => patch({ deductible })}
                  />
                </>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() =>
                change({
                  ...value,
                  allocations: value.allocations.filter((_, i) => i !== index),
                })
              }
            >
              항목 제거
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          change({
            ...value,
            allocations: [
              ...value.allocations,
              { targetId: "", itemId: "", amount: "0", deductible: "0" },
            ],
          })
        }
      >
        정산 항목 추가
      </Button>
      <p className="rounded-xl bg-secondary/50 p-4 text-sm">
        귀속액 합계 {formatMinor(sum, value.currency)} · 실제 금액과 차이{" "}
        {formatMinor(
          (toMinor(value.amount, value.currency) ?? 0) - sum,
          value.currency,
        )}
      </p>
    </div>
  );
}
export function PaymentEditor({ value, change, book }: EditorProps) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.payment !== null}
          onChange={(e) =>
            change({
              ...value,
              payment: e.target.checked
                ? {
                    assetId: "",
                    date: value.date,
                    time: null,
                    amount: value.amount,
                  }
                : null,
            })
          }
        />
        {value.kind === "statement"
          ? "실제 카드대금 출금을 확인했어요"
          : "실제 계좌 환급을 확인했어요"}
      </label>
      {value.payment ? (
        <div className="grid gap-4 rounded-2xl bg-background/70 p-5 sm:grid-cols-2">
          <AssetSelect
            label={value.kind === "statement" ? "납부 계좌" : "환급 계좌"}
            value={value.payment.assetId}
            onChange={(assetId) =>
              change({ ...value, payment: { ...value.payment!, assetId } })
            }
            book={book}
            currency="KRW"
            kind="account"
          />
          <MoneyField
            label="실제 입출금액 · 원"
            value={value.payment.amount}
            onChange={(amount) =>
              change({ ...value, payment: { ...value.payment!, amount } })
            }
          />
          <DateTimeFields
            date={value.payment.date}
            time={value.payment.time}
            onDate={(date) =>
              change({ ...value, payment: { ...value.payment!, date } })
            }
            onTime={(time) =>
              change({ ...value, payment: { ...value.payment!, time } })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
export function StatementEditor({ value, change, book, id }: EditorProps) {
  const rows = statementRows(value, book, id);
  const sum = rows
    .filter((r) => value.selected.includes(r.id))
    .reduce((s, r) => s + (r.amount ?? 0), toMinor(value.fee, "KRW") ?? 0);
  const cards = [
    ...new Set(
      book.expenses
        .filter((e) => e.paymentKind === "card")
        .map((e) => e.paymentMethod),
    ),
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="카드 이름">
          <input
            className="form-control"
            list="card-names"
            value={value.card}
            onChange={(e) =>
              change({
                ...value,
                card: e.target.value,
                selected: [],
                deferred: [],
                verified: false,
                payment: null,
              })
            }
          />
          <datalist id="card-names">
            {cards.map((card) => (
              <option key={card} value={card} />
            ))}
          </datalist>
        </Field>
        <Field label="명세서 월">
          <input
            className="form-control"
            type="month"
            value={value.month}
            onChange={(e) =>
              change({ ...value, month: e.target.value, verified: false })
            }
          />
        </Field>
        <Field label="이용기간 시작">
          <input
            type="date"
            className="form-control"
            value={value.start}
            onChange={(e) =>
              change({ ...value, start: e.target.value, verified: false })
            }
          />
        </Field>
        <Field label="이용기간 끝">
          <input
            type="date"
            className="form-control"
            value={value.end}
            onChange={(e) =>
              change({ ...value, end: e.target.value, verified: false })
            }
          />
        </Field>
        <MoneyField
          label="연회비 · 원"
          value={value.fee}
          onChange={(fee) => change({ ...value, fee, verified: false })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.feeChecked}
            onChange={(e) =>
              change({
                ...value,
                feeChecked: e.target.checked,
                verified: false,
              })
            }
          />
          연회비 개별 대조 완료
        </label>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/70 p-4"
          >
            <label className="flex min-w-0 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={value.selected.includes(row.id)}
                disabled={row.amount === null}
                onChange={(e) =>
                  change({
                    ...value,
                    selected: e.target.checked
                      ? [...value.selected, row.id]
                      : value.selected.filter((id) => id !== row.id),
                    deferred: value.deferred.filter((id) => id !== row.id),
                    verified: false,
                  })
                }
              />
              <span>
                {row.title}
                {row.carried ? " · 이전 청구 미확인" : ""}
                <small className="mt-1 block text-muted-foreground">
                  {row.date} ·{" "}
                  {row.amount === null
                    ? "원화 미확정 · 검산 제외"
                    : formatMinor(row.amount, "KRW")}
                </small>
              </span>
            </label>
            <div className="flex items-center gap-3">
              <a className="text-xs text-primary" href={row.href}>
                상세
              </a>
              {
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    change({
                      ...value,
                      deferred: value.deferred.includes(row.id)
                        ? value.deferred.filter((id) => id !== row.id)
                        : [...value.deferred, row.id],
                      selected: value.selected.filter((id) => id !== row.id),
                      verified: false,
                    })
                  }
                >
                  {value.deferred.includes(row.id)
                    ? "이월 취소"
                    : "이번 청구에 없음 → 이월"}
                </Button>
              }
            </div>
          </div>
        ))}
      </div>
      <p className="rounded-xl bg-secondary/50 p-4 text-sm">
        체크한 항목 + 연회비 {formatMinor(sum, "KRW")} · 명세서 차이{" "}
        {formatMinor((Number(value.amount) || 0) - sum, "KRW")}
      </p>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={value.verified}
          onChange={(e) => change({ ...value, verified: e.target.checked })}
        />
        개별 대조와 총액 일치를 확인하고 검산 완료
      </label>
      <PaymentEditor value={value} change={change} book={book} />
      <p className="text-xs leading-6 text-muted-foreground">
        검산만으로 출금하지 않아요. 실제 납부를 연결하면 계좌에서 출금하고
        연회비만 납부일의 신규 정기지출로 반영해요.
      </p>
    </div>
  );
}
