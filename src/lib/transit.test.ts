import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { newAsset, assetPosition, assetLedger } from "./asset";
import { newOperation, newRow, normalizeTransitOperation, operationPostings, operationExpenses, consumptionRecords, type OperationInput } from "./operations";
import { newTransitLeg, newTransitTap, newTransitVehicle, normalizeTransitTime, transitTotals, validateTransitLegs, type TransitLeg } from "./transit";
import { bookTimeOrder } from "./date";
import { dailyExpenses, daySummary, monthAmount } from "./expense";

const date = "2026-10-19";
function journey(): TransitLeg[] {
  const leg = newTransitLeg("rail");
  leg.board = { ...newTransitTap(), place: "강남", time: "09:00:10", base: "1550" };
  leg.transfers = [{ id: "gate", vehicle: { ...newTransitVehicle(), route: "신분당선" }, gatePassed: true,
    tap: { ...newTransitTap(), place: "정자", time: "09:20:15", base: "100", special: "1000", cause: "신분당선" } },
  { id: "no-gate", vehicle: { ...newTransitVehicle(), route: "수인·분당선" }, gatePassed: false,
    tap: { ...newTransitTap(), place: "미금", time: "잘못된 시각", special: "9999" } }];
  leg.alight = { ...newTransitTap(), place: "수원", time: "09:40:20", distance: "200" };
  const bus = newTransitLeg("bus");
  bus.vehicle = { group: "경기 버스", route: "일반버스", number: "13-4", municipality: "용인" };
  bus.board = { ...newTransitTap(), place: "수원역", time: "09:50:00", base: "0" };
  bus.alight = { ...newTransitTap(), place: "집", time: "10:10:00", base: "100", distance: "100" };
  return [leg, bus];
}
function fixture() {
  let book: Book = storedSchema.parse({ version: 1, expenses: [], assets: [], operations: [] });
  const repo = createBookRepository({ read: async () => storedSchema.parse(structuredClone(book)), transact: async fn => fn(storedSchema.parse(structuredClone(book)), async next => { book = storedSchema.parse(structuredClone(next)); }) });
  return { repo, read: () => book };
}
test("구간·게이트·운임 구성을 보존하고 게이트 없는 환승은 경로에만 남긴다", () => {
  const legs = journey();
  validateTransitLegs(legs);
  assert.deepEqual(transitTotals(legs), { base: 1750, distance: 300, special: 1000, total: 3050, causes: [{ name: "신분당선", amount: 1000 }] });
  const input = normalizeTransitOperation({ ...newOperation("transit", date), journey: legs });
  assert.equal(input.rows.length, 5);
  assert.equal(input.rows.some(r => r.id.includes("no-gate")), false);
  assert.equal(input.rows[1].time, "09:20:15");
  assert.equal(input.rows[3].amount, "0");
  assert.equal(input.amount, "3050");
  assert.equal(input.time, "09:00:10");
  const withGate = structuredClone(legs);
  withGate[0].transfers[1].gatePassed = true;
  assert.throws(() => validateTransitLegs(withGate), /시각/);
  assert.equal(bookTimeOrder("09:00:10") < bookTimeOrder("09:00:20"), true);
  assert.equal(normalizeTransitTime("093015"), "09:30:15");
  assert.equal(normalizeTransitTime("0930"), "09:30");
  assert.equal(normalizeTransitTime(""), null);
  assert.equal(normalizeTransitTime("250000"), "250000");
});
test("특별요금 원인·버스 시군·시각 순서·음수 운임을 검증한다", () => {
  const invalid = (change: (legs: TransitLeg[]) => void, message: RegExp) => { const legs = journey(); change(legs); assert.throws(() => validateTransitLegs(legs), message); };
  invalid(l => { l[0].transfers[0].tap.cause = ""; }, /특별요금 원인/);
  invalid(l => { l[1].vehicle.municipality = ""; }, /시·군/);
  invalid(l => { l[0].alight.time = "08:59:59"; }, /순서/);
  invalid(l => { l[0].board.base = "-1"; }, /정수/);
  invalid(l => { l[0].transfers[0].vehicle.group = "서울 버스"; l[0].transfers[0].vehicle.number = "143"; }, /전철/);
  invalid(l => { l[0].transfers[0].id = l[0].id; }, /중복/);
  const unknown = journey(); unknown[0].board.time = null;
  validateTransitLegs(unknown);
  assert.equal(normalizeTransitOperation({ ...newOperation("transit", date), journey: unknown }).time, null);
});
test("교통과 자동 충전은 원자 저장하고 소비·원장·수정·재시도에 중복 반영하지 않는다", async () => {
  const { repo, read } = fixture();
  await repo.saveAsset({ ...newAsset(date), name: "은행", openingBalance: "30000" }, "bank", null);
  await repo.saveAsset({ ...newAsset(date), name: "선불교통", kind: "stored", openingBalance: "1000" }, "transit", null);
  const input: OperationInput = { ...newOperation("transit", date), title: "출근", assetId: "transit", journey: journey(),
    transitFunding: { fromId: "bank", amount: "10000", date, time: "09:00:00" }, transitPaymentDate: "2026-10-20" };
  await repo.saveOperation(input, "trip", null);
  await repo.saveOperation(input, "trip", null);
  let saved = (await repo.listOperations())[0];
  assert.deepEqual(saved.journey, input.journey);
  assert.equal(saved.transitFunding?.amount, "10000");
  assert.equal(read().operations.length, 1);
  let postings = operationPostings(read().operations, read().assets);
  assert.equal(assetPosition(read().assets[0], [], date, postings).balance, 20000);
  assert.equal(assetPosition(read().assets[1], [], date, postings).balance, 7950);
  assert.equal(assetLedger(read().assets[1], [], postings).length, 6);
  const daily = operationExpenses(read().operations);
  assert.equal(daily[0].paidAmount, "3050");
  assert.equal(daily[0].time, null);
  assert.equal(daily[0].useTime, "09:00:10");
  assert.equal(dailyExpenses(daily, date).length, 1);
  assert.equal(dailyExpenses(daily, "2026-10-20").length, 1);
  assert.equal(daySummary(daily, date).total, 3050);
  assert.equal(monthAmount(daily[0], "2026-10"), 3050);
  assert.equal(consumptionRecords([], read().operations).length, 1);
  await assert.rejects(repo.saveOperation({ ...input, transitFunding: { ...input.transitFunding!, time: "25:00:00" } }, saved.id, saved.revision), /날짜·시각/);
  assert.equal((await repo.listOperations())[0].revision, 1);
  await assert.rejects(repo.saveOperation({ ...input, transitFunding: { ...input.transitFunding!, fromId: "transit" } }, saved.id, saved.revision), /출발 자산/);
  const updated = structuredClone(input);
  updated.journey![0].transfers[0].gatePassed = false;
  await repo.saveOperation(updated, saved.id, saved.revision);
  saved = (await repo.listOperations())[0];
  assert.equal(saved.amount, "1950");
  assert.equal(saved.journey![0].transfers[0].tap.special, "1000");
  postings = operationPostings(read().operations, read().assets);
  assert.equal(assetPosition(read().assets[1], [], date, postings).balance, 9050);
  await repo.saveOperation({ ...saved, transitFunding: null }, saved.id, saved.revision);
  postings = operationPostings(read().operations, read().assets);
  assert.equal(assetPosition(read().assets[0], [], date, postings).balance, 30000);
});
test("첫 승차 이후·구간 사이 충전도 실제 시각으로 저장하고 수정·재시도에 중복 반영하지 않는다", async () => {
  const { repo, read } = fixture();
  await repo.saveAsset({ ...newAsset(date), name: "은행", openingBalance: "30000" }, "bank", null);
  await repo.saveAsset({ ...newAsset(date), name: "교통", kind: "stored", openingBalance: "1000" }, "transit", null);
  const input: OperationInput = { ...newOperation("transit", date), title: "환승 중 충전", assetId: "transit", journey: journey(), transitFunding: { fromId: "bank", amount: "10000", date, time: "09:45:00" } };
  await repo.saveOperation(input, "trip", null);
  await repo.saveOperation(input, "trip", null);
  let saved = (await repo.listOperations())[0];
  assert.equal(saved.transitFunding?.time, "09:45:00");
  let postings = operationPostings(read().operations, read().assets);
  const rows = assetLedger(read().assets[1], [], postings);
  assert.equal(rows[0].entry.time, "09:00:10");
  assert.equal(rows[0].after, -550);
  assert.equal(rows.find(r => r.amount === 10000)?.entry.time, "09:45:00");
  assert.equal(assetPosition(read().assets[1], [], date, postings).balance, 7950);
  assert.equal(daySummary(operationExpenses(read().operations), date).total, 3050);
  await repo.saveOperation({ ...saved, transitFunding: { ...saved.transitFunding!, date: "2026-10-20", time: null } }, saved.id, saved.revision);
  saved = (await repo.listOperations())[0];
  postings = operationPostings(read().operations, read().assets);
  assert.equal(saved.transitFunding?.date, "2026-10-20");
  assert.equal(assetPosition(read().assets[0], [], date, postings).balance, 30000);
  assert.equal(assetPosition(read().assets[1], [], date, postings).balance, -2050);
  assert.equal(assetPosition(read().assets[1], [], "2026-10-20", postings).balance, 7950);
  assert.equal(postings.filter(p => p.amount === 10000).length, 1);
});

test("기존 사건형 교통 기록은 이름·노선·시각·차감액 그대로 수정한다", async () => {
  const { repo } = fixture();
  await repo.saveAsset({ ...newAsset(date), name: "교통", kind: "stored" }, "transit", null);
  const legacy = { ...newOperation("transit", date), title: "기존 여정", assetId: "transit", amount: "1500", rows: [{ ...newRow(date, "legacy"), name: "기존 역", route: "기존 노선", time: "09:00", amount: "1500" }] };
  await repo.saveOperation(legacy, "legacy", null);
  const saved = (await repo.listOperations())[0];
  assert.equal(saved.journey, undefined);
  await repo.saveOperation({ ...saved, memo: "메모 수정" }, saved.id, saved.revision);
  assert.deepEqual((await repo.listOperations())[0].rows, legacy.rows);
});
