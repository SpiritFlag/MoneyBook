"use client";
import Link from "next/link";
import { parseDateQuery } from "@/lib/date";
import { useSearchParams } from "next/navigation";
import { useBook } from "@/lib/use-operations";
import {
  operationLabels,
  transferOrderWarning,
  operationPostings,
  sharedRemaining,
  tollRemaining,
  statementRows,
  type OperationKind,
} from "@/lib/operations";
import { formatMoney, formatMinor } from "@/lib/expense";
import { assetLedger, signedMinor } from "@/lib/asset";
import { OperationForm } from "./operation-form";
import { LedgerState, DemoNotice } from "./ledger-state";
import { Button } from "./ui/button";

export const sections = {
  transfers: {
    title: "이동·충전",
    description:
      "계좌 사이 이체부터 환전과 재화 충전까지, 돈이 지나간 길을 기록해요.",
    kinds: ["transfer"],
  },
  cards: {
    title: "카드 관리",
    description: "승인 내역 확인 → 명세서 검증 → 실제 납부를 차례로 연결해요.",
    kinds: ["statement", "cancel"],
  },
  settlements: {
    title: "정산·보험",
    description: "함께 낸 돈과 보험금이 돌아온 내역을 원래 지출에 연결해요.",
    kinds: ["recovery", "insurance"],
  },
  transport: {
    title: "교통·하이패스",
    description: "승차부터 환승까지, 기관별 후불 통행료까지 모아 봐요.",
    kinds: ["transit", "toll", "toll-payment"],
  },
  templates: {
    title: "자주 쓰는 거래",
    description: "내가 골라 저장한 거래를 새 입력의 시작점으로 사용해요.",
    kinds: ["template"],
  },
  income: {
    title: "수입·입금",
    description:
      "자산에 들어온 수입을 기록해요. 정산금과 자산 이동은 각각의 메뉴에서 기록하세요.",
    kinds: ["income"],
  },
} as const;
export type Section = keyof typeof sections;
const sectionFor = (kind: OperationKind) =>
  Object.entries(sections).find(([, s]) =>
    (s.kinds as readonly string[]).includes(kind),
  )?.[0] ?? "transfers";

