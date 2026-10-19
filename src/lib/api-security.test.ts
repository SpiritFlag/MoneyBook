import test from "node:test";
import assert from "node:assert/strict";
import { requireLocal, readLocalBody, localJson } from "./local-api";
import { createNeonRepository } from "./neon-repository";

test("클라우드 API는 같은 화면의 요청을 허용하고 다른 사이트의 쓰기를 거절한다", async () => {
  const make = (origin: string, site = "same-origin") => new Request("https://moneybook.example/api/assets", { method: "POST", headers: { host: "moneybook.example", origin, "sec-fetch-site": site, "content-type": "application/json" }, body: "{}" });
  assert.deepEqual(await readLocalBody(make("https://moneybook.example")), {});
  assert.throws(() => requireLocal(make("https://other.example")), { status: 403 });
  assert.throws(() => requireLocal(make("https://moneybook.example", "cross-site")), { status: 403 });
  assert.equal(localJson([]).headers.get("cache-control"), "private, no-store");
});

test("DB 설정이나 인증이 없으면 로컬 저장으로 대체하지 않는다", () => {
  assert.throws(() => createNeonRepository("", ""), { status: 401 });
  assert.throws(() => createNeonRepository("user_test", ""), { status: 503 });
});
