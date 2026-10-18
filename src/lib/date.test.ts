import assert from "node:assert/strict";
import test from "node:test";
import { parseDateParts, parseDateQuery, shiftDate } from "./date";
import { daySummary } from "./expense";
import { seedExpenses } from "./seed-expenses";

test("존재하는 날짜만 확정하고 입력 도중 값은 거절한다", () => {
  assert.equal(parseDateParts("2026", "2", "31"), null);
  assert.equal(parseDateParts("2026", "2", "29"), null);
  assert.equal(parseDateParts("2028", "2", "29"), "2028-02-29");
  assert.equal(parseDateParts("2026", "", "1"), null);
  assert.equal(parseDateParts("2026", "1.5", "1"), null);
  assert.equal(parseDateParts("2026", "0", "1"), null);
  assert.equal(parseDateParts("2026", "10", "18"), "2026-10-18");
});

test("월말·연말 이동과 날짜 범위 경계를 지킨다", () => {
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2028-03-01", -1), "2028-02-29");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("1900-01-01", -1), "1900-01-01");
  assert.equal(shiftDate("9999-12-31", 1), "9999-12-31");
});

test("주소의 날짜는 실제 존재하는 ISO 날짜만 받아들인다", () => {
  assert.equal(parseDateQuery("2026-10-17"), "2026-10-17");
  assert.equal(parseDateQuery("2026-02-31"), null);
  assert.equal(parseDateQuery("2026-1-7"), null);
  assert.equal(parseDateQuery("2026-10-17T00:00:00Z"), null);
  assert.equal(parseDateQuery(null), null);
});

test("결제 전체액 대신 본인 부담액을 합산하고 빈 날짜는 0이다", () => {
  assert.equal(daySummary(seedExpenses, "2026-10-18").total, 19500);
  assert.equal(daySummary(seedExpenses, "2026-10-17").total, 1500);
  assert.equal(daySummary(seedExpenses, "2026-10-16").total, 0);
});
