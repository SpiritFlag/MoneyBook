import { z } from "zod";
import { bookDate, parseDateQuery, shiftDate, todayInBook, todayInSeoul } from "./date";
import { categories, categoryAmounts, consumptionKrw, daySummary, monthAmount, toMinor, type Expense } from "./expense";
import { consumptionRecords, incomeMinor, netConsumption, operationExpenses, operationPostings, type Operation } from "./operations";
import { assetLedger, assetPosition } from "./asset";
import { RepositoryError, type Book } from "./expense-repository";
import { page, getRecord, overview, monthlyBook } from "./mcp-queries";
import { recurringRows, recurringSeries, shiftMonth } from "./recurring";
import { loansWithPayments } from "./loan-payment";
import { loanScheduleCoverage, loanSummary, recordedLoanTotals } from "./loan";
import { monthlyLoanPayments } from "./monthly-loan-payments";

const date = z.string().refine(v => parseDateQuery(v) !== null, "Use a valid YYYY-MM-DD date.");
const id = z.string().min(1).max(120);
export const revisionFields = { expectedRevision: z.string().max(30).regex(/^\d+$/).optional() };
const pagination = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(25) };
const range = { start: date, end: date };
const validRange = (v: { start?: string; end?: string }) => !v.start || !v.end || v.start <= v.end;
export const activitySchema = z.strictObject({ ...revisionFields, period: z.enum(["today", "week", "month", "range"]).default("week"), start: date.optional(), end: date.optional() }).refine(v => v.period === "range" ? !!v.start && !!v.end && validRange(v) : !v.start && !v.end, "Only range requires start/end.");
export const searchSchema = z.strictObject({ ...revisionFields, ...pagination, start: date.optional(), end: date.optional(), query: z.string().trim().min(1).max(120).optional(), category: z.enum(Object.keys(categories) as [keyof typeof categories, ...Array<keyof typeof categories>]).optional(), collection: z.enum(["all", "expenses", "operations"]).default("all"), dateBasis: z.enum(["book", "use", "payment"]).default("book") }).refine(validRange, "start must be on or before end.");
export const assetsSchema = z.strictObject({ ...revisionFields, ...pagination, assetId: id.optional(), asOf: date.optional(), start: date.optional(), end: date.optional() }).refine(v => !!v.start === !!v.end && validRange(v), "Supply both start/end in order, or neither.");
export const loansSchema = z.strictObject({ ...revisionFields, ...pagination, loanId: id.optional(), kind: z.enum(["overview", "schedule", "repayments", "events"]).default("overview"), start: date.optional(), end: date.optional() }).refine(validRange, "start must be on or before end.");
export const recurringSchema = z.strictObject({ ...revisionFields, ...pagination, seriesId: id.optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v => parseDateQuery(`${v}-01`) !== null).optional() });
export const detailSchema = z.strictObject({ ...revisionFields, ...pagination, collection: z.enum(["expenses", "operations", "assets", "cards", "gameCurrencies", "loans"]), id });
export const bookOverviewSchema = z.strictObject(revisionFields);
export const rangeSchema = z.strictObject(range).refine(validRange);
type Range = { start: string; end: string };
const inRange = (d: string, r: { start?: string; end?: string }) => (!r.start || d >= r.start) && (!r.end || d <= r.end);
const dayCount = (r: Range) => Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1;
function dates(r: Range) {
  if (dayCount(r) > 366) throw new RepositoryError("한 번에 최대 366일을 탐색할 수 있어요. 기간을 나눠 주세요.", 400);
  return Array.from({ length: dayCount(r) }, (_, i) => shiftDate(r.start, i));
}
function monthEnd(month: string) {
  const next = shiftMonth(month, 1);
  return next ? shiftDate(`${next}-01`, -1) : "9999-12-31";
}
function months(r: Range) {
  const result: string[] = [];
  for (let m: string | null = r.start.slice(0, 7); m && m <= r.end.slice(0, 7); m = shiftMonth(m, 1)) result.push(m);
  return result;
}

