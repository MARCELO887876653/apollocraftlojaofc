import { describe, expect, test } from "vitest";
import {
  isClientPreview,
  storeAccess,
  withClientPreview,
  withoutClientPreview,
} from "./maintenance";

describe("flag de pré-visualização do cliente (?cliente=1)", () => {
  test("reconhece 1 e true, com ou sem '?'", () => {
    expect(isClientPreview("?cliente=1")).toBe(true);
    expect(isClientPreview("cliente=1")).toBe(true);
    expect(isClientPreview("?cliente=true")).toBe(true);
    expect(isClientPreview("?produto=vip&cliente=1")).toBe(true);
  });

  test("ignora valores diferentes e ausência", () => {
    for (const search of ["", "?", "?cliente=0", "?cliente=false", "?outro=1"]) {
      expect(isClientPreview(search)).toBe(false);
    }
  });

  test("liga o flag preservando os outros parâmetros", () => {
    expect(withClientPreview("")).toBe("?cliente=1");
    expect(withClientPreview("?cupom=OFF10")).toBe("?cupom=OFF10&cliente=1");
  });

  test("desliga o flag sem perder os outros parâmetros", () => {
    expect(withoutClientPreview("?cliente=1")).toBe("");
    expect(withoutClientPreview("?cliente=1&cupom=OFF10")).toBe("?cupom=OFF10");
    expect(withoutClientPreview("")).toBe("");
  });
});

describe("quem vê a loja com a manutenção ligada", () => {
  const base = { teamResolved: true, isStaff: false, clientPreview: false };

  test("manutenção desligada → loja normal para todos", () => {
    expect(storeAccess({ ...base, maintenanceEnabled: false })).toBe("open");
    expect(storeAccess({ ...base, maintenanceEnabled: undefined })).toBe("open");
    expect(storeAccess({ ...base, maintenanceEnabled: false, isStaff: true, clientPreview: true })).toBe("open");
  });

  test("manutenção ligada + visitante → tela de manutenção", () => {
    expect(storeAccess({ ...base, maintenanceEnabled: true })).toBe("closed");
  });

  test("manutenção ligada + equipe → navega com aviso (não é a tela de manutenção)", () => {
    expect(storeAccess({ ...base, maintenanceEnabled: true, isStaff: true })).toBe("staff");
  });

  test("manutenção ligada + equipe em pré-visualização → exatamente a visão do cliente", () => {
    expect(
      storeAccess({ ...base, maintenanceEnabled: true, isStaff: true, clientPreview: true }),
    ).toBe("closed");
  });

  test("manutenção ligada + visitante com o flag → continua na tela de manutenção", () => {
    expect(storeAccess({ ...base, maintenanceEnabled: true, clientPreview: true })).toBe("closed");
  });

  test("enquanto a equipe não respondeu, não pisca a tela de manutenção", () => {
    expect(storeAccess({ ...base, maintenanceEnabled: true, teamResolved: false })).toBe("checking");
    expect(
      storeAccess({ ...base, maintenanceEnabled: true, teamResolved: false, isStaff: true }),
    ).toBe("checking");
  });
});