export function FinanceBook({
  section,
  today,
}: {
  section: Section;
  today: string;
}) {
  const { data: book, error, retry } = useBook();
  const config = sections[section];
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const records = book.operations
    .filter((o) => (config.kinds as readonly string[]).includes(o.kind))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const unconfirmed = book.expenses.filter(
    (e) =>
      e.paymentKind === "card" && e.currency !== "KRW" && e.krwAmount === null,
  );
  return (
    <>
      <header className="mb-7">
        <p className="mb-2 text-xs font-semibold tracking-widest text-primary">
          연결해서 보는 나의 돈
        </p>
        <h1 className="text-3xl font-bold">{config.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {config.description}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {section === "cards" ? <Button asChild><Link href="/cards/new">신용카드 추가</Link></Button> : null}
          {config.kinds.map((kind) => (
            <Button
              key={kind}
              asChild
              variant={section !== "cards" && kind === config.kinds[0] ? "default" : "secondary"}
            >
              <Link href={`/records/new?kind=${kind}&date=${today}`}>
                {operationLabels[kind]} 기록
              </Link>
            </Button>
          ))}
        </div>
      </header>
      {section === "cards" ? <section className="book-sheet mb-6 rounded-3xl bg-card p-5 sm:p-7"><h2 className="text-lg font-semibold">내 신용카드 <span className="ml-2 text-sm font-normal text-muted-foreground">{book.cards?.length ?? 0}장</span></h2>{book.cards?.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2">{book.cards.map(card => <li key={card.id} className="rounded-2xl bg-secondary/40 p-5"><p className="text-xs text-muted-foreground">{card.issuer || "신용카드"}</p><h3 className="mt-2 text-lg font-semibold">{card.name}</h3><p className="mt-2 text-xs text-muted-foreground">승인 기록 {book.expenses.filter(e => e.paymentKind === "card" && e.paymentMethod === card.name).length}건</p><Link className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href={`/transactions/new?card=${card.id}`}>이 카드로 지출 기록 →</Link></li>)}</ul> : <div className="py-8 text-center"><p className="text-muted-foreground">아직 등록한 신용카드가 없어요.</p><Link href="/cards/new" className="mt-3 inline-block text-sm font-medium text-primary">첫 신용카드 추가 →</Link></div>}<p className="mt-4 text-xs leading-6 text-muted-foreground">신용카드는 이곳에서 관리해요. 예금·현금·충전 잔액은 자산 현황에서 관리해요.</p></section> : null}
      {section === "settlements" ? (
        <section className="mb-6 rounded-3xl bg-secondary/40 p-6">
          <h2 className="font-semibold">아직 받을 분담금</h2>
          <div className="mt-4 space-y-3">
            {book.expenses
              .filter(
                (e) => e.shared && sharedRemaining(e, book.operations) > 0,
              )
              .map((e) => (
                <Link
                  key={e.id}
                  href={`/records/new?kind=recovery&source=${e.id}&date=${today}`}
                  className="transaction-link flex flex-wrap justify-between gap-2 rounded-xl bg-card p-4 text-sm"
                >
                  <span>{e.title}</span>
                  <strong>
                    {formatMinor(
                      sharedRemaining(e, book.operations),
                      e.currency,
                    )}{" "}
                    → 회수 기록
                  </strong>
                </Link>
              ))}
            {!book.expenses.some(
              (e) => e.shared && sharedRemaining(e, book.operations) > 0,
            ) ? (
              <p className="text-sm text-muted-foreground">
                남아 있는 분담금이 없어요.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {section === "cards" && unconfirmed.length ? (
        <section className="mb-6 rounded-3xl bg-amber-50 p-6">
          <h2 className="font-semibold">해외 승인 · 원화 청구액 확인 대기</h2>
          <ul className="mt-4 space-y-3">
            {unconfirmed.map((e) => (
              <li key={e.id}>
                <Link
                  className="text-sm text-primary hover:underline"
                  href={`/transactions/${e.id}/edit`}
                >
                  {e.title} · {formatMoney(e.paidAmount, e.currency)} → 확정액
                  입력
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {section === "transport" ? (
        <section className="mb-6 rounded-3xl bg-secondary/40 p-6">
          <h2 className="font-semibold">기관별 미출금 통행료</h2>
          <ul className="mt-3 space-y-2">
            {book.operations
              .filter((o) => o.kind === "toll")
              .flatMap((o) =>
                o.rows
                  .filter((r) => tollRemaining(o, r, book.operations) > 0)
                  .map((r) => (
                    <li key={`${o.id}/${r.id}`}>
                      <Link
                        className="text-sm text-primary"
                        href={`/records/${o.id}`}
                      >
                        {o.title} · {r.name} ·{" "}
                        {formatMinor(
                          tollRemaining(o, r, book.operations),
                          "KRW",
                        )}
                      </Link>
                    </li>
                  )),
              )}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            출금 기록에서 실제 빠져나간 기관들을 골라 함께 정산해요.
          </p>
        </section>
      ) : null}
      <section className="book-sheet rounded-3xl bg-card p-5 sm:p-7">
        <h2 className="mb-4 text-lg font-semibold">
          {section === "templates" ? "내가 저장한 거래" : "기록한 내역"}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {records.length}건
          </span>
        </h2>
        {records.length ? (
          <ul className="space-y-2">
            {records.map((o) => (
              <li key={o.id} className="rounded-2xl bg-background/60">
                <Link
                  href={`/records/${o.id}`}
                  className="transaction-link flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {operationLabels[o.kind]} · {o.date}
                      {o.kind === "statement"
                        ? ` · ${o.payment ? "납부 완료" : o.verified ? "검증 완료 · 납부 대기" : "검증 중"}`
                        : ""}
                    </p>
                    <p className="mt-2 break-words font-semibold">{o.title}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    {o.kind === "transfer"
                      ? `${o.rows.length}단계 →`
                      : o.kind === "template"
                        ? "상세·불러오기 →"
                        : o.kind === "statement"
                          ? formatMinor(
                              signedMinor(o.amount, "KRW") ?? 0,
                              "KRW",
                            )
                          : formatMoney(o.amount, o.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">아직 기록이 없어요.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              위의 기록 버튼으로 첫 내역을 남겨보세요.
            </p>
          </div>
        )}
      </section>
      <DemoNotice />
    </>
  );
}

export function RecordPage({
  today,
  id,
  edit = false,
}: {
  today: string;
  id?: string;
  edit?: boolean;
}) {
  const query = useSearchParams();
  const { data: book, error, retry } = useBook();
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  if (!id) {
    const kind = query.get("kind") ?? "transfer";
    if (!(kind in operationLabels)) return <p>알 수 없는 기록 종류예요.</p>;
    return (
      <OperationForm
        key={`${kind}/${query.get("source")}`}
        kind={kind as OperationKind}
        date={parseDateQuery(query.get("date")) ?? today}
        book={book}
        source={query.get("source") ?? ""}
      />
    );
  }
  const op = book.operations.find((o) => o.id === id);
  if (!op)
    return (
      <p>
        기록을 찾을 수 없어요. <Link href="/">장부로</Link>
      </p>
    );
  if (edit && op.parentId)
    return (
      <div className="rounded-3xl bg-card p-8">
        <p>이 충전은 지출과 함께 저장한 기록이에요.</p>
        <Link
          className="mt-4 block text-primary"
          href={`/transactions/${op.parentId}/edit`}
        >
          연결된 지출에서 함께 수정 →
        </Link>
      </div>
    );
  if (edit)
    return (
      <OperationForm
        key={id}
        kind={op.kind}
        date={today}
        book={book}
        existing={op}
      />
    );
  const postings = operationPostings(book.operations, book.assets);
  const related = postings.filter((p) => p.href === `/records/${id}`);
  return (
    <>
      <header className="mb-6 flex flex-wrap justify-between gap-3">
        <Link
          className="text-sm text-muted-foreground"
          href={`/${sectionFor(op.kind)}`}
        >
          ← {sections[sectionFor(op.kind) as Section].title}
        </Link>
        <Button asChild variant="secondary">
          <Link href={`/records/${id}/edit`}>기록 수정</Link>
        </Button>
      </header>
      {query.get("saved") ? (
        <p
          role="status"
          className="mb-4 rounded-xl bg-secondary p-4 text-sm text-primary"
        >
          저장했어요. 연결된 원장과 소비에 반영했어요.
        </p>
      ) : null}
      <article className="book-sheet overflow-hidden rounded-3xl bg-card">
        <header className="daily-summary p-6 sm:p-8">
          <p className="text-xs text-primary">
            {operationLabels[op.kind]} · {op.date} · {op.time ?? "시각 미확인"}
          </p>
          <h1 className="mt-3 break-words text-3xl font-bold">{op.title}</h1>
          {op.kind !== "transfer" && op.kind !== "template" ? (
            <p className="mt-5 text-3xl font-bold text-primary">
              {op.kind === "statement"
                ? formatMinor(signedMinor(op.amount, "KRW") ?? 0, "KRW")
                : formatMoney(op.amount, op.currency)}
            </p>
          ) : null}
        </header>
        <div className="space-y-7 p-5 sm:p-8">
          {transferOrderWarning(op) ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">단계 번호와 날짜·시각 순서가 달라요. 자산 원장은 실제 날짜·시각순으로 반영해요. 기록 수정에서 각 단계 날짜를 확인해 주세요.</p> : null}
          {op.sourceId && book.expenses.some((e) => e.id === op.sourceId) ? (
            <Link
              className="block text-sm text-primary"
              href={`/transactions/${op.sourceId}`}
            >
              연결된 원거래 보기 →
            </Link>
          ) : null}
          {op.kind === "template" ? (
            <Button asChild>
              <Link href={`/transactions/new?template=${id}&date=${today}`}>
                이 거래로 새 지출 입력
              </Link>
            </Button>
          ) : null}
          {op.rows.length ? (
            <section>
              <h2 className="mb-4 font-semibold">
                {op.kind === "transfer" ? "이동 경로" : "세부 내역"}
              </h2>
              <ol className="space-y-3">
                {op.rows.map((r, i) => (
                  <li key={r.id} className="rounded-2xl bg-background/70 p-5">
                    <p className="font-semibold">
                      {i + 1}. {r.name || "이동"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.date} · {r.time ?? "시각 미확인"}
                      {op.kind === "transit"
                        ? ` · ${{ board: "승차", alight: "하차", transfer: "환승" }[r.action]} · ${r.route}`
                        : ""}
                    </p>
                    {op.kind === "transfer" ? (
                      <>
                        <p className="mt-3 text-sm">
                          {book.assets.find((a) => a.id === r.fromId)?.name}{" "}
                          {r.amount}{" "}
                          {book.assets.find((a) => a.id === r.fromId)?.currency}{" "}
                          → {book.assets.find((a) => a.id === r.toId)?.name}{" "}
                          {r.received}{" "}
                          {book.assets.find((a) => a.id === r.toId)?.currency}
                        </p>
                        {r.baseAmount ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            기준 금액 {r.baseAmount} − 할인 {r.discount} · 기본
                            수령 {r.baseReceived} + 보너스 {r.bonus} · 평가 환율{" "}
                            {r.rate || "미입력"}원
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-3 text-sm">
                        {formatMoney(r.amount, "KRW")}
                        {op.kind === "toll"
                          ? ` · 미출금 ${formatMinor(tollRemaining(op, r, book.operations), "KRW")}`
                          : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {op.allocations.length ? (
            <section>
              <h2 className="mb-4 font-semibold">원거래에 배분한 금액</h2>
              <ul className="space-y-3">
                {op.allocations.map((a, i) => {
                  const expense = book.expenses.find(
                    (e) => e.id === a.targetId,
                  );
                  const toll = book.operations.find(
                    (o) => o.id === a.targetId.split("/")[0],
                  );
                  return (
                    <li
                      key={i}
                      className="rounded-xl bg-background/70 p-4 text-sm"
                    >
                      <Link
                        className="font-medium text-primary"
                        href={
                          expense
                            ? `/transactions/${expense.id}`
                            : `/records/${toll?.id}`
                        }
                      >
                        {expense?.title ??
                          `${toll?.title} · ${toll?.rows.find((r) => r.id === a.targetId.split("/")[1])?.name}`}
                      </Link>
                      <p className="mt-2">
                        {formatMoney(a.amount, op.currency)}
                        {a.itemId
                          ? ` · ${expense?.items.find((x) => x.id === a.itemId)?.name}`
                          : ""}
                        {op.kind === "insurance"
                          ? ` · 자기부담금 ${formatMoney(a.deductible, "KRW")}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {op.kind === "statement" ? (
            <section>
              <h2 className="font-semibold">
                {op.card} · {op.month} 청구
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                이용기간 {op.start} ~ {op.end} ·{" "}
                {op.payment
                  ? "실제 납부 완료"
                  : op.verified
                    ? "검증 완료 · 납부 대기"
                    : "검증 중"}
              </p>
              <ul className="mt-4 space-y-2">
                {statementRows(op, book, op.id)
                  .filter(
                    (r) =>
                      op.selected.includes(r.id) || op.deferred.includes(r.id),
                  )
                  .map((r) => (
                    <li key={r.id}>
                      <Link className="text-sm text-primary" href={r.href}>
                        {r.title} ·{" "}
                        {r.amount === null
                          ? "원화 미확정"
                          : formatMinor(r.amount, "KRW")}{" "}
                        ·{" "}
                        {op.selected.includes(r.id)
                          ? "확인"
                          : "다음 청구로 이월"}
                      </Link>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-sm">
                연회비 {formatMoney(op.fee, "KRW")} ·{" "}
                {op.feeChecked ? "별도 확인 완료" : "미확인"}
              </p>
            </section>
          ) : null}
          {op.kind === "cancel" ? (
            <p className="rounded-xl bg-secondary/50 p-4 text-sm">
              원거래의 소비 반영을 취소했어요.{" "}
              {op.cancelRoute === "exclude"
                ? "청구 대상 제외"
                : op.cancelRoute === "credit"
                  ? `${op.month} 명세서 차감`
                  : op.payment
                    ? "계좌 환급 완료"
                    : "계좌 환급 대기"}
            </p>
          ) : null}
          {related.length ? (
            <section>
              <h2 className="mb-4 font-semibold">자산 원장 반영</h2>
              <ul className="space-y-3">
                {related.map((p) => {
                  const asset = book.assets.find((a) => a.id === p.assetId)!;
                  const row = assetLedger(asset, book.expenses, postings).find(
                    (r) => r.entry.id === p.id,
                  );
                  return (
                    <li key={p.id} className="rounded-2xl bg-secondary/40 p-4">
                      <Link
                        className="font-medium text-primary"
                        href={`/assets/${asset.id}`}
                      >
                        {asset.name} → 원장
                      </Link>
                      <p className="mt-2 text-sm">
                        {p.date} · {p.time ?? "시각 미확인"} ·{" "}
                        {formatMinor(p.amount, asset.currency)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        거래 전{" "}
                        {row?.before == null
                          ? "미확인"
                          : formatMinor(row.before, asset.currency)}{" "}
                        → 거래 후{" "}
                        {row?.after == null
                          ? "미확인"
                          : formatMinor(row.after, asset.currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {op.memo ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
              {op.memo}
            </p>
          ) : null}
        </div>
      </article>
      <DemoNotice />
    </>
  );
}
