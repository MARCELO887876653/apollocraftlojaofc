import { describe, expect, it } from "vitest";
import { selectHomeProducts } from "./storefrontData";

// A home deixou de abrir uma assinatura por seção: as quatro listas saem de uma
// varredura só, aqui. Estes testes garantem que a regra é EXATAMENTE a das
// queries antigas (products.listFeatured / listPromo / listPopular / listNewest).

const product = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  hidden: false,
  featured: false,
  popular: false,
  order: 0,
  salesCount: 0,
  createdAt: 0,
  priceCents: 1000,
  compareAtPriceCents: undefined as number | undefined,
  ...overrides,
});

describe("selectHomeProducts", () => {
  it("destaques: só os marcados, na ordem do painel", () => {
    const all = [
      product("c", { featured: true, order: 3 }),
      product("nao", {}),
      product("a", { featured: true, order: 1 }),
      product("oculto", { featured: true, order: 0, hidden: true }),
      product("b", { featured: true, order: 2 }),
    ];

    expect(selectHomeProducts(all, "featured").map((p) => p._id)).toEqual(["a", "b", "c"]);
  });

  it("promoções: só com preço riscado maior, mais novas primeiro", () => {
    const all = [
      product("antiga", { compareAtPriceCents: 2000, createdAt: 10 }),
      product("sem-desconto", { compareAtPriceCents: 1000, createdAt: 99 }),
      product("recente", { compareAtPriceCents: 1500, createdAt: 20 }),
    ];

    expect(selectHomeProducts(all, "promo").map((p) => p._id)).toEqual(["recente", "antiga"]);
  });

  it("mais vendidos: só os marcados, do mais vendido para o menos", () => {
    const all = [
      product("pouco", { popular: true, salesCount: 2 }),
      product("muito", { popular: true, salesCount: 50 }),
      product("fora", { salesCount: 100 }),
    ];

    expect(selectHomeProducts(all, "popular").map((p) => p._id)).toEqual(["muito", "pouco"]);
  });

  it("lançamentos: todos os visíveis, do mais novo para o mais antigo", () => {
    const all = [
      product("velho", { createdAt: 1 }),
      product("novo", { createdAt: 9 }),
      product("oculto", { createdAt: 10, hidden: true }),
    ];

    expect(selectHomeProducts(all, "newest").map((p) => p._id)).toEqual(["novo", "velho"]);
  });

  it("respeita o limite da seção sem alterar a lista recebida", () => {
    const all = [product("1"), product("2"), product("3")];
    const before = all.map((p) => p._id);

    expect(selectHomeProducts(all, "newest", 2)).toHaveLength(2);
    expect(selectHomeProducts(all, "newest", 0)).toHaveLength(0);
    expect(all.map((p) => p._id)).toEqual(before);
  });

  it("banco vazio devolve lista vazia", () => {
    expect(selectHomeProducts([], "featured")).toEqual([]);
  });
});
