import { describe, expect, test } from "vitest";
import { toForm, formToData } from "./Products";

// ─────────────────────────────────────────────────────────────
// Regressão: o editor de produtos apagava a referência local do kit
// (mode/referenceId/referenceRevision/actionId) ao abrir e salvar.
// Estes testes garantem que a receita enviada pelo addon sobrevive
// ao ciclo toForm → formToData, inclusive repetidamente.
// ─────────────────────────────────────────────────────────────

const LOCAL_ACTION = {
  actionId: "give-kit",
  action: "GIVE_KIT",
  mode: "LOCAL_REFERENCE",
  referenceId: "kit:t3tse",
  referenceRevision: 7,
  quantityMode: "IGNORE",
  contentsPreview: [{ type_id: "minecraft:diamond_sword", name: "Espada", amount: 1 }],
  payload: {},
  serverId: "survival-01",
  addonId: "apollo-store",
  offlineExecute: true,
};

function productWith(deliveryV1: any, overrides: Record<string, any> = {}) {
  return {
    _id: "prod1",
    name: "teste",
    slug: "teste",
    shortDescription: "",
    description: "",
    image: "",
    images: [],
    categoryId: undefined,
    tags: [],
    priceCents: 1000,
    compareAtPriceCents: undefined,
    stock: 0,
    unlimitedStock: true,
    active: true,
    featured: false,
    popular: false,
    hidden: false,
    minQty: 1,
    maxQty: 99,
    order: 0,
    benefits: [],
    salesCount: 0,
    delivery: { type: "none", showToCustomer: true },
    deliveryV1,
    ...overrides,
  };
}

function localProduct() {
  return productWith({ enabled: true, version: 1, actions: [{ ...LOCAL_ACTION }] });
}

describe("editor de produto — preservação da receita de entrega", () => {
  test("receita LOCAL_REFERENCE completa sobrevive a toForm → formToData", () => {
    const data = formToData(toForm(localProduct()));

    expect(data.deliveryV1.enabled).toBe(true);
    expect(data.deliveryV1.version).toBe(1);
    expect(data.deliveryV1.actions).toHaveLength(1);
    // mode / referenceId / referenceRevision / actionId / contentsPreview / quantityMode
    expect(data.deliveryV1.actions[0]).toMatchObject(LOCAL_ACTION);
  });

  test("salvar repetidamente NÃO degrada a receita", () => {
    let product: any = localProduct();
    for (let i = 0; i < 6; i++) {
      // simula: abrir o produto salvo → salvar de novo
      const data = formToData(toForm(product));
      product = productWith(data.deliveryV1);
    }
    const final = formToData(toForm(product));
    expect(final.deliveryV1.actions).toHaveLength(1);
    expect(final.deliveryV1.actions[0]).toMatchObject(LOCAL_ACTION);
  });

  test("editar preço/nome/categoria não altera a receita", () => {
    const form = toForm(localProduct());
    form.name = "teste editado";
    form.price = "99.90";
    form.categoryId = "cat-123";

    const data = formToData(form);

    expect(data.name).toBe("teste editado");
    expect(data.priceCents).toBe(9990);
    expect(data.categoryId).toBe("cat-123");
    expect(data.deliveryV1.actions[0]).toMatchObject(LOCAL_ACTION);
  });

  test("editar o payload preserva a referência local", () => {
    const form = toForm(localProduct());
    form.deliveryV1.actions[0].payloadText = '{ "note": "editado" }';

    const data = formToData(form);

    expect(data.deliveryV1.actions[0].payload).toEqual({ note: "editado" });
    expect(data.deliveryV1.actions[0].referenceId).toBe("kit:t3tse");
    expect(data.deliveryV1.actions[0].referenceRevision).toBe(7);
  });

  test("editar a revisão da referência é respeitado (vem do addon)", () => {
    const form = toForm(localProduct());
    form.deliveryV1.actions[0].referenceRevision = "9";

    const data = formToData(form);
    expect(data.deliveryV1.actions[0].referenceRevision).toBe(9);
    expect(data.deliveryV1.actions[0].referenceId).toBe("kit:t3tse");
  });

  test("ação SERVER não inventa referência local", () => {
    const product = productWith({
      enabled: true,
      actions: [
        {
          action: "ADD_MONEY",
          payload: { amount: 100 },
          serverId: "survival-01",
          addonId: "economy",
          offlineExecute: true,
        },
      ],
    });

    const data = formToData(toForm(product));

    expect(data.deliveryV1.actions[0]).toMatchObject({
      action: "ADD_MONEY",
      mode: "SERVER",
      payload: { amount: 100 },
      serverId: "survival-01",
      addonId: "economy",
    });
    expect(data.deliveryV1.actions[0].referenceId).toBeUndefined();
    expect(data.deliveryV1.actions[0].referenceRevision).toBeUndefined();
  });
});
