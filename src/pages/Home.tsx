import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ShoppingBag, ShieldCheck, List, ArrowRight, Send, Headphones, Swords,
  Terminal, Copy, Trophy, Crown, User, Wallet, Star, HelpCircle,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/store/ProductCard";
import { VisitTracker } from "@/components/store/VisitTracker";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Section = { id: string; type: string; enabled: boolean; config?: any };
type Product = any;
type Category = { _id: string; name: string; slug: string; icon?: string; color?: string; image?: string; description?: string };
type Buyer = { _id: string; name: string; totalSpentCents: number };

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

function SectionHeader({ title, moreHref }: { title?: string; moreHref?: string }) {
  if (!title) return null;
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="mb-6 flex items-end justify-between gap-4"
    >
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      {moreHref && (
        <Link
          to={moreHref}
          className="group flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver tudo
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </motion.div>
  );
}

function Grid({ products }: { products: Product[] | undefined }) {
  if (!products?.length) return null;
  return (
    <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p._id} product={p} index={i} />
      ))}
    </motion.div>
  );
}

function Hero() {
  const store = useQuery(api.settings.getStore) as any;
  const banners = useQuery(api.content.listBanners, { position: "hero", activeOnly: true }) as any[] | undefined;
  const hero = banners?.[0];
  return (
    <section className="relative overflow-hidden border-b">
      {/* imagem de fundo configurável + overlay */}
      {hero?.imageDesktop && (
        <motion.div
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute inset-0"
          aria-hidden
        >
          <img src={hero.imageDesktop} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
        </motion.div>
      )}
      {!hero?.imageDesktop && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <motion.div
            animate={{ opacity: [0.75, 1, 0.75], scale: [1, 1.06, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-48 left-1/3 h-[420px] w-[720px] rounded-full bg-primary/20 blur-[130px]"
          />
        </div>
      )}

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-5 px-4 py-20 sm:py-28"
      >
        <motion.h1
          variants={fadeUp}
          className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
        >
          {hero?.title ?? (
            <>
              Domine o jogo com os{" "}
              <span className="neon-text bg-gradient-to-r from-red-400 to-rose-300 bg-clip-text text-transparent">
                kits e VIPs
              </span>{" "}
              da nossa loja!
            </>
          )}
        </motion.h1>
        <motion.p variants={fadeUp} className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          {hero?.subtitle ?? store?.description ?? "Entrega automática 24/7, preços justos e pagamento instantâneo via PIX."}
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3 pt-1">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
            <Link
              to="/loja"
              className="neon-glow-strong inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-sm font-bold text-zinc-950 shadow-lg shadow-red-500/25 transition-colors hover:bg-zinc-200"
            >
              <ShoppingBag className="size-4" /> Conferir ofertas
            </Link>
          </motion.div>
          {store?.discord && (
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
              <a
                href={store.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-card/60 px-7 text-sm font-semibold backdrop-blur transition-colors hover:bg-accent"
              >
                Entrar no Discord
              </a>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}

/** Cards grandes e centralizados — estilo CentralCart. */
function Benefits() {
  const items = [
    {
      icon: Send,
      title: "Envio imediato",
      text: "Receba pelo pacote que comprou em poucos segundos após a confirmação do pagamento.",
    },
    {
      icon: Headphones,
      title: "Suporte eficiente",
      text: "Em caso de dúvidas, entre em contato com o nosso suporte clicando em Suporte no topo da página.",
    },
    {
      icon: ShieldCheck,
      title: "Compra segura",
      text: "Seus dados são criptografados de ponta-a-ponta e processados pelo método de pagamento escolhido.",
    },
  ];
  return (
    <section className="border-b">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mx-auto w-full max-w-2xl space-y-4 px-4 py-12"
      >
        {items.map((item) => (
          <motion.div
            key={item.title}
            variants={fadeUp}
            className="flex flex-col items-center rounded-3xl border bg-card p-8 text-center"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <item.icon className="size-7" strokeWidth={2.2} />
            </span>
            <h3 className="mt-5 text-2xl font-extrabold tracking-tight">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">{item.text}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/** Cards horizontais de categoria com glow — estilo vitrine. */
function Categories() {
  const categories = useQuery(api.categories.listPublic) as Category[] | undefined;
  if (!categories?.length) return null;
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-7xl px-4 py-12">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground"
        >
          <List className="size-4 text-red-400" /> Categorias populares
        </motion.span>
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.slice(0, 6).map((c) => (
            <motion.div key={c._id} variants={fadeUp} whileHover={{ y: -4 }}>
              <Link
                to={`/categoria/${c.slug}`}
                className="group flex items-center gap-4 rounded-3xl border bg-card p-4 transition-all duration-300 hover:border-red-500/40 hover:shadow-[0_0_28px_-8px_rgb(225_29_29/0.45)]"
              >
                <div
                  className="relative size-28 shrink-0 overflow-hidden rounded-2xl transition-transform duration-300 group-hover:scale-105"
                  style={c.color ? { boxShadow: `0 0 42px -8px ${c.color}` } : undefined}
                >
                  {c.image ? (
                    <img src={c.image} alt={c.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-3xl"
                      style={{ backgroundColor: c.color ? `${c.color}22` : undefined }}
                    >
                      {c.icon ?? "📦"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <p className="line-clamp-2 text-xl font-extrabold uppercase leading-tight tracking-tight">
                    {c.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {c.description ?? "Veja os itens disponíveis desta categoria."}
                  </p>
                  <span className="mt-3 inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 text-sm font-bold text-zinc-950 transition-colors group-hover:bg-zinc-200">
                    Ver produtos <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/** Card "Conecte-se ao servidor" com IP copiável. */
function ServerSection() {
  const store = useQuery(api.settings.getStore) as { serverIp?: string } | undefined;
  const ip = store?.serverIp;
  if (!ip) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ip);
      toast.success("IP copiado!");
    } catch {
      toast.error("Não foi possível copiar o IP.");
    }
  };

  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <Swords className="size-7" strokeWidth={2.2} />
          </span>
          <h3 className="mt-6 text-2xl font-extrabold tracking-tight">Conecte-se ao servidor</h3>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Copie o endereço abaixo e entre no jogo agora mesmo.
          </p>
          <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-muted/70 px-4 py-3 font-mono text-sm sm:text-base">
            <Terminal className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{ip}</span>
          </div>
          <Button
            onClick={copy}
            className="mt-4 h-12 w-full rounded-2xl bg-white text-base font-bold text-zinc-950 hover:bg-zinc-200"
          >
            <Copy className="mr-2 size-4.5" /> Copiar IP
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

/** Ranking Top 3 compradores — estilo pódio CentralCart. */
const RANKS = [
  {
    ring: "border-amber-400/70",
    avatarRing: "ring-2 ring-amber-400/70",
    badge: "bg-amber-400 text-amber-950",
    price: "text-amber-400",
    crown: true,
    stars: 3,
    star: "text-amber-400",
  },
  {
    ring: "border-zinc-500/50",
    avatarRing: "ring-2 ring-zinc-500/60",
    badge: "bg-zinc-400 text-zinc-950",
    price: "text-muted-foreground",
    crown: false,
    stars: 2,
    star: "text-zinc-400",
  },
  {
    ring: "border-orange-500/60",
    avatarRing: "ring-2 ring-orange-500/60",
    badge: "bg-orange-500 text-white",
    price: "text-orange-400",
    crown: false,
    stars: 1,
    star: "text-orange-400",
  },
];

function TopBuyers() {
  const buyers = useQuery(api.customers.topBuyers) as Buyer[] | undefined;
  if (!buyers?.length) return null;

  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-xl px-4 py-12 text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground"
        >
          <Trophy className="size-4 text-amber-400" /> Top 3 compradores
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          Nossos maiores compradores
        </motion.h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Nossos campeões de compras estão aqui — confira o ranking mensal!
        </p>

        <div className="mt-12 space-y-8">
          {buyers.map((b, i) => {
            const r = RANKS[i] ?? RANKS[2];
            return (
              <motion.div
                key={b._id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                className={cn("relative rounded-3xl border bg-card px-6 pb-8 pt-10", r.ring)}
              >
                {r.crown && (
                  <span className="absolute -top-7 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400 shadow-lg shadow-amber-500/30">
                    <Crown className="size-6 text-amber-950" />
                  </span>
                )}
                <div className="relative mx-auto w-fit">
                  <span className={cn("flex size-24 items-center justify-center rounded-full bg-muted", r.avatarRing)}>
                    <User className="size-10 text-muted-foreground" />
                  </span>
                  <span
                    className={cn(
                      "absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full text-sm font-extrabold ring-2 ring-background",
                      r.badge,
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
                <p className="mt-4 truncate text-xl font-extrabold tracking-tight">{b.name}</p>
                <p className={cn("mt-1 flex items-center justify-center gap-2 text-lg font-bold", r.price)}>
                  <Wallet className="size-5" /> {formatBRL(b.totalSpentCents)}
                </p>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  {Array.from({ length: r.stars }).map((_, s) => (
                    <Star key={s} className={cn("size-5 fill-current", r.star)} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProductSection({
  title,
  products,
  moreHref,
}: {
  title: string;
  products: Product[] | undefined;
  moreHref?: string;
}) {
  if (!products || products.length === 0) return null;
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-7xl px-4 py-12">
        <SectionHeader title={title} moreHref={moreHref} />
        <Grid products={products} />
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = useQuery(api.content.listFaqs, { activeOnly: true }) as any[] | undefined;
  if (!faqs?.length) return null;
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground"
        >
          <HelpCircle className="size-4 text-red-400" /> FAQ
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          Perguntas frequentes
        </motion.h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Veja as perguntas mais comuns e suas respostas
        </p>
        <div className="mt-8 text-left">
          <Accordion type="single" collapsible>
            {faqs.slice(0, 8).map((f) => (
              <AccordionItem
                key={f._id}
                value={f._id}
                className="mb-3 rounded-2xl border bg-card px-5 last:border-b-0"
              >
                <AccordionTrigger className="text-left text-base font-bold hover:no-underline sm:text-lg">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-muted-foreground">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const homepage = (useQuery(api.settings.getHomepage) as Section[] | undefined) ?? [];

  return (
    <>
      <VisitTracker />
      {homepage
        .filter((s) => s.enabled)
        .map((section) => {
          const cfg = section.config ?? {};
          switch (section.type) {
            case "hero":
              return <Hero key={section.id} />;
            case "benefits":
              return <Benefits key={section.id} />;
            case "categories":
              return <Categories key={section.id} />;
            case "featured":
              return <Featured key={section.id} config={cfg} />;
            case "promo":
              return <Promo key={section.id} config={cfg} />;
            case "popular":
              return <Popular key={section.id} config={cfg} />;
            case "new":
              return <Newest key={section.id} config={cfg} />;
            default:
              return null;
          }
        })}
      {/* Seções fixas no rodapé da home (ordem do CentralCart) */}
      <ServerSection />
      <TopBuyers />
      <FaqSection />
    </>
  );
}

function Featured({ config }: { config: any }) {
  const products = useQuery(api.products.listFeatured, { limit: config?.count ?? 8 }) as any[] | undefined;
  return (
    <ProductSection
      title={config?.title ?? "Produtos em destaque"}
      products={products}
      moreHref="/loja"
    />
  );
}
function Promo({ config }: { config: any }) {
  const products = useQuery(api.products.listPromo, { limit: config?.count ?? 8 }) as any[] | undefined;
  return <ProductSection title={config?.title ?? "Promoções"} products={products} />;
}
function Popular({ config }: { config: any }) {
  const products = useQuery(api.products.listPopular, { limit: config?.count ?? 8 }) as any[] | undefined;
  return <ProductSection title={config?.title ?? "Mais vendidos"} products={products} />;
}
function Newest({ config }: { config: any }) {
  const products = useQuery(api.products.listNewest, { limit: config?.count ?? 8 }) as any[] | undefined;
  return <ProductSection title={config?.title ?? "Lançamentos"} products={products} />;
}
