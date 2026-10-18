"use client";
import { Field, FormSection } from "./form-fields";
import { Button } from "./ui/button";
import { valueInWon, type Asset } from "@/lib/asset";
import { toMinor, type ExpenseInput } from "@/lib/expense";
export function TopupEditor({
  value,
  change,
  assets,
}: {
  value: ExpenseInput;
  change: (value: ExpenseInput) => void;
  assets: Asset[];
}) {
  const t = value.topup;
  const patch = (next: Partial<NonNullable<ExpenseInput["topup"]>>) => {
    if (t) change({ ...value, topup: { ...t, ...next } });
  };
  const source = assets.find((a) => a.id === t?.fromId);
  const amount = toMinor(value.paidAmount, value.currency);
  const won =
    t && amount !== null
      ? valueInWon(amount, value.currency, t.rate || null)
      : null;
  return (
    <FormSection
      number="+"
      title="결제에 필요한 충전"
      description="충전과 결제를 한 번에 저장해요. 충전 금액은 결제 금액과 별개예요."
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={t !== null}
          disabled={!value.assetId}
          onChange={(e) =>
            change({
              ...value,
              topup: e.target.checked
                ? {
                    fromId: "",
                    amount: "0",
                    received: "0",
                    sameTime: true,
                    date: value.paymentDate,
                    time: null,
                    rate: "",
                  }
                : null,
            })
          }
        />
        결제 자산으로 충전도 기록하기
      </label>
      {!value.assetId ? (
        <p className="mt-3 text-xs text-muted-foreground">
          먼저 결제수단에서 도착 자산을 선택해 주세요.
        </p>
      ) : null}
      {t ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="충전 출발 자산">
              <select
                className="form-control"
                value={t.fromId}
                onChange={(e) => patch({ fromId: e.target.value })}
              >
                <option value="">자산 선택</option>
                {assets
                  .filter((a) => a.id !== value.assetId)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label={`실제 충전 출금액 · ${source?.currency ?? "출발 통화"}`}
            >
              <input
                className="form-control"
                inputMode="decimal"
                value={t.amount}
                onChange={(e) => patch({ amount: e.target.value })}
              />
            </Field>
            <Field label={`충전 수령량 · ${value.currency}`}>
              <input
                className="form-control"
                inputMode="decimal"
                value={t.received}
                onChange={(e) => patch({ received: e.target.value })}
              />
            </Field>
            <Field label="충전 평가 환율 · 1단위당 원">
              <input
                className="form-control"
                inputMode="decimal"
                value={t.rate}
                onChange={(e) => patch({ rate: e.target.value })}
                placeholder="선택 입력"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.sameTime}
              onChange={(e) => patch({ sameTime: e.target.checked })}
            />
            결제와 동시에 충전
          </label>
          {!t.sameTime ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="충전일">
                <input
                  className="form-control"
                  type="date"
                  value={t.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </Field>
              <Field label="충전 시각 (선택)">
                <input
                  className="form-control"
                  type="time"
                  value={t.time ?? ""}
                  onChange={(e) => patch({ time: e.target.value || null })}
                />
              </Field>
            </div>
          ) : null}
          {value.currency !== "KRW" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={won === null}
              onClick={() =>
                change({
                  ...value,
                  krwAmount: won === null ? null : String(won),
                  valuationRate: t.rate || null,
                  valuationSource: "linked-topup",
                })
              }
            >
              이 평가 환율로 소비 원화액 고정
              {won !== null ? ` · ${won.toLocaleString("ko-KR")}원` : ""}
            </Button>
          ) : null}
          <p className="text-xs leading-6 text-muted-foreground">
            저장한 충전의 연결을 해제해도 이동 기록은 남아요. 결제 취소가 충전을
            자동으로 되돌리지 않아요. 할인·보너스가 있는 교환은 이동·충전
            메뉴에서 세부 경로를 기록할 수 있어요.
          </p>
        </div>
      ) : null}
    </FormSection>
  );
}