// Named periods stop at the last completed book day. This avoids comparing part
// of today with a complete historical day. Today's live activity remains visible.
export function activityRanges(q: z.infer<typeof activitySchema>, now = new Date()) {
  const today = todayInBook(now);
  let start = today, end = today, previous: Range;
  if (q.period === "range") {
    start = q.start!; end = q.end!;
    if (end > today) end = today;
    if (start > end) throw new RepositoryError("관측할 수 있는 장부일이 없는 기간이에요.", 400);
    const length = dayCount({ start, end });
    previous = { start: shiftDate(start, -length), end: shiftDate(start, -1) };
  } else if (q.period === "today") {
    previous = { start: shiftDate(today, -7), end: shiftDate(today, -1) };
  } else {
    if (q.period === "week") {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      start = shiftDate(today, -((weekday + 6) % 7));
      previous = { start: shiftDate(start, -7), end: shiftDate(today, -7) };
    } else {
      start = `${today.slice(0, 7)}-01`;
      const m = shiftMonth(today.slice(0, 7), -1);
      if (!m) throw new RepositoryError("비교할 수 있는 이전 월이 없어요.", 400);
      previous = { start: `${m}-01`, end: `${m}-${String(Math.min(Number(today.slice(8)), Number(monthEnd(m).slice(8)))).padStart(2, "0")}` };
    }
  }
  const observed = { start, end };
  dates(observed); dates(previous);
  const completedEnd = end === today ? shiftDate(end, -1) : end;
  const completedCount = Math.max(0, dayCount({ start, end: completedEnd }));
  const matchedCount = Math.min(completedCount, dayCount(previous));
  const comparisonCurrent = matchedCount ? { start, end: shiftDate(start, matchedCount - 1) } : null;
  const comparisonPrevious = q.period === "today" ? null : matchedCount ? { start: previous.start, end: shiftDate(previous.start, matchedCount - 1) } : null;
  if (previous.start >= start || shiftDate(start, -1) === start) throw new RepositoryError("비교 기간이 지원 날짜 범위를 벗어나요.", 400);
  return { period: q.period, observed, calendarToday: todayInSeoul(now), bookToday: today, liveBookDay: end === today ? today : null, comparisonCurrent, comparisonPrevious, recentDays: q.period === "today" ? previous : null, comparisonPolicy: "completed_book_days_equal_count; live day excluded; Monday week start; month days capped to shorter month" };
}

function ref(e: Expense) { return { collection: e.id.startsWith("operation:") ? "operations" : "expenses", id: e.id.replace(/^operation:/, "") }; }
function expenseBrief(e: Expense, ops: Operation[]) {
  return { ...ref(e), title: e.title, category: e.category, useKind: e.useKind, bookDate: bookDate(e.useDate, e.useKind === "once" ? e.useTime : null), paymentDate: e.paymentDate, currency: e.currency, paidAmount: e.paidAmount, netConsumptionKrw: netConsumption(e, ops), seriesId: e.monthlyRecurring || e.recurringSeriesId ? recurringSeries(e) : null, loanId: e.loanPayment?.loanId ?? null };
}
function summary(records: Expense[], r: Range) {
  const selected = records.filter(e => e.useKind === "once" && inRange(bookDate(e.useDate, e.useTime), r));
  const categoryTotalsKrw: Record<string, number> = {};
  for (const e of selected) for (const c of categoryAmounts(e)) if (c.amount !== null) categoryTotalsKrw[c.category] = (categoryTotalsKrw[c.category] ?? 0) + c.amount;
  const daily = dates(r).map(date => ({ date, ...daySummary(records, date), recordedCount: selected.filter(e => bookDate(e.useDate, e.useTime) === date).length }));
  return { range: r, knownConsumptionKrw: daily.reduce((s, d) => s + d.total, 0), pendingValuationCount: daily.reduce((s, d) => s + d.pending, 0), recordedCount: selected.length, categoryTotalsKrw, daily };
}
function delta(current: number, previous: number) { return { current, previous, change: current - previous, changePercent: previous === 0 ? null : (current - previous) / previous * 100 }; }
function contributionRecords(records: Expense[], r: Range, sign: number) {
  return records.filter(e => e.useKind === "once" && inRange(bookDate(e.useDate, e.useTime), r)).map(e => ({ ...ref(e), title: e.title, category: e.category, date: bookDate(e.useDate, e.useTime), contributionKrw: consumptionKrw(e) === null ? null : sign * consumptionKrw(e)! }));
}

