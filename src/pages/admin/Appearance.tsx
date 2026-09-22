import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, GripVertical, Plus, Trash2 } from "lucide-react";

type Theme = {
  primary: string; primaryForeground: string; secondary: string; secondaryForeground: string;
  background: string; foreground: string; card: string; border: string;
  radius: number; font: string; darkMode: boolean;
};

const SECTION_TYPES: Record<string, string> = {
  hero: "Hero (banner principal)",
  benefits: "Benefícios",
  categories: "Categorias",
  featured: "Produtos em destaque",
  promo: "Promoções",
  popular: "Mais vendidos",
  new: "Lançamentos",
  faq: "FAQ",
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="color"
          value={value?.startsWith("#") ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border"
        />
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

function ThemeTab() {
  const theme = useQuery(api.settings.getAppearance) as any;
  const save = useMutation(api.settings.updateTheme);
  const [form, setForm] = useState<Theme | null>(null);

  useEffect(() => {
    if (theme?.theme && !form) setForm(theme.theme);
  }, [theme, form]);

  if (!form) return <Loader2 className="mx-auto size-5 animate-spin" />;

  const set = (k: keyof Theme, v: any) => setForm((s) => (s ? { ...s, [k]: v } : s));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Cores principais</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Primária" value={form.primary} onChange={(v) => set("primary", v)} />
          <ColorField label="Texto sobre primária" value={form.primaryForeground} onChange={(v) => set("primaryForeground", v)} />
          <ColorField label="Secundária" value={form.secondary} onChange={(v) => set("secondary", v)} />
          <ColorField label="Texto sobre secundária" value={form.secondaryForeground} onChange={(v) => set("secondaryForeground", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Fundo e elementos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Fundo" value={form.background} onChange={(v) => set("background", v)} />
          <ColorField label="Texto" value={form.foreground} onChange={(v) => set("foreground", v)} />
          <ColorField label="Cards" value={form.card} onChange={(v) => set("card", v)} />
          <ColorField label="Bordas" value={form.border} onChange={(v) => set("border", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Estilo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Arredondamento ({form.radius}px)</Label>
            <input
              type="range" min={0} max={24} value={form.radius}
              onChange={(e) => set("radius", parseInt(e.target.value, 10))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <Label>Fonte</Label>
            <Input value={form.font} onChange={(e) => set("font", e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            A ApolloCraft usa tema escuro permanente — personalize as cores acima à vontade.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-end">
        <Button
          className="w-full"
          onClick={async () => {
            try {
              await save({ theme: form });
              toast.success("Tema salvo! Recarregue para ver na loja.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        >
          Salvar tema
        </Button>
      </div>
    </div>
  );
}

function HomepageTab() {
  const data = useQuery(api.settings.getAppearance) as any;
  const save = useMutation(api.settings.updateHomepage);
  const [sections, setSections] = useState<any[] | null>(null);

  useEffect(() => {
    if (data?.homepage && sections === null) setSections(data.homepage);
  }, [data, sections]);

  if (!sections) return <Loader2 className="mx-auto size-5 animate-spin" />;

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...sections];
    const target = next[idx + dir];
    if (!target) return;
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setSections(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ative, desative e reorganize as seções da página inicial.
      </p>
      {sections.map((s, i) => (
        <div key={s.id ?? s.type} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <GripVertical className="size-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">{SECTION_TYPES[s.type] ?? s.type}</p>
            {s.config?.title && <p className="text-xs text-muted-foreground">“{s.config.title}”</p>}
          </div>
          <Switch
            checked={s.enabled}
            onCheckedChange={(v) => setSections(sections.map((x, j) => (j === i ? { ...x, enabled: v } : x)))}
          />
          <Button variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => move(i, -1)}>
            <span className="text-xs">↑</span>
          </Button>
          <Button variant="ghost" size="icon" className="size-7" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>
            <span className="text-xs">↓</span>
          </Button>
          <Trash2
            className="size-4 cursor-pointer text-muted-foreground hover:text-red-600"
            onClick={() => setSections(sections.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border bg-card px-3 py-2 text-sm"
          defaultValue=""
          onChange={(e) => {
            const type = e.target.value;
            if (!type) return;
            setSections([...sections, { id: `${type}-${Date.now()}`, type, enabled: true, config: {} }]);
            e.target.value = "";
          }}
        >
          <option value="">+ Adicionar seção…</option>
          {Object.entries(SECTION_TYPES).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <Button
        onClick={async () => {
          try {
            await save({ sections });
            toast.success("Página inicial salva!");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        }}
      >
        Salvar página inicial
      </Button>
    </div>
  );
}

function MenuTab() {
  const data = useQuery(api.settings.getAppearance) as any;
  const save = useMutation(api.settings.updateMenu);
  const [menu, setMenu] = useState<any[] | null>(null);

  useEffect(() => {
    if (data && menu === null) setMenu(data.menu ?? []);
  }, [data, menu]);

  if (!menu) return <Loader2 className="mx-auto size-5 animate-spin" />;

  return (
    <div className="max-w-xl space-y-3">
      {menu.map((item: any, i: number) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item.label}
            placeholder="Rótulo"
            onChange={(e) => setMenu(menu.map((m, j) => (j === i ? { ...m, label: e.target.value } : m)))}
          />
          <Input
            value={item.url}
            placeholder="/loja ou https://..."
            onChange={(e) => setMenu(menu.map((m, j) => (j === i ? { ...m, url: e.target.value } : m)))}
          />
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <input
              type="checkbox"
              checked={item.newTab}
              onChange={(e) => setMenu(menu.map((m, j) => (j === i ? { ...m, newTab: e.target.checked } : m)))}
            />
            Nova aba
          </label>
          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setMenu(menu.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={() => setMenu([...menu, { label: "", url: "/", newTab: false }])}>
        <Plus className="mr-2 size-4" /> Adicionar item
      </Button>
      <div>
        <Button
          onClick={async () => {
            try {
              await save({ menu: menu.filter((m: any) => m.label.trim()) });
              toast.success("Menu salvo!");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        >
          Salvar menu
        </Button>
      </div>
    </div>
  );
}

function FooterTab() {
  const data = useQuery(api.settings.getAppearance) as any;
  const save = useMutation(api.settings.updateFooter);
  const [footer, setFooter] = useState<any | null>(null);

  useEffect(() => {
    if (data?.footer && footer === null) {
      setFooter(data.footer.about !== undefined ? data.footer : { about: "", copyright: "", columns: [] });
    }
  }, [data, footer]);

  if (!footer) return <Loader2 className="mx-auto size-5 animate-spin" />;

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Label>Sobre (texto do rodapé)</Label>
        <Input value={footer.about} onChange={(e) => setFooter({ ...footer, about: e.target.value })} />
      </div>
      <div>
        <Label>Copyright</Label>
        <Input value={footer.copyright ?? ""} onChange={(e) => setFooter({ ...footer, copyright: e.target.value })} placeholder="© 2026 Minha Loja" />
      </div>
      {footer.columns?.map((col: any, ci: number) => (
        <Card key={ci}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Input
                value={col.title}
                onChange={(e) =>
                  setFooter({
                    ...footer,
                    columns: footer.columns.map((c: any, i: number) => (i === ci ? { ...c, title: e.target.value } : c)),
                  })
                }
                className="font-semibold"
              />
              <Button
                variant="ghost" size="icon" className="text-red-600"
                onClick={() => setFooter({ ...footer, columns: footer.columns.filter((_: any, i: number) => i !== ci) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {col.links?.map((link: any, li: number) => (
              <div key={li} className="flex gap-2">
                <Input
                  value={link.label}
                  placeholder="Rótulo"
                  onChange={(e) =>
                    setFooter({
                      ...footer,
                      columns: footer.columns.map((c: any, i: number) =>
                        i === ci
                          ? { ...c, links: c.links.map((l: any, lj: number) => (lj === li ? { ...l, label: e.target.value } : l)) }
                          : c,
                      ),
                    })
                  }
                />
                <Input
                  value={link.url}
                  placeholder="/p/termos"
                  onChange={(e) =>
                    setFooter({
                      ...footer,
                      columns: footer.columns.map((c: any, i: number) =>
                        i === ci
                          ? { ...c, links: c.links.map((l: any, lj: number) => (lj === li ? { ...l, url: e.target.value } : l)) }
                          : c,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost" size="icon" className="text-red-600"
                  onClick={() =>
                    setFooter({
                      ...footer,
                      columns: footer.columns.map((c: any, i: number) =>
                        i === ci ? { ...c, links: c.links.filter((_: any, lj: number) => lj !== li) } : c,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline" size="sm"
              onClick={() =>
                setFooter({
                  ...footer,
                  columns: footer.columns.map((c: any, i: number) =>
                    i === ci ? { ...c, links: [...(c.links ?? []), { label: "", url: "/" }] } : c,
                  ),
                })
              }
            >
              <Plus className="mr-1 size-3.5" /> Link
            </Button>
          </CardContent>
        </Card>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setFooter({ ...footer, columns: [...(footer.columns ?? []), { title: "Nova coluna", links: [] }] })}>
          <Plus className="mr-2 size-4" /> Coluna
        </Button>
        <Button
          onClick={async () => {
            try {
              await save({ footer });
              toast.success("Rodapé salvo!");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        >
          Salvar rodapé
        </Button>
      </div>
    </div>
  );
}

export default function AdminAppearance() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aparência</h1>
        <p className="text-sm text-muted-foreground">Tema, seções da home, menu e rodapé — tudo editável sem código</p>
      </div>
      <Tabs defaultValue="theme">
        <TabsList>
          <TabsTrigger value="theme">Tema</TabsTrigger>
          <TabsTrigger value="homepage">Home</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="footer">Rodapé</TabsTrigger>
        </TabsList>
        <TabsContent value="theme"><ThemeTab /></TabsContent>
        <TabsContent value="homepage"><HomepageTab /></TabsContent>
        <TabsContent value="menu"><MenuTab /></TabsContent>
        <TabsContent value="footer"><FooterTab /></TabsContent>
      </Tabs>
    </div>
  );
}
