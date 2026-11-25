import { describe, expect, test } from "vitest";
import docs from "../content/apollo-api-v1.md?raw";
import openapi from "../../public/openapi-v1.json";

describe("documentação da API v1", () => {
  test("cobre entrega por shulker, confirmação individual e recuperação", () => {
    for (const term of [
      "part_index",
      "part_total",
      "part_id",
      "part_label",
      "payload.kit_part",
      "step_index",
      "unit_index",
      "INVENTORY_FULL",
      "PLAYER_OFFLINE",
      "KIT GOD",
      "KIT GUERREIRO",
      "34 pedidos",
      "Não reenvie",
      "2.2.0",
      "idempot",
    ]) {
      expect(docs).toContain(term);
    }
  });

  test("inclui os exemplos completos dos dois kits com 3 partes", () => {
    expect(docs).toContain('"reference_id": "kit:kit_god"');
    expect(docs).toContain('"reference_id": "kit:kit_guerreiro"');
    expect(docs.match(/"id": "armaduras"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(docs).toContain("6 comandos");
  });

  test("OpenAPI documenta parts e os campos de shulker no comando", () => {
    const schemas = openapi.components.schemas as any;
    expect(schemas.DeliveryPart).toBeTruthy();
    expect(schemas.DeliveryAction.properties.parts).toBeTruthy();
    for (const field of [
      "unit_index",
      "part_index",
      "part_total",
      "part_id",
      "part_label",
    ]) {
      expect(schemas.QueuedCommand.properties[field]).toBeTruthy();
    }
    const patch = (openapi.paths as any)["/app/command/{id}"].patch;
    expect(patch.requestBody.content["application/json"].schema.properties.error_code.enum).toContain(
      "INVENTORY_FULL",
    );
  });
});
