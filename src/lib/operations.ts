import { currencySchema, type GameCurrency } from "./currency";
import type { Card } from "./card";
import { z } from "zod";
import {
  expenseInputSchema,
  newExpense,
  ownKrw,
  ownMinor,
  toMinor,
  type Expense,
  type Currency,
} from "./expense";
import { signedMinor, rateUnits, type Asset } from "./asset";
import { parseDateQuery } from "./date";

export const incomeCategories = {
  employment: { label: "근로소득", image: "/characters/income_employment.png" },
  financial: { label: "금융소득", image: "/characters/income_financial.png" },
  benefit: { label: "혜택·지원금", image: "/characters/income_benefit.png" },
  other: { label: "기타 수입", image: "/characters/income_other.png" },
} as const;
export const operationLabels = {
  income: "수입·입금",
  transfer: "자산 이동·충전",
  recovery: "분담금 회수",
  insurance: "보험금 회수",
  transit: "대중교통",
  toll: "하이패스 이용",
  "toll-payment": "하이패스 출금",
  cancel: "카드 전액 취소",
  statement: "카드 명세서",
  template: "자주 쓰는 거래",
} as const;
export type OperationKind = keyof typeof operationLabels;
const date = z
  .string()
  .refine((v) => parseDateQuery(v) !== null, "날짜를 확인해 주세요.");
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const text = z.string().max(120);
const amount = z.string().max(20);
const rowSchema = z.object({
  id: text,
  name: text,
  date,
  time,
  fromId: text,
  cardId: text.optional(),
  toId: text,
  amount,
  received: amount,
  baseAmount: amount,
  discount: amount,
  baseReceived: amount,
  bonus: amount,
  rate: amount,
  action: z.enum(["board", "alight", "transfer"]),
  route: text,
});
export type OperationRow = z.infer<typeof rowSchema>;
export const operationInputSchema = z.object({
  kind: z.enum([
    "income",
    "transfer",
    "recovery",
    "insurance",
    "transit",
    "toll",
    "toll-payment",
    "cancel",
    "statement",
    "template",
  ]),
  incomeCategory: z.enum(["employment", "financial", "benefit", "other"]).default("other"),
  title: z.string().trim().min(1, "기록 이름을 입력해 주세요.").max(120),
  date,
  time,
  currency: currencySchema,
  amount,
  assetId: text,
  sourceId: text,
  parentId: text.default(""),
  memo: z.string().max(2000),
  rows: z.array(rowSchema).max(100),
  allocations: z
    .array(
      z.object({ targetId: text, itemId: text, amount, deductible: amount }),
    )
    .max(100),
  card: text,
  month: z.string().max(7),
  start: date,
  end: date,
  selected: z.array(text).max(500),
  deferred: z.array(text).max(500),
  fee: amount,
  feeChecked: z.boolean(),
  verified: z.boolean(),
  payment: z.object({ assetId: text, date, time, amount }).nullable(),
  cancelRoute: z.enum(["exclude", "credit", "refund"]),
  template: expenseInputSchema.nullable(),
});
export type OperationInput = z.infer<typeof operationInputSchema>;
export const operationSchema = operationInputSchema.safeExtend({
  id: text,
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Operation = z.infer<typeof operationSchema>;
export type BookData = {
  gameCurrencies?: GameCurrency[];
  cards?: Card[];
  expenses: Expense[];
  assets: Asset[];
  operations: Operation[];
};
export function newOperation(
  kind: OperationKind,
  date: string,
): OperationInput {
  return {
    kind,
    title: operationLabels[kind],
    incomeCategory: "other",
    date,
    time: null,
    currency: "KRW",
    amount: "0",
    assetId: "",
    sourceId: "",
    parentId: "",
    memo: "",
    rows: [],
    allocations: [],
    card: "",
    month: date.slice(0, 7),
    start: date.slice(0, 7) + "-01",
    end: date,
    selected: [],
    deferred: [],
    fee: "0",
    feeChecked: false,
    verified: false,
    payment: null,
    cancelRoute: "exclude",
    template: null,
  };
}
export function newRow(date: string, id: string): OperationRow {
  return {
    id,
    name: "",
    date,
    time: null,
    fromId: "",
    toId: "",
    amount: "0",
    received: "0",
    baseAmount: "",
    discount: "0",
    baseReceived: "",
    bonus: "0",
    rate: "",
    action: "board",
    route: "",
  };
}
export function cancelled(id: string, ops: readonly Operation[]) {
  return ops.some((o) => o.kind === "cancel" && o.sourceId === id);
}
export function insuranceRecovered(id: string, ops: readonly Operation[]) {
  return ops
    .filter((o) => o.kind === "insurance")
    .flatMap((o) => o.allocations)
    .filter((a) => a.targetId === id)
    .reduce((s, a) => s + (toMinor(a.amount, "KRW") ?? 0), 0);
}
export function netConsumption(e: Expense, ops: readonly Operation[]) {
  const original = ownKrw(e);
  return cancelled(e.id, ops)
    ? 0
    : original === null
      ? null
      : original - insuranceRecovered(e.id, ops);
}
export function sharedRemaining(
  e: Expense,
  ops: readonly Operation[],
  excludeId = "",
) {
  if (cancelled(e.id, ops)) return 0;
  return (
    (toMinor(e.paidAmount, e.currency) ?? 0) -
    ownMinor(e) -
    ops
      .filter((o) => o.kind === "recovery" && o.id !== excludeId)
      .flatMap((o) => o.allocations)
      .filter((a) => a.targetId === e.id)
      .reduce((s, a) => s + (toMinor(a.amount, e.currency) ?? 0), 0)
  );
}
export function tollRemaining(
  op: Operation,
  row: OperationRow,
  ops: readonly Operation[],
  excludeId = "",
) {
  return (
    (toMinor(row.amount, "KRW") ?? 0) -
    ops
      .filter((o) => o.kind === "toll-payment" && o.id !== excludeId)
      .flatMap((o) => o.allocations)
      .filter((a) => a.targetId === `${op.id}/${row.id}`)
      .reduce((s, a) => s + (toMinor(a.amount, "KRW") ?? 0), 0)
  );
}
export function cardAmount(e: Expense): number | null {
  return e.currency === "KRW"
    ? toMinor(e.paidAmount, "KRW")
    : e.krwAmount === null
      ? null
      : toMinor(e.krwAmount, "KRW");
}
export function statementRows(
  input: OperationInput,
  book: BookData,
  ownId = "",
) {
  const claimed = new Set(
    book.operations
      .filter((o) => o.kind === "statement" && o.id !== ownId && o.verified)
      .flatMap((o) => o.selected),
  );
  const entries = book.expenses
    .filter(
      (e) =>
        e.paymentKind === "card" &&
        e.paymentMethod === input.card &&
        e.paymentDate <= input.end,
    )
    .filter(
      (e) =>
        !book.operations.some(
          (c) =>
            c.kind === "cancel" &&
            c.sourceId === e.id &&
            c.cancelRoute === "exclude",
        ),
    )
    .map((e) => ({
      id: e.id,
      title: e.title,
      date: e.paymentDate,
      amount: cardAmount(e),
      href: `/transactions/${e.id}`,
      carried: e.paymentDate < input.start,
    }));
  const slips = book.operations
    .filter(
      (o) =>
        o.kind === "cancel" &&
        o.cancelRoute === "credit" &&
        o.month <= input.month &&
        book.expenses.find((e) => e.id === o.sourceId)?.paymentMethod ===
          input.card,
    )
    .map((o) => ({
      id: `cancel:${o.id}`,
      title: `${o.title} · 취소전표`,
      date: o.date,
      amount: -(toMinor(o.amount, "KRW") ?? 0),
      href: `/records/${o.id}`,
      carried: false,
    }));
  const topups = book.operations.filter(o => o.kind === "transfer").flatMap(o => o.rows
    .filter(r => r.cardId && book.cards?.find(c => c.id === r.cardId)?.name === input.card && r.date <= input.end)
    .map(r => ({ id: `transfer:${o.id}/${r.id}`, title: `${o.title} · ${r.name || "카드 충전"}`, date: r.date,
      amount: toMinor(r.amount, "KRW"), href: `/records/${o.id}`, carried: r.date < input.start })));
  return [...entries, ...slips, ...topups]
    .filter((r) => !claimed.has(r.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export type Posting = {
  id: string;
  assetId: string;
  date: string;
  time: string | null;
  amount: number;
  title: string;
  href: string;
  order: number;
};
export function operationPostings(
  ops: readonly Operation[],
  assets: readonly Asset[],
): Posting[] {
  const result: Posting[] = [];
  for (const op of ops) {
    const add = (
      assetId: string,
      value: string,
      sign: number,
      date = op.date,
      time = op.time,
      suffix = "",
      title = op.title,
      order = op.parentId ? -1 : 0,
    ) => {
      const asset = assets.find((a) => a.id === assetId);
      if (asset)
        result.push({
          id: `${op.id}/${suffix}`,
          assetId,
          date,
          time,
          amount: sign * (toMinor(value, asset.currency) ?? 0),
          title,
          href: `/records/${op.id}`,
          order,
        });
    };
    if (["income", "recovery", "insurance"].includes(op.kind))
      add(op.assetId, op.amount, 1);
    if (op.kind === "toll-payment") add(op.assetId, op.amount, -1);
    if (op.kind === "transfer")
      op.rows.forEach((r, i) => {
        if (!r.cardId) add(
          r.fromId,
          r.amount,
          -1,
          r.date,
          r.time,
          `${i}-out`,
          `${op.title} · ${r.name || i + 1} 출금`,
          op.parentId ? -1 : i,
        );
        add(
          r.toId,
          r.received,
          1,
          r.date,
          r.time,
          `${i}-in`,
          `${op.title} · ${r.name || i + 1} 입금`,
          op.parentId ? -1 : i,
        );
      });
    if (op.kind === "transit")
      op.rows.forEach((r, i) =>
        add(
          op.assetId,
          r.amount,
          -1,
          r.date,
          r.time,
          String(i),
          `${op.title} · ${r.name}`,
        ),
      );
    if (
      (op.kind === "statement" ||
        (op.kind === "cancel" && op.cancelRoute === "refund")) &&
      op.payment
    )
      add(
        op.payment.assetId,
        op.payment.amount,
        op.kind === "statement" ? -1 : 1,
        op.payment.date,
        op.payment.time,
      );
  }
  return result;
}
export function operationExpenses(ops: readonly Operation[]): Expense[] {
  const result: Expense[] = [];
  for (const op of ops) {
    let paid: string | null = null,
      date = op.date;
    if (op.kind === "transit" || op.kind === "toll") paid = op.amount;
    if (op.kind === "statement" && op.payment && Number(op.fee) > 0) {
      paid = op.fee;
      date = op.payment.date;
    }
    if (paid === null) continue;
    result.push({
      ...newExpense(date),
      id: `operation:${op.id}`,
      title: op.kind === "statement" ? `${op.card} · 연회비` : op.title,
      paidAmount: paid,
      category: op.kind === "statement" ? "other" : "transport",
      paymentMethod:
        op.kind === "statement"
          ? op.card
          : op.kind === "toll"
            ? "후불 하이패스"
            : "선불교통카드",
      paymentKind: "stored",
      time: op.kind === "statement" ? op.payment?.time ?? null : op.time,
      useTime: op.kind === "statement" ? op.payment?.time ?? null : op.time,
      useKind: op.kind === "statement" ? "period" : "once",
      useEnd: op.kind === "statement" ? date : null,
      revision: op.revision,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    });
  }
  return result;
}
export function consumptionRecords(
  expenses: Expense[],
  ops: Operation[],
): Expense[] {
  return [
    ...expenses.map((e) => {
      const net = netConsumption(e, ops);
      return net === null
        ? e
        : {
            ...e,
            currency: "KRW" as const,
            paidAmount: String(net),
            shared: false,
            ownAmount: null,
            krwAmount: null,
          };
    }),
    ...operationExpenses(ops),
  ];
}
export function expenseHref(id: string) {
  return id.startsWith("operation:")
    ? `/records/${id.slice(10)}`
    : `/transactions/${id}`;
}

// 모든 연결을 검증한 뒤 같은 파일에 저장합니다. 금액은 최소 단위로 비교합니다.
export function validateOperations(book: BookData, verifyingId?: string) {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const money = (v: string, c: Currency) => {
    const n = toMinor(v, c);
    return n === null ? fail(`${c} 금액을 확인해 주세요: ${v}`) : n;
  };
  const asset = (id: string, currency?: Currency) => {
    const a = book.assets.find((a) => a.id === id);
    if (!a || (currency && a.currency !== currency))
      return fail("자산이 없거나 통화가 다릅니다.");
    return a;
  };
  const expense = (id: string) =>
    book.expenses.find((e) => e.id === id) ??
    fail("연결할 원지출을 찾을 수 없어요.");
  for (const e of book.expenses) {
    const seen = new Set([e.id]);
    let ref = e.orderReference;
    while (ref) {
      if (seen.has(ref))
        fail("순서 기준이 서로를 가리켜요. 기준 거래를 바꿔 주세요.");
      seen.add(ref);
      ref = book.expenses.find((x) => x.id === ref)?.orderReference ?? null;
    }
    if (e.valuationRate !== null && rateUnits(e.valuationRate) === null)
      fail("고정 평가 환율을 확인해 주세요.");
  }
  for (const op of book.operations) {
    if (new Set(op.rows.map((r) => r.id)).size !== op.rows.length)
      fail("행 ID가 중복되었어요.");
    if (op.kind === "income") {
      asset(op.assetId, op.currency);
      money(op.amount, op.currency);
    }
    if (op.kind === "transfer") {
      if (!op.rows.length) fail("자산 이동 단계를 추가해 주세요.");
      for (const row of op.rows) {
        const from = row.cardId ? null : asset(row.fromId), to = asset(row.toId);
        if (row.cardId && (row.fromId || !book.cards?.some(c => c.id === row.cardId))) fail("충전할 신용카드를 다시 선택해 주세요.");
        if (from?.id === to.id) fail("출발·도착 자산을 다르게 선택해 주세요.");
        const sourceCurrency = from?.currency ?? "KRW";
        money(row.amount, sourceCurrency);
        money(row.received, to.currency);
        if (row.baseAmount !== "" || row.baseReceived !== "") {
          if (
            money(row.baseAmount, sourceCurrency) -
              money(row.discount, sourceCurrency) !==
            money(row.amount, sourceCurrency)
          )
            fail("기준 교환 금액 − 할인은 실제 출금액과 같아야 해요.");
          if (
            money(row.baseReceived, to.currency) +
              money(row.bonus, to.currency) !==
            money(row.received, to.currency)
          )
            fail("기본 수령량 + 보너스는 최종 수령량과 같아야 해요.");
          if (row.rate === "" || rateUnits(row.rate) === null)
            fail("평가 환율을 입력해 주세요.");
        } else if (row.rate !== "" && rateUnits(row.rate) === null)
          fail("평가 환율을 확인해 주세요.");
      }
    }
    if (["recovery", "insurance", "toll-payment"].includes(op.kind)) {
      asset(op.assetId, op.currency);
      if (op.kind !== "recovery" && op.currency !== "KRW")
        fail("보험금·하이패스 정산은 원화로 입력해 주세요.");
      if (!op.allocations.length) fail("정산할 항목을 추가해 주세요.");
      if (
        new Set(op.allocations.map((a) => `${a.targetId}/${a.itemId}`)).size !==
        op.allocations.length
      )
        fail("같은 정산 항목이 중복되었어요.");
      let sum = 0;
      for (const a of op.allocations) {
        sum += money(a.amount, op.currency);
        money(a.deductible, "KRW");
        if (op.kind === "toll-payment") {
          const target = book.operations.find(
            (o) =>
              o.kind === "toll" &&
              o.rows.some((r) => `${o.id}/${r.id}` === a.targetId),
          );
          if (!target) fail("하이패스 원항목을 찾을 수 없어요.");
          const row = target!.rows.find(
            (r) => `${target!.id}/${r.id}` === a.targetId,
          )!;
          if (tollRemaining(target!, row, book.operations) < 0)
            fail("하이패스 출금이 기관별 미정산액을 초과했어요.");
        } else {
          const e = expense(a.targetId);
          if (
            cancelled(e.id, book.operations) &&
            money(a.amount, op.currency) > 0
          )
            fail("취소된 거래의 정산을 먼저 정정해 주세요.");
          if (op.kind === "recovery") {
            if (
              !e.shared ||
              e.currency !== op.currency ||
              sharedRemaining(e, book.operations) < 0
            )
              fail("분담금 귀속액이 미정산액을 초과하거나 통화가 달라요.");
          }
          if (op.kind === "insurance") {
            if (
              e.category !== "medical" ||
              ownKrw(e) === null ||
              insuranceRecovered(e.id, book.operations) > ownKrw(e)!
            )
              fail("의료비의 확정 본인 소비 범위에서 보험금을 배분해 주세요.");
            if (a.itemId && !e.items.some((i) => i.id === a.itemId))
              fail("연결한 의료비 상품을 찾을 수 없어요.");
          }
        }
      }
      if (sum !== money(op.amount, op.currency))
        fail("실제 입출금액과 귀속액 합계가 일치해야 정산할 수 있어요.");
    }
    if (op.kind === "transit" || op.kind === "toll") {
      if (op.currency !== "KRW" || !op.rows.length)
        fail("교통 내역은 원화로, 최소 한 구간 이상 입력해 주세요.");
      if (op.kind === "transit") {
        const a = asset(op.assetId, "KRW");
        if (a.kind !== "stored") fail("선불교통카드 자산을 선택해 주세요.");
      }
      let sum = 0;
      for (const row of op.rows) {
        if (!row.name.trim()) fail("정류장·역 또는 기관명을 입력해 주세요.");
        sum += money(row.amount, "KRW");
        if (op.kind === "transit" && row.date !== op.date)
          fail("대중교통 여정의 날짜와 각 사건 날짜가 같아야 해요.");
      }
      if (sum !== money(op.amount, "KRW"))
        fail("교통 총액과 세부 운임 합계가 일치해야 해요.");
    }
    if (op.kind === "cancel") {
      const e = expense(op.sourceId);
      if (e.paymentKind !== "card")
        fail("카드 승인 거래에서 취소를 시작해 주세요.");
      if (
        book.operations.filter(
          (o) => o.kind === "cancel" && o.sourceId === e.id,
        ).length > 1
      )
        fail("이미 전액 취소가 연결되어 있어요.");
      const billed = book.operations.find(
        (o) =>
          o.kind === "statement" && o.verified && o.selected.includes(e.id),
      );
      if (op.cancelRoute === "exclude" && billed)
        fail(
          "검산 완료된 승인은 명세서를 먼저 수정하거나 납부 후 처리 방식을 선택해 주세요.",
        );
      if (op.cancelRoute !== "exclude" && !billed?.payment)
        fail("납부 후 취소는 원승인의 실제 납부를 먼저 연결해 주세요.");
      if (op.cancelRoute !== "exclude") {
        if (cardAmount(e) === null || money(op.amount, "KRW") !== cardAmount(e))
          fail("전액 취소 금액은 원승인의 확정 원화액과 같아야 해요.");
      }
      if (
        op.cancelRoute === "credit" &&
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(op.month)
      )
        fail("취소전표 반영 월을 확인해 주세요.");
      if (op.payment) {
        if (op.cancelRoute !== "refund")
          fail("계좌 환급 방식에서만 입금을 연결할 수 있어요.");
        asset(op.payment.assetId, "KRW");
        if (money(op.payment.amount, "KRW") !== money(op.amount, "KRW"))
          fail("실제 환급액을 확인해 주세요.");
      }
    }
    if (op.kind === "statement") {
      if (
        !op.card.trim() ||
        op.start > op.end ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(op.month)
      )
        fail("카드·명세서 월·이용기간을 확인해 주세요.");
      if (
        book.operations.some(
          (o) =>
            o.id !== op.id &&
            o.kind === "statement" &&
            o.card === op.card &&
            o.month === op.month,
        )
      )
        fail("같은 카드·월의 명세서가 있어요.");
      const rows = statementRows(op, book, op.id);
      if (
        new Set(op.selected).size !== op.selected.length ||
        op.selected.some((id) => op.deferred.includes(id))
      )
        fail("검산 항목과 이월 항목이 중복되었어요.");
      if (
        op.selected.some(
          (id) => !rows.some((r) => r.id === id && r.amount !== null),
        )
      )
        fail("이미 다른 명세서에서 확인했거나 원화 미확정인 항목이에요.");
      const total = signedMinor(op.amount, "KRW");
      if (total === null) fail("명세서 총액을 확인해 주세요.");
      const fee = money(op.fee, "KRW");
      if (op.verified) {
        if (fee > 0 && !op.feeChecked) fail("연회비도 개별 대조해 주세요.");
        if (
          op.id === verifyingId &&
          rows.some(
            (r) => !op.selected.includes(r.id) && !op.deferred.includes(r.id),
          )
        )
          fail("명세서에 없는 항목은 다음 청구로 이월해 주세요.");
        const sum = rows
          .filter((r) => op.selected.includes(r.id))
          .reduce((s, r) => s + (r.amount ?? 0), fee);
        if (sum !== total)
          fail("체크한 승인·취소전표·연회비 합계와 명세서 총액이 다릅니다.");
      }
      if (op.payment) {
        asset(op.payment.assetId, "KRW");
        if (
          !op.verified ||
          total! < 0 ||
          money(op.payment.amount, "KRW") !== total
        )
          fail("검산 완료 후 명세서 총액과 같은 실제 납부액을 연결해 주세요.");
      }
    }
    if (op.kind === "template" && !op.template)
      fail("템플릿의 원거래가 필요해요.");
  }
}

// 대표 날짜에 맞춰 두었던 단계만 함께 이동합니다. 개별 지정 날짜는 보존합니다.
export function changeOperationDate(value: OperationInput, date: string): OperationInput {
  return { ...value, date, rows: value.rows.map(r =>
    value.kind === "transit" || (value.kind === "transfer" && r.date === value.date) ? { ...r, date } : r) };
}
export function transferOrderWarning(value: OperationInput): boolean {
  return value.kind === "transfer" && value.rows.some((row, i) => {
    const prev = value.rows[i - 1];
    return prev && (row.date < prev.date || (row.date === prev.date && row.time !== null && prev.time !== null && row.time < prev.time));
  });
}
