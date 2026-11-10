import { Fragment, type CSSProperties } from "react";
import { formatMinor } from "@/lib/expense";
import { transitFare, transitRoute, transitTotals, type TransitLeg, type TransitTap, type TransitVehicle } from "@/lib/transit";
import { transportOptions } from "@/lib/transit-options";
import styles from "./transit-journey.module.css";

function routeStyle(vehicle: TransitVehicle): CSSProperties {
  return { "--route-color": transportOptions[vehicle.group]?.find(option => option.name === vehicle.route)?.color ?? "#537761" } as CSSProperties;
}

function JourneyStop({ tap, label, charged = true, first = false, last = false, connects = false }: {
  tap: TransitTap; label: string; charged?: boolean; first?: boolean; last?: boolean; connects?: boolean;
}) {
  const fare = transitFare(tap);
  return <div className={`${styles.stop} ${first ? styles.first : ""} ${last ? styles.last : ""} ${connects ? styles.connects : ""}`}>
    {charged ? <time className={styles.time}>{tap.time ?? "시각 미확인"}</time> : <span className={styles.time}>—</span>}
    <i aria-hidden="true" className={styles.dot} />
    <div className={styles.stopContent}>
      <div className={styles.stopLine}><strong>{tap.place || "장소 미입력"}</strong>{charged ? <b>{formatMinor(fare.total, "KRW")}</b> : null}</div>
      <p className={styles.action}>{label}</p>
      {charged ? <ul className={styles.branches}>
        <li><span>기본운임</span><span>{formatMinor(fare.base, "KRW")}</span></li>
        <li><span>거리초과운임</span><span>{formatMinor(fare.distance, "KRW")}</span></li>
        <li><span>특별요금{fare.special ? ` · ${tap.cause || "원인 미입력"}` : ""}</span><span>{formatMinor(fare.special, "KRW")}</span></li>
      </ul> : null}
    </div>
  </div>;
}

function JourneyRoute({ vehicle }: { vehicle: TransitVehicle }) {
  return <div className={styles.route} style={routeStyle(vehicle)}><span>{transitRoute(vehicle) || "노선 미입력"}</span></div>;
}

export function TransitJourney({ legs }: { legs: readonly TransitLeg[] }) {
  const totals = transitTotals(legs);
  return <section className="min-w-0 space-y-6" aria-label="교통 여정 미리보기">
    <h3 className="font-semibold">이동 경로 · 운임</h3>
    <ol className={styles.journey} aria-label="이동 경로">{legs.map((leg, index) => {
      const lastVehicle = leg.transfers.at(-1)?.vehicle ?? leg.vehicle;
      return <li key={leg.id}>
        {index > 0 ? <div className={styles.transfer}>환승 · 다음 교통수단</div> : null}
        <div style={routeStyle(leg.vehicle)}>
          <JourneyStop tap={leg.board} label="승차" first={index === 0} />
          <JourneyRoute vehicle={leg.vehicle} />
          {leg.transfers.map(transfer => <Fragment key={transfer.id}>
            <div style={routeStyle(transfer.vehicle)}>
              <JourneyStop tap={transfer.tap} label={transfer.gatePassed ? "전철 환승 · 환승게이트 통과" : "전철 내부 환승 · 게이트 통과 없음 · 차감 없음"} charged={transfer.gatePassed} />
            </div>
            <JourneyRoute vehicle={transfer.vehicle} />
          </Fragment>)}
          <div style={routeStyle(lastVehicle)}><JourneyStop tap={leg.alight} label="하차" last connects={index < legs.length - 1} /></div>
        </div>
      </li>;
    })}</ol>
    <dl className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">{([
      ["기본운임", totals.base], ["거리초과운임", totals.distance], ["특별요금", totals.special],
      ...totals.causes.map(cause => [`↳ ${cause.name}`, cause.amount] as const), ["교통비 합계", totals.total],
    ] as const).map(([name, value]) => <div key={name} className="flex justify-between gap-3"><dt>{name}</dt><dd className="font-semibold tabular-nums">{formatMinor(value as number, "KRW")}</dd></div>)}</dl>
  </section>;
}
