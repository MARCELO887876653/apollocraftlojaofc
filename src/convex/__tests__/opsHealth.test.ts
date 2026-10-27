/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────
// `opsHealth:report` — o termômetro sob demanda.
//
// O ponto sensível: a taxa de requisições precisa ser MEDIDA, não extrapolada
// de uma janela recém-aberta. Antes, uma janela de 2 segundos com 1 chamada
// virava "30/min" e disparava o aviso de consumo alto sem motivo. Agora a
// medida vem da última janela COMPLETA; sem ela, o relatório diz `null` em vez
// de inventar número.
// ─────────────────────────────────────────────────────────────

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);
type T = ReturnType<typeof convexTest>;

type WindowSeed = {
  bucket: "read" | "write";
  windowStart: number;
  count: number;
  prevCount?: number;
  prevWindowStart?: number;
};

async function seedWindows(t: T, windows: WindowSeed[]) {
  await t.run(async (ctx) => {
    const keyId = await ctx.db.insert("apiKeysV1", {
      name: "addon",
      prefix: "sk_live_ab",
      keyHash: "h",
      lastFour: "abcd",
      scopes: ["deliveries:read"],
      serverId: "survival-01",
      active: true,
      createdAt: Date.now(),
    });
    for (const w of windows) {
      await ctx.db.insert("rateLimits", {
        key: `apiv1:${keyId}:${w.bucket}`,
        windowStart: w.windowStart,
        count: w.count,
        prevCount: w.prevCount,
        prevWindowStart: w.prevWindowStart,
      });
    }
  });
}

describe("opsHealth", () => {
  test("mede pela última janela completa, não pela janela recém-aberta", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // write: janela anterior inteira com 8 chamadas em 60 s → 8/min
    // read:  janela recém-aberta com 1 chamada em 2 s → sem medida confiável
    await seedWindows(t, [
      { bucket: "write", windowStart: now - 2_000, count: 1, prevCount: 8, prevWindowStart: now - 62_000 },
      { bucket: "read", windowStart: now - 2_000, count: 1 },
    ]);

    const report = await t.query(internal.opsHealth.report, { sample: 100 });

    const write = report.liveWindows.find((w) => w.key.endsWith(":write"));
    const read = report.liveWindows.find((w) => w.key.endsWith(":read"));
    expect(write?.perMinute).toBe(8);
    expect(write?.requestsInPreviousWindow).toBe(8);
    expect(read?.perMinute).toBeNull();

    expect(report.rates.requestsPerHour).toBe(480);
    expect(report.warnings.map((w) => w.code)).not.toContain("REQUESTS_HIGH");
    // a chave real nunca aparece no relatório
    expect(JSON.stringify(report)).not.toContain("sk_live_ab");
    expect(report.readOnly).toBe(true);
  });

  test("taxa acima do limite vira aviso, sem bloquear nada", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedWindows(t, [
      { bucket: "write", windowStart: now - 3_000, count: 2, prevCount: 12, prevWindowStart: now - 63_000 },
    ]);

    const report = await t.query(internal.opsHealth.report, { sample: 100 });
    expect(report.rates.requestsPerHour).toBe(720);
    const warning = report.warnings.find((w) => w.code === "REQUESTS_HIGH");
    expect(warning?.message).toContain("720");
    // nada é bloqueado: o relatório só informa
    expect(report.deletesNothing).toBe(true);
  });

  test("sem janela fechada ainda, não inventa taxa", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedWindows(t, [{ bucket: "write", windowStart: now - 1_000, count: 1 }]);

    const report = await t.query(internal.opsHealth.report, { sample: 100 });
    expect(report.rates.requestsPerHour).toBeNull();
    expect(report.warnings.map((w) => w.code)).not.toContain("REQUESTS_HIGH");
  });
});