export function exploreActivity(book: Book, q: z.infer<typeof activitySchema>, now = new Date()) {
  const ranges = activityRanges(q, now);
  const records = consumptionRecords(book.expenses, book.operations);
  const current = summary(records, ranges.observed);
  const a = ranges.comparisonCurrent ? summary(records, ranges.comparisonCurrent) : null;
  const b = ranges.comparisonPrevious ? summary(records, ranges.comparisonPrevious) : null;
  const comparison = a && b ? {
    current: a, previous: b, consumption: delta(a.knownConsumptionKrw, b.knownConsumptionKrw),
    financialChanges: financialComparison(book, a.range, b.range),
    categoryContributions: [...new Set([...Object.keys(a.categoryTotalsKrw), ...Object.keys(b.categoryTotalsKrw)])].map(category => ({ category, ...delta(a.categoryTotalsKrw[category] ?? 0, b.categoryTotalsKrw[category] ?? 0) })).sort((x, y) => Math.abs(y.change) - Math.abs(x.change)),
    transactionContributionCount: a.recordedCount + b.recordedCount,
    transactionContributions: [...contributionRecords(records, a.range, 1), ...contributionRecords(records, b.range, -1)].sort((x, y) => Math.abs(y.contributionKrw ?? 0) - Math.abs(x.contributionKrw ?? 0)).slice(0, 10),
  } : null;
  const monthlyAllocations = months(ranges.observed).map(month => {
    const entries = records.filter(e => e.useKind === "period").map(e => ({ ...ref(e), title: e.title, amountKrw: monthAmount(e, month) })).filter(e => e.amountKrw !== undefined);
    const web = monthlyBook(book, { month, offset: 0, limit: 1 });
    return { month, coversWholeMonth: ranges.observed.start <= `${month}-01` && ranges.observed.end >= monthEnd(month), knownKrw: entries.reduce((s, e) => s + (e.amountKrw ?? 0), 0), pendingValuationCount: entries.filter(e => e.amountKrw === null).length, topEntries: entries.sort((a, b) => (b.amountKrw ?? 0) - (a.amountKrw ?? 0)).slice(0, 5), total: entries.length, registeredMonth: { dailyKrw: web.dailyKrw, periodKrw: web.recurringKrw, totalKrw: web.totalKrw, pending: web.pending, categoryTotalsKrw: web.categoryTotalsKrw, scope: "entire registered month, including saved future-dated records; exactly web monthly book" } };
  });
  const periodMonth = (month: string) => {
    const entries = records.filter(e => e.useKind === "period").map(item => ({ item, amount: monthAmount(item, month) })).filter(e => e.amount !== undefined);
    const categoryTotals: Record<string, number> = {};
    for (const e of entries) for (const c of categoryAmounts(e.item, e.amount ?? null)) if (c.amount !== null) categoryTotals[c.category] = (categoryTotals[c.category] ?? 0) + c.amount;
    return { month, knownKrw: entries.reduce((s, e) => s + (e.amount ?? 0), 0), pending: entries.filter(e => e.amount === null).length, categoryTotals, entries };
  };
  const thisPeriod = q.period === "month" ? periodMonth(ranges.observed.start.slice(0, 7)) : null;
  const previousMonth = shiftMonth(ranges.observed.start.slice(0, 7), -1);
  const lastPeriod = thisPeriod && previousMonth ? periodMonth(previousMonth) : null;
  const monthlyPeriodComparison = thisPeriod && lastPeriod ? {
    basis: "whole-month registered period allocations, never prorated or added to daily comparison; may include saved future-dated records",
    currentMonth: thisPeriod.month, previousMonth: lastPeriod.month, ...delta(thisPeriod.knownKrw, lastPeriod.knownKrw), currentPending: thisPeriod.pending, previousPending: lastPeriod.pending,
    categoryContributions: [...new Set([...Object.keys(thisPeriod.categoryTotals), ...Object.keys(lastPeriod.categoryTotals)])].map(category => ({ category, ...delta(thisPeriod.categoryTotals[category] ?? 0, lastPeriod.categoryTotals[category] ?? 0) })),
    transactionContributions: [...thisPeriod.entries.map(e => ({ ...ref(e.item), title: e.item.title, contributionKrw: e.amount ?? null })), ...lastPeriod.entries.map(e => ({ ...ref(e.item), title: e.item.title, contributionKrw: e.amount === null ? null : -e.amount! }))].sort((a, b) => Math.abs(b.contributionKrw ?? 0) - Math.abs(a.contributionKrw ?? 0)).slice(0, 10),
  } : null;
  const largeTransactions = records.filter(e => e.useKind === "once" && inRange(bookDate(e.useDate, e.useTime), ranges.observed)).sort((a, b) => (consumptionKrw(b) ?? -1) - (consumptionKrw(a) ?? -1)).slice(0, 8).map(e => ({ ...ref(e), title: e.title, category: e.category, date: bookDate(e.useDate, e.useTime), consumptionKrw: consumptionKrw(e) }));
  return {
    basis: { timezone: "Asia/Seoul", bookDayStartsAt: "05:00", ...ranges, consumption: "once-only net consumption; period allocations below are monthly context, never weekly prorated", unknowns: "known totals exclude unknown KRW values; no record does not establish no activity; retroactive cancellations/insurance affect history" },
    current, comparison, recentDays: ranges.recentDays ? summary(records, ranges.recentDays) : null,
    monthlyAllocations, monthlyPeriodComparison, largeTransactions,
    finance: (() => { const finance = financialSummary(book, ranges.observed); const active = finance.assets.filter(a => Object.keys(a.byReason).length > 0); return { ...finance, assetCount: finance.assets.length, activeAssetCount: active.length, assets: active.slice(0, 8), detailTool: "inspect_assets" }; })(),
    notableActivities: searchRecords(book, searchSchema.parse({ start: ranges.observed.start, end: ranges.observed.end, collection: "operations", limit: 8, dateBasis: "payment" })),
  };
}

