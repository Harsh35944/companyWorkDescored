import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

const baseCfg = {
  frontendUrl: "http://localhost:5173",
  cookieSecure: false,
  jwtSecret: "test-secret",
  clientId: "x",
  clientSecret: "x",
  redirectUri: "http://localhost:5173/api/auth/discord/callback",
  botRedirectUri: "http://localhost:5173/api/auth/bot/callback",
  botPermissions: "0",
  botToken: null,
  mongoUri: "mongodb://127.0.0.1:27017/test",
  port: 0,
  tokenEncryptionKey: null,
  jsonBodyLimitMb: 1,
};

test("GET /health returns liveness", async () => {
  const app = createApp(baseCfg, { readinessProbe: () => true });
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("GET /readiness returns 503 when probe false", async () => {
  const app = createApp(baseCfg, { readinessProbe: () => false });
  const res = await request(app).get("/readiness");
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { ok: false });
});

test("POST /api/auth/logout enforces csrf when session exists", async () => {
  const app = createApp(baseCfg, { readinessProbe: () => true });

  const agent = request.agent(app);
  const csrf = "csrf-test-token";

  const noCsrf = await agent.post("/api/auth/logout");
  assert.equal(noCsrf.status, 403);

  const ok = await agent
    .post("/api/auth/logout")
    .set("origin", baseCfg.frontendUrl)
    .set("x-csrf-token", csrf)
    .set("cookie", [`csrf_token=${csrf}`]);
  assert.equal(ok.status, 204);
});
