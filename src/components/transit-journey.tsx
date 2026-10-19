import { formatMinor } from "@/lib/expense";
import { transitEvents, transitFare, transitRoute, transitTotals, type TransitLeg } from "@/lib/transit";
import { transportOptions } from "@/lib/transit-options";

export function TransitJourney({ legs }: { legs: readonly TransitLeg[] }) {
  const totals = transitTotals(legs);
  return <section className="min-w-0 space-y-4" aria-label="교통 여정 미리보기">
    <h3 className="font-semibold">여정 · 운임 미리보기</h3>
    <ol className="space-y-4">{legs.map((leg, i) => <li key={leg.id} className="min-w-0 rounded-2xl bg-background/70 p-4">
      <p className="text-sm font-semibold">{i + 1}. {leg.board.place || "승차 장소"} → {leg.alight.place || "하차 장소"}</p>
      <div className="mt-3 flex flex-wrap gap-2">{[leg.vehicle, ...leg.transfers.map(t => t.vehicle)].map((v, vi) => <span key={vi} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs"><i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: transportOptions[v.group]?.find(o => o.name === v.route)?.color ?? "#537761" }} /><span className="break-words">{transitRoute(v)}</span></span>)}</div>
      {leg.transfers.map(t => <p key={t.id} className="mt-2 break-words text-xs text-muted-foreground">↳ {t.tap.place || "환승역"} · {t.gatePassed ? "환승게이트 통과" : "게이트 없는 내부 환승 · 차감 없음"}</p>)}
      <ol className="mt-4 space-y-3 border-l-2 border-primary/20 pl-4">{transitEvents([leg]).map(event => {
        const fare = transitFare(event.tap);
        return <li key={event.id} className="text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{event.action === "board" ? "승차" : event.action === "alight" ? "하차" : "환승게이트"} · {event.tap.place || "장소 미입력"} · {event.tap.time ?? "시각 미확인"}</span><strong>{formatMinor(fare.total, "KRW")}</strong></div><p className="mt-1 text-xs text-muted-foreground">기본 {formatMinor(fare.base, "KRW")} · 거리초과 {formatMinor(fare.distance, "KRW")} · 특별 {formatMinor(fare.special, "KRW")}{fare.special ? ` (${event.tap.cause || "원인 미입력"})` : ""}</p></li>;
      })}</ol>
    </li>)}</ol>
    <dl className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">{([ ["기본운임", totals.base], ["거리초과운임", totals.distance], ["특별요금", totals.special], ...totals.causes.map(c => [`↳ ${c.name}`, c.amount] as const), ["교통비 합계", totals.total] ] as const).map(([name, value]) => <div key={name} className="flex justify-between gap-3"><dt>{name}</dt><dd className="font-semibold tabular-nums">{formatMinor(value as number, "KRW")}</dd></div>)}</dl>
  </section>;
}