function textMatches(fields: string[], query?: string) { return !query || fields.some(v => v.toLocaleLowerCase("ko-KR").includes(query.toLocaleLowerCase("ko-KR"))); }
function operationDates(o: Operation): string[] {
  return [...new Set([o.date, ...o.rows.map(r => r.date), ...(o.payment ? [o.payment.date] : []), ...(o.transitFunding ? [o.transitFunding.date] : []), ...(o.transitPaymentDate ? [o.transitPaymentDate] : [])])];
}
export function searchRecords(book: Book, q: z.infer<typeof searchSchema>) {
  const expenses = q.collection === "operations" ? [] : book.expenses.filter(e => {
    const d = q.dateBasis === "payment" ? e.paymentDate : q.dateBasis === "use" ? e.useDate : bookDate(e.useDate, e.useKind === "once" ? e.useTime : null);
    return inRange(d, q) && (!q.category || e.category === q.category || e.category === "mixed" && e.items.some(i => i.category === q.category)) && textMatches([e.title, e.memo, categories[e.category].label, ...e.items.map(i => i.name), ...e.items.flatMap(i => i.category ? [categories[i.category].label] : [])], q.query);
  }).map(e => ({ ...expenseBrief(e, book.operations), matchedItems: q.query ? e.items.filter(i => textMatches([i.name], q.query)).map(i => ({ id: i.id, name: i.name, quantity: i.quantity })) : [] }));
  const operations = q.collection === "expenses" ? [] : book.operations.filter(o => {
    const events = [{ date: o.date, time: o.time }, ...o.rows, ...(o.payment ? [o.payment] : []), ...(o.transitFunding ? [o.transitFunding] : []), ...(o.transitPaymentDate ? [{ date: o.transitPaymentDate, time: null }] : [])];
    const ds = events.map(e => q.dateBasis === "book" ? bookDate(e.date, e.time) : e.date);
    const synthetic = operationExpenses([o]);
    return ds.some(d => inRange(d, q)) && (!q.category || synthetic.some(e => e.category === q.category)) && textMatches([o.title, o.memo, ...synthetic.map(e => categories[e.category].label), ...o.rows.map(r => r.name), ...(o.journey ?? []).flatMap(j => [j.board.place, j.alight.place, j.vehicle.route, j.vehicle.number])], q.query);
  }).map(o => ({ collection: "operations", id: o.id, title: o.title, kind: o.kind, date: o.date, relatedDates: operationDates(o), currency: o.currency, amount: o.amount }));
  const rows = [...expenses, ...operations].sort((a, b) => ("paymentDate" in b ? b.paymentDate : b.date).localeCompare("paymentDate" in a ? a.paymentDate : a.date) || a.id.localeCompare(b.id));
  return { basis: "literal title/item/memo/category search; no merchant aliases or inferred consumption frequency; operation date matches may be nested", ...page(rows, q) };
}

