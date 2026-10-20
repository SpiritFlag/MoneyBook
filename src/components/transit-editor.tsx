"use client";
import { Field } from "./form-fields";
import { Button } from "./ui/button";
import { TransitJourney } from "./transit-journey";
import { normalizeTransitOperation, type OperationInput } from "@/lib/operations";
import { newTransitLeg, newTransitTap, newTransitVehicle, normalizeTransitTime, type TransitTap, type TransitVehicle, type TransitLeg } from "@/lib/transit";
import { transportOptions } from "@/lib/transit-options";
import { transitAssets } from "@/lib/transit-assets";
import type { EditorProps } from "./operation-editors";

function Text({ label, value, change, placeholder }: { label: string; value: string; change: (value: string) => void; placeholder?: string }) {
  return <Field label={label}><input className="form-control" lang="ko" inputMode="text" maxLength={120} placeholder={placeholder} value={value} onChange={e => change(e.target.value)} /></Field>;
}
function Fare({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <Field label={label}><input className="form-control tabular-nums" inputMode="numeric" placeholder="0원" value={value} onChange={e => change(e.target.value)} /></Field>;
}
export function TransitTime({ label, value, change }: { label: string; value: string | null; change: (value: string | null) => void }) {
  return <Field label={label} hint="24시간 HH:mm 또는 HH:mm:ss · 모르면 비워 두세요."><input className="form-control tabular-nums" inputMode="numeric" autoComplete="off" maxLength={8} placeholder="예: 09:30:15" value={value ?? ""} onChange={e => change(e.target.value || null)} onBlur={e => { const next = normalizeTransitTime(e.target.value); if (next !== value) change(next); }} /></Field>;
}
function Vehicle({ value, change, label, railOnly = false }: { value: TransitVehicle; change: (value: TransitVehicle) => void; label: string; railOnly?: boolean }) {
  return <fieldset className="min-w-0 rounded-xl bg-secondary/30 p-4"><legend className="px-1 text-sm font-medium">{label}</legend><div className="grid gap-4 sm:grid-cols-2">
    <Field label={`${label} 교통수단`}><select className="form-control" value={value.group} onChange={e => change({ ...value, group: e.target.value, route: transportOptions[e.target.value][0].name })}>{Object.keys(transportOptions).filter(g => !railOnly || g === "수도권 전철").map(g => <option key={g}>{g}</option>)}</select></Field>
    <Field label={`${label} 노선·버스 종류`}><select className="form-control" value={value.route} onChange={e => change({ ...value, route: e.target.value })}>{transportOptions[value.group]?.map(o => <option key={o.name}>{o.name}</option>)}</select></Field>
    {value.group !== "수도권 전철" ? <Text label={`${label} 버스 번호`} value={value.number} change={number => change({ ...value, number })} placeholder="예: 143, 602-1B" /> : null}
    {value.group === "경기 버스" ? <Text label={`${label} 소속 시·군`} value={value.municipality} change={municipality => change({ ...value, municipality })} placeholder="예: 용인, 성남" /> : null}
  </div></fieldset>;
}
function Tap({ label, value, change, showPlace = true, suggestedCause = "" }: { label: string; value: TransitTap; change: (value: TransitTap) => void; showPlace?: boolean; suggestedCause?: string }) {
  const patch = (next: Partial<TransitTap>) => change({ ...value, ...next });
  return <fieldset className="min-w-0 space-y-4 rounded-xl border border-primary/15 p-4"><legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="grid gap-4 sm:grid-cols-2">{showPlace ? <Text label={`${label} 역·정류소`} value={value.place} change={place => patch({ place })} /> : null}<TransitTime label={`${label} 시각`} value={value.time} change={time => patch({ time })} /></div>
    <div className="grid gap-4 sm:grid-cols-3"><Fare label={`${label} 기본운임`} value={value.base} change={base => patch({ base })} /><Fare label={`${label} 거리초과운임`} value={value.distance} change={distance => patch({ distance })} /><Fare label={`${label} 특별요금`} value={value.special} change={special => patch({ special, cause: value.cause || suggestedCause })} /></div>
    {value.special !== "" && value.special !== "0" ? <Text label={`${label} 특별요금 원인`} value={value.cause} change={cause => patch({ cause })} placeholder="예: 신분당선" /> : null}
  </fieldset>;
}
export function TransitEditor({ value, change, book }: EditorProps) {
  const legs = value.journey ?? [];
  const commit = (next: OperationInput) => change(normalizeTransitOperation(next));
  const update = (index: number, next: TransitLeg) => commit({ ...value, journey: legs.map((leg, i) => i === index ? next : leg) });
  const funding = value.transitFunding;
  const cards = transitAssets(book.assets, book.operations);
  return <div className="min-w-0 space-y-6">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="선불교통카드 자산"><select className="form-control" value={value.assetId} onChange={e => commit({ ...value, assetId: e.target.value })}><option value="">교통카드 선택</option>{cards.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="결제일"><input className="form-control" type="date" value={value.transitPaymentDate ?? value.date} onChange={e => commit({ ...value, transitPaymentDate: e.target.value })} /></Field></div>
    <p className="text-xs leading-6 text-muted-foreground">교통비는 이용일에 반영해요. 실제 차감은 각 승하차·환승게이트의 날짜·시각으로 기록하고, 모르는 시각은 추정하지 않아요.</p>
    <section className="space-y-4 rounded-2xl bg-background/70 p-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!funding} onChange={e => commit({ ...value, transitFunding: e.target.checked ? { fromId: "", amount: "10000", date: value.date, time: null } : null })} />교통카드 자동 충전</label>
      {funding ? <><div className="grid gap-4 sm:grid-cols-2"><Field label="충전 출금 자산"><select className="form-control" value={funding.fromId} onChange={e => commit({ ...value, transitFunding: { ...funding, fromId: e.target.value } })}><option value="">출금 자산 선택</option>{book.assets.filter(a => a.currency === "KRW" && a.id !== value.assetId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Fare label="충전 금액 · 원" value={funding.amount} change={amount => commit({ ...value, transitFunding: { ...funding, amount } })} /><Field label="충전일"><input type="date" className="form-control" value={funding.date} onChange={e => commit({ ...value, transitFunding: { ...funding, date: e.target.value } })} /></Field><TransitTime label="충전 시각" value={funding.time} change={time => commit({ ...value, transitFunding: { ...funding, time } })} /></div><p className="text-xs text-muted-foreground">자동 충전된 실제 날짜·시각을 입력하세요. 첫 승차 이후나 구간 사이의 충전도 기록할 수 있어요. 충전 금액은 교통 소비에 더하지 않아요.</p></> : null}
    </section>
    {legs.map((leg, index) => {
      const label = `구간 ${index + 1}`;
      return <section key={leg.id} className="min-w-0 space-y-5 rounded-2xl bg-background/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{label} · {index === 0 ? "첫 승차" : "다음 교통수단"}</h3><Button type="button" size="sm" variant="ghost" aria-label={`${label} 삭제`} onClick={() => commit({ ...value, journey: legs.filter((_, i) => i !== index) })}>구간 삭제</Button></div>
        <Vehicle label={label} value={leg.vehicle} change={vehicle => update(index, { ...leg, vehicle })} />
        <Tap label={`${label} 승차`} value={leg.board} change={board => update(index, { ...leg, board })} />
        {leg.transfers.map((transfer, ti) => {
          const name = `${label} 전철 환승 ${ti + 1}`;
          const patch = (next: Partial<typeof transfer>) => update(index, { ...leg, transfers: leg.transfers.map((t, i) => i === ti ? { ...t, ...next } : t) });
          return <section key={transfer.id} className="min-w-0 space-y-4 border-l-2 border-primary/25 pl-3 sm:pl-5"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{name}</h4><Button type="button" size="sm" variant="ghost" aria-label={`${name} 삭제`} onClick={() => update(index, { ...leg, transfers: leg.transfers.filter((_, i) => i !== ti) })}>삭제</Button></div>
            <Text label={`${name} 환승역`} value={transfer.tap.place} change={place => patch({ tap: { ...transfer.tap, place } })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transfer.gatePassed} onChange={e => patch({ gatePassed: e.target.checked })} />{name} · 환승게이트 통과</label>
            {transfer.gatePassed ? <Tap label={`${name} 게이트`} value={transfer.tap} showPlace={false} suggestedCause={[ti === 0 ? leg.vehicle : leg.transfers[ti - 1].vehicle, transfer.vehicle].some(v => v.route === "신분당선") ? "신분당선" : ""} change={tap => patch({ tap })} /> : <p className="text-xs text-muted-foreground">게이트 없는 내부 환승이에요. 임시 입력한 시각·요금은 보관하되 합계와 원장 차감에서 제외해요.</p>}
            <Vehicle label={`${name} 다음 노선`} value={transfer.vehicle} railOnly change={vehicle => patch({ vehicle })} />
          </section>;
        })}
        {leg.vehicle.group === "수도권 전철" ? <Button type="button" variant="secondary" size="sm" disabled={leg.transfers.length >= 10} onClick={() => update(index, { ...leg, transfers: [...leg.transfers, { id: crypto.randomUUID(), tap: newTransitTap(), vehicle: newTransitVehicle(), gatePassed: false }] })}>전철 내부 환승 추가</Button> : null}
        <Tap label={`${label} 하차`} value={leg.alight} suggestedCause={(leg.transfers.at(-1)?.vehicle ?? leg.vehicle).route === "신분당선" ? "신분당선" : ""} change={alight => update(index, { ...leg, alight })} />
      </section>;
    })}
    <Button type="button" variant="secondary" disabled={legs.length >= 20} onClick={() => commit({ ...value, journey: [...legs, newTransitLeg(crypto.randomUUID())] })}>이용 구간 추가 · 다음 교통수단 환승</Button>
    <TransitJourney legs={legs} />
  </div>;
}
