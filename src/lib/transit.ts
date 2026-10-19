import { z } from "zod";
import { toMinor } from "./expense";

const text = z.string().max(120);
const money = z.string().max(20);
export const transitVehicleSchema = z.object({ group: text, route: text, number: text, municipality: text });
const tapSchema = z.object({ place: text, time: z.string().max(8).nullable(), base: money, distance: money, special: money, cause: text });
export const transitLegSchema = z.object({
  id: text.min(1), vehicle: transitVehicleSchema, board: tapSchema, alight: tapSchema,
  transfers: z.array(z.object({ id: text.min(1), tap: tapSchema, vehicle: transitVehicleSchema, gatePassed: z.boolean() })).max(10),
});
export const transitFundingSchema = z.object({ fromId: text, amount: money, date: text, time: z.string().max(8).nullable() });
export type TransitVehicle = z.infer<typeof transitVehicleSchema>;
export type TransitTap = z.infer<typeof tapSchema>;
export type TransitLeg = z.infer<typeof transitLegSchema>;
export const newTransitTap = (): TransitTap => ({ place: "", time: null, base: "", distance: "", special: "", cause: "" });
export const newTransitVehicle = (): TransitVehicle => ({ group: "수도권 전철", route: "2호선", number: "", municipality: "" });
export function newTransitLeg(id: string): TransitLeg {
  return { id, vehicle: newTransitVehicle(), board: newTransitTap(), alight: newTransitTap(), transfers: [] };
}
export function transitRoute(vehicle: TransitVehicle) {
  return vehicle.group === "수도권 전철" ? vehicle.route : `${vehicle.group} · ${vehicle.route} ${vehicle.number}${vehicle.municipality ? ` · ${vehicle.municipality}` : ""}`;
}
export function transitFare(tap: TransitTap) {
  const value = (s: string) => toMinor(s || "0", "KRW") ?? 0;
  return { base: value(tap.base), distance: value(tap.distance), special: value(tap.special), total: value(tap.base) + value(tap.distance) + value(tap.special) };
}
export function transitEvents(legs: readonly TransitLeg[]) {
  return legs.flatMap(leg => [
    { id: `${leg.id}-board`, action: "board" as const, tap: leg.board, vehicle: leg.vehicle },
    ...leg.transfers.filter(t => t.gatePassed).map(t => ({ id: `${leg.id}-${t.id}`, action: "transfer" as const, tap: t.tap, vehicle: t.vehicle })),
    { id: `${leg.id}-alight`, action: "alight" as const, tap: leg.alight, vehicle: leg.transfers.at(-1)?.vehicle ?? leg.vehicle },
  ]);
}
export function transitTotals(legs: readonly TransitLeg[]) {
  const causes = new Map<string, number>();
  const totals = { base: 0, distance: 0, special: 0, total: 0 };
  for (const { tap } of transitEvents(legs)) {
    const fare = transitFare(tap);
    totals.base += fare.base; totals.distance += fare.distance; totals.special += fare.special; totals.total += fare.total;
    if (fare.special) causes.set(tap.cause.trim() || "원인 미입력", (causes.get(tap.cause.trim() || "원인 미입력") ?? 0) + fare.special);
  }
  return { ...totals, causes: [...causes].map(([name, amount]) => ({ name, amount })) };
}
export function transitSeconds(time: string) {
  const [h, m, s = 0] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
export function validTransitTime(time: string | null) {
  return time === null || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
}
export function normalizeTransitTime(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const digits = /^(\d{2})(\d{2})(\d{2})?$/.exec(raw);
  const normalized = digits ? `${digits[1]}:${digits[2]}${digits[3] ? `:${digits[3]}` : ""}` : raw;
  return validTransitTime(normalized) ? normalized : raw;
}
export function validateTransitLegs(legs: readonly TransitLeg[]) {
  if (!legs.length) throw new Error("이용 구간을 추가해 주세요.");
  const ids = new Set<string>();
  const unique = (id: string) => { if (!id || ids.has(id)) throw new Error("교통 구간·환승 ID가 중복되었어요."); ids.add(id); };
  for (const leg of legs) {
    unique(leg.id);
    const vehicles = [leg.vehicle, ...leg.transfers.map(t => t.vehicle)];
    for (const v of vehicles) {
      if (!v.group.trim() || !v.route.trim()) throw new Error("교통수단과 노선을 선택해 주세요.");
      if (v.group !== "수도권 전철" && !v.number.trim()) throw new Error("버스 노선번호를 입력해 주세요.");
      if (v.group === "경기 버스" && !v.municipality.trim()) throw new Error("경기 버스 소속 시·군을 입력해 주세요.");
    }
    if (leg.transfers.length && leg.vehicle.group !== "수도권 전철") throw new Error("전철 내부 환승은 전철 구간에만 추가할 수 있어요.");
    for (const transfer of leg.transfers) {
      unique(transfer.id);
      if (transfer.vehicle.group !== "수도권 전철") throw new Error("내부 환승의 다음 노선은 전철이어야 해요.");
      if (!transfer.tap.place.trim()) throw new Error("환승역을 입력해 주세요.");
    }
  }
  let previous: number | null = null;
  for (const { tap } of transitEvents(legs)) {
    if (!tap.place.trim()) throw new Error("승차·하차 역 또는 정류소를 입력해 주세요.");
    if (!validTransitTime(tap.time)) throw new Error("승하차 시각은 24시간 HH:mm 또는 HH:mm:ss로 입력해 주세요.");
    for (const value of [tap.base, tap.distance, tap.special]) if (toMinor(value || "0", "KRW") === null) throw new Error("운임은 0 이상의 원화 정수로 입력해 주세요.");
    if (transitFare(tap).special > 0 && !tap.cause.trim()) throw new Error("특별요금 원인을 입력해 주세요.");
    if (tap.time !== null) {
      const seconds = transitSeconds(tap.time);
      if (previous !== null && seconds < previous) throw new Error("승차·환승·하차 시각 순서를 확인해 주세요.");
      previous = seconds;
    }
  }
  if (!Number.isSafeInteger(transitTotals(legs).total) || transitTotals(legs).total > 1_000_000_000_000) throw new Error("교통 운임 합계가 허용 범위를 초과했어요.");
}