function postingReason(book: Book, href: string): string {
  if (href.startsWith("/transactions/")) {
    const e = book.expenses.find(e => e.id === href.slice(14));
    return e?.loanPayment ? "loan_repayment" : e?.category === "loan" ? "loan_principal" : e?.category === "mixed" && e.items.some(i => i.category === "loan") ? "mixed_principal_and_consumption" : "expense_payment";
  }
  const op = book.operations.find(o => o.id === href.slice(9));
  return op?.kind === "income" && op.incomeCategory === "loan" ? "loan_drawdown" : op?.kind === "statement" ? "card_bill_payment" : op?.kind === "cancel" ? "card_refund" : op?.kind ?? "unknown";
}
function financialSummary(book: Book, r: Range) {
  const postings = operationPostings(book.operations, book.assets);
  const assets = book.assets.map(asset => {
    const rows = assetLedger(asset, book.expenses, postings).filter(row => row.included && inRange(row.entry.paymentDate, r));
    const byReason: Record<string, { inflowMinor: number; outflowMinor: number; netMinor: number; count: number }> = {};
    for (const row of rows) {
      const reason = postingReason(book, row.href), group = byReason[reason] ??= { inflowMinor: 0, outflowMinor: 0, netMinor: 0, count: 0 };
      group.netMinor += row.amount; group.count++; group.inflowMinor += Math.max(0, row.amount); group.outflowMinor += Math.max(0, -row.amount);
    }
    const loanPayments = book.expenses.filter(e => e.assetId === asset.id && e.loanPayment && e.paymentDate >= asset.openingDate && inRange(e.paymentDate, r));
    const linkedLoanRepayments = loanPayments.reduce((s, e) => ({ principalMinor: s.principalMinor + e.loanPayment!.principal, interestMinor: s.interestMinor + e.loanPayment!.interest, feeMinor: s.feeMinor + e.loanPayment!.fee }), { principalMinor: 0, interestMinor: 0, feeMinor: 0 });
    return { id: asset.id, name: asset.name, currency: asset.currency, netMinor: rows.reduce((s, row) => s + row.amount, 0), byReason, linkedLoanRepayments };
  });
  const incomeByCurrency: Record<string, number> = {};
  for (const o of book.operations.filter(o => o.kind === "income" && inRange(o.date, r))) incomeByCurrency[o.currency] = (incomeByCurrency[o.currency] ?? 0) + incomeMinor(o);
  return { range: r, dateBasis: "actual calendar payment dates (not 05:00 book dates)", incomeByCurrencyMinor: incomeByCurrency, assets, note: "asset flows are not consumption; transfers have two legs, never sum gross outflows as spending; loan history is not posted again" };
}

function financialComparison(book: Book, current: Range, previous: Range) {
  const a = financialSummary(book, current), b = financialSummary(book, previous);
  const changes = a.assets.map(asset => {
    const before = b.assets.find(x => x.id === asset.id)!;
    return { assetId: asset.id, name: asset.name, currency: asset.currency, changeMinor: asset.netMinor - before.netMinor, currentNetMinor: asset.netMinor, previousNetMinor: before.netMinor, reasonContributions: [...new Set([...Object.keys(asset.byReason), ...Object.keys(before.byReason)])].map(reason => ({ reason, changeMinor: (asset.byReason[reason]?.netMinor ?? 0) - (before.byReason[reason]?.netMinor ?? 0) })) };
  }).filter(a => a.reasonContributions.length > 0);
  return { dateBasis: "actual calendar payment dates; compare native minor units within each asset only", changedOrActiveAssetCount: changes.length, assets: changes.slice(0, 8), detailTool: "inspect_assets" };
}

export function inspectAssets(book: Book, q: z.infer<typeof assetsSchema>, now = new Date()) {
  const asOf = q.asOf ?? q.end ?? todayInSeoul(now);
  const selected = book.assets.filter(a => !q.assetId || a.id === q.assetId);
  if (q.assetId && !selected.length) throw new RepositoryError("자산을 찾을 수 없어요.", 404);
  const postings = operationPostings(book.operations, book.assets);
  const positions = selected.map(asset => ({ asset, position: assetPosition(asset, book.expenses, asOf, postings), startPosition: q.start ? assetPosition(asset, book.expenses, shiftDate(q.start, -1), postings) : null }));
  return {
    basis: { asOf, includesLiabilities: false, valuation: "current saved rates even for past dates", balance: "unknown opening balance stays null; net movement remains available", ledgerEnd: q.end ?? asOf },
    totalKnownKrw: positions.reduce((s, p) => s + (p.position.won ?? 0), 0), unvaluedCount: positions.filter(p => p.position.won === null).length,
    ...page(positions, q),
    movement: q.start && q.end ? financialSummary({ ...book, assets: selected }, { start: q.start, end: q.end }) : null,
    ledger: q.assetId ? page(assetLedger(selected[0], book.expenses, postings).filter(row => inRange(row.entry.paymentDate, { start: q.start, end: q.end ?? asOf })).map(row => ({ ...row, reason: postingReason(book, row.href), record: { collection: row.href.startsWith("/transactions/") ? "expenses" : "operations", id: row.href.split("/").at(-1)! } })), q) : null,
  };
}

export function inspectLoans(book: Book, q: z.infer<typeof loansSchema>, now = new Date()) {
  const loans = loansWithPayments(book.loans, book.expenses, todayInSeoul(now)).filter(l => !q.loanId || l.id === q.loanId);
  if (q.loanId && !loans.length) throw new RepositoryError("대출을 찾을 수 없어요.", 404);
  const summaries = loans.map(l => ({ ...loanSummary(l), recordedTotals: recordedLoanTotals(l), coverage: loanScheduleCoverage(l) }));
  // Reuse the web's monthly schedule/payment matching before applying the range.
  const scheduleRows = [...new Set(loans.flatMap(l => l.schedule.flatMap(s => s.dueDate && inRange(s.dueDate, q) ? [s.dueDate.slice(0, 7)] : [])))].sort().flatMap(month => monthlyLoanPayments(book.loans.filter(l => loans.some(x => x.id === l.id)), book.expenses, month).rows).filter(r => inRange(r.schedule.dueDate!, q)).map(r => ({ loanId: r.loan.id, loanName: r.loan.name, schedule: r.schedule, status: r.status, payment: r.payment, expenseId: r.existing?.id ?? null }));
  const repayments = loans.flatMap(l => l.repayments.filter(r => inRange(r.date, q)).map(row => ({ loanId: l.id, row })));
  const events = loans.flatMap(l => (l.events ?? []).filter(r => inRange(r.date, q)).map(row => ({ loanId: l.id, row })));
  const totals = scheduleRows.reduce((s, r) => ({ scheduledKrw: s.scheduledKrw + r.schedule.total, principalKrw: s.principalKrw + r.schedule.principal, interestKrw: s.interestKrw + r.schedule.interest, feeKrw: s.feeKrw + r.schedule.fee, recordedPaymentKrw: s.recordedPaymentKrw + (r.payment?.total ?? 0), unrecordedScheduledKrw: s.unrecordedScheduledKrw + (r.payment ? 0 : r.schedule.total) }), { scheduledKrw: 0, principalKrw: 0, interestKrw: 0, feeKrw: 0, recordedPaymentKrw: 0, unrecordedScheduledKrw: 0 });
  return {
    basis: { currency: "KRW", dateBasis: "schedule due date; repayments/events actual date", remainingPrincipal: "confirmed at each informationDate; recordedRemainingPrincipal subtracts only linked principal after that date through today", pending: "unrecorded, not proof of delinquency", support: "unmarked repayments do not establish personal spending", schedule: "registered rows only; incomplete coverage never implies payoff" },
    totalConfirmedPrincipalKrw: loans.reduce((s, l) => s + l.remainingPrincipal, 0), totalRecordedPrincipalKrw: loans.reduce((s, l) => s + (l.recordedRemainingPrincipal ?? l.remainingPrincipal), 0),
    unknownScheduleDateCount: loans.reduce((s, l) => s + l.schedule.filter(r => r.dueDate === null).length, 0), scheduleTotals: totals,
    ...(q.kind === "overview" ? page(summaries, q) : q.kind === "schedule" ? page(scheduleRows, q) : q.kind === "repayments" ? page(repayments, q) : page(events, q)),
  };
}

export function inspectRecurring(book: Book, q: z.infer<typeof recurringSchema>, now = new Date()) {
  const month = q.month ?? todayInSeoul(now).slice(0, 7);
  const rows = recurringRows(book.expenses, month);
  const groups = [...new Set(book.expenses.filter(e => e.monthlyRecurring || e.recurringSeriesId).map(e => recurringSeries(e)!))];
  if (q.seriesId && !groups.includes(q.seriesId)) throw new RepositoryError("반복 시리즈를 찾을 수 없어요.", 404);
  const histories = groups.filter(id => !q.seriesId || id === q.seriesId).map(id => {
    const history = book.expenses.filter(e => recurringSeries(e) === id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
    const current = rows.find(r => r.id === id);
    return { seriesId: id, title: history.at(-1)!.title, visibleInMonth: !!current, monthlyRecurringAsOfMonth: current?.latest.monthlyRecurring ?? false, recordingStatus: current?.current.length ? "recorded" : current ? "unrecorded" : "not_listed_for_month", currentRecordIds: current?.current.map(e => e.id) ?? [], previousRecordId: current?.previous?.id ?? null, recordedCount: history.length, latest: expenseBrief(history.at(-1)!, book.operations) };
  });
  const history = q.seriesId ? book.expenses.filter(e => recurringSeries(e) === q.seriesId).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id)) : [];
  const entries = history.map((e, i) => {
    const previous = history[i - 1];
    const amount = toMinor(e.paidAmount, e.currency)!;
    return { ...expenseBrief(e, book.operations), recurringSourceId: e.recurringSourceId ?? null, intervalDays: previous ? dayCount({ start: previous.paymentDate, end: e.paymentDate }) - 1 : null, paymentChangeMinor: previous?.currency === e.currency ? amount - toMinor(previous.paidAmount, previous.currency)! : null, consumptionChangeKrw: previous && netConsumption(e, book.operations) !== null && netConsumption(previous, book.operations) !== null ? netConsumption(e, book.operations)! - netConsumption(previous, book.operations)! : null };
  });
  return { month, basis: "recorded monthly period series; payment dates; history is not a forecast; missing records do not prove missed payments; histories include stored future-dated records", ...(q.seriesId ? { series: histories[0], ...page(entries, q) } : page(histories, q)) };
}

export function recordDetail(book: Book, q: z.infer<typeof detailSchema>) {
  const result = getRecord(q.collection === "loans" ? { ...book, loans: loansWithPayments(book.loans, book.expenses) } : book, q);
  const links: { relation: string; collection: string; id: string }[] = [];
  const add = (relation: string, collection: string, id?: string | null) => { if (id) links.push({ relation, collection, id }); };
  if (q.collection === "expenses") {
    const e = book.expenses.find(e => e.id === q.id)!;
    add("asset", "assets", e.assetId); add("loan", "loans", e.loanPayment?.loanId); add("recurring_source", "expenses", e.recurringSourceId);
    if (e.valuationSource?.includes("/")) add("valuation_source", "operations", e.valuationSource.split("/")[0]);
    if (e.monthlyRecurring || e.recurringSeriesId) for (const other of book.expenses.filter(x => x.id !== e.id && recurringSeries(x) === recurringSeries(e))) add("recurring_series", "expenses", other.id);
    for (const op of book.operations.filter(o => o.sourceId === e.id || o.parentId === e.id || o.selected.includes(e.id) || o.deferred.includes(e.id) || o.allocations.some(a => a.targetId === e.id))) add(op.kind, "operations", op.id);
  } else if (q.collection === "operations") {
    const o = book.operations.find(o => o.id === q.id)!;
    add("source", "expenses", o.sourceId); add("parent", "expenses", o.parentId); add("asset", "assets", o.assetId); add("payment_asset", "assets", o.payment?.assetId);
    for (const a of o.allocations) {
      const target = a.targetId.split("/")[0]; add("allocation", book.expenses.some(e => e.id === target) ? "expenses" : "operations", target);
    }
    for (const selected of [...o.selected, ...o.deferred]) add("statement_row", selected.startsWith("cancel:") || selected.startsWith("transfer:") ? "operations" : "expenses", selected.replace(/^(cancel:|transfer:)/, "").split("/")[0]);
    for (const row of o.rows) { add("transfer_from", "assets", row.fromId); add("transfer_to", "assets", row.toId); add("card", "cards", row.cardId ?? row.debitCardId); }
  } else if (q.collection === "loans") {
    for (const e of book.expenses.filter(e => e.loanPayment?.loanId === q.id)) add("repayment_expense", "expenses", e.id);
  }
  const unique = [...new Map(links.map(l => [JSON.stringify(l), l])).values()];
  return { ...result, relations: page(unique, q) };
}

export function bookOverview(book: Book) {
  return { ...overview(book), cards: book.cards, gameCurrencies: book.gameCurrencies, assetCount: book.assets.length, recurringSeriesCount: new Set(book.expenses.filter(e => e.monthlyRecurring || e.recurringSeriesId).map(e => recurringSeries(e))).size };
}
