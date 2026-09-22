import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDateOnly } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown } from "lucide-react";

// ─── Páginas ───

function PagesTab() {
  const pages = useQuery(api.content.listPages) as any[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; data: any } | null>(null);
  const save = useMutation(api.content.savePage);
  const remove = useMutation(api.content.removePage);

  const openNew = () => setEditing({ id: null, data: { title: "", slug: "", content: "", active: true } });
  const openEdit = (p: any) =>
    setEditing({ id: p._id, data: { title: p.title, slug: p.slug, content: p.content, active: p.active } });

  const savePage = async () => {
    if (!editing) return;
    try {
      await save({ id: (editing.id as any) ?? undefined, data: { ...editing.data, slug: editing.data.slug || undefined } });
      toast.success("Página salva");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="mr-1 size-3.5" /> Nova página</Button>
      </div>
      <div className="space-y-2">
        {pages === undefined && <Loader2 className="mx-auto size-5 animate-spin" />}
        {pages?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma página</p>}
        {pages?.map((p) => (
          <div key={p._id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex-1">
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">/p/{p.slug}</p>
            </div>
            {!p.active && <Badge variant="outline">Inativa</Badge>}
            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600"
              onClick={async () => {
                if (confirm("Excluir página?")) {
                  await remove({ id: p._id });
                  toast.success("Página excluída");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar página" : "Nova página"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.data.title} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} /></div>
              <div><Label>Slug (opcional)</Label><Input value={editing.data.slug} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, slug: e.target.value } })} placeholder="gerado do título" /></div>
              <div><Label>Conteúdo</Label><Textarea rows={8} value={editing.data.content} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, content: e.target.value } })} /></div>
              <label className="flex items-center justify-between text-sm">Ativa <Switch checked={editing.data.active} onCheckedChange={(v) => setEditing({ ...editing, data: { ...editing.data, active: v } })} /></label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={savePage}>Salvar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Blog ───

function PostsTab() {
  const posts = useQuery(api.content.listPosts) as any[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; data: any } | null>(null);
  const save = useMutation(api.content.savePost);
  const remove = useMutation(api.content.removePost);

  const openNew = () =>
    setEditing({ id: null, data: { title: "", slug: "", cover: "", excerpt: "", content: "", author: "", status: "draft" } });
  const openEdit = (p: any) =>
    setEditing({
      id: p._id,
      data: {
        title: p.title, slug: p.slug, cover: p.cover ?? "", excerpt: p.excerpt ?? "",
        content: p.content, author: p.author ?? "", status: p.status,
      },
    });

  const savePost = async () => {
    if (!editing) return;
    try {
      await save({
        id: (editing.id as any) ?? undefined,
        data: {
          ...editing.data,
          slug: editing.data.slug || undefined,
          cover: editing.data.cover || undefined,
          excerpt: editing.data.excerpt || undefined,
          author: editing.data.author || undefined,
        },
      });
      toast.success("Post salvo");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="mr-1 size-3.5" /> Novo post</Button>
      </div>
      <div className="space-y-2">
        {posts === undefined && <Loader2 className="mx-auto size-5 animate-spin" />}
        {posts?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum post</p>}
        {posts?.map((p) => (
          <div key={p._id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex-1">
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                /blog/{p.slug} · {formatDateOnly(p.publishedAt ?? p.createdAt)}
              </p>
            </div>
            <Badge variant={p.status === "published" ? "default" : "outline"}>
              {p.status === "published" ? "Publicado" : "Rascunho"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600"
              onClick={async () => {
                if (confirm("Excluir post?")) {
                  await remove({ id: p._id });
                  toast.success("Post excluído");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar post" : "Novo post"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.data.title} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} /></div>
              <div><Label>Slug (opcional)</Label><Input value={editing.data.slug} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, slug: e.target.value } })} /></div>
              <div><Label>Imagem de capa (URL)</Label><Input value={editing.data.cover} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, cover: e.target.value } })} /></div>
              <div><Label>Resumo</Label><Textarea rows={2} value={editing.data.excerpt} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, excerpt: e.target.value } })} /></div>
              <div><Label>Conteúdo</Label><Textarea rows={8} value={editing.data.content} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, content: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Autor</Label><Input value={editing.data.author} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, author: e.target.value } })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.data.status} onValueChange={(v) => setEditing({ ...editing, data: { ...editing.data, status: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="published">Publicado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={savePost}>Salvar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── FAQ ───

function FaqsTab() {
  const faqs = useQuery(api.content.listFaqs, {}) as any[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; question: string; answer: string; active: boolean } | null>(null);
  const save = useMutation(api.content.saveFaq);
  const remove = useMutation(api.content.removeFaq);
  const reorder = useMutation(api.content.reorderFaqs);

  const saveFaq = async () => {
    if (!editing) return;
    try {
      await save({
        id: (editing.id as any) ?? undefined,
        question: editing.question,
        answer: editing.answer,
        order: editing.id ? (faqs?.find((f) => f._id === editing.id)?.order ?? 0) : (faqs?.length ?? 0),
        active: editing.active,
      });
      toast.success("FAQ salva");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const move = async (faq: any, dir: -1 | 1) => {
    if (!faqs) return;
    const idx = faqs.findIndex((f) => f._id === faq._id);
    const target = faqs[idx + dir];
    if (!target) return;
    const ids = faqs.map((f) => f._id);
    [ids[idx], ids[idx + dir]] = [ids[idx + dir], ids[idx]];
    await reorder({ ids });
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ id: null, question: "", answer: "", active: true })}>
          <Plus className="mr-1 size-3.5" /> Nova pergunta
        </Button>
      </div>
      <div className="space-y-2">
        {faqs === undefined && <Loader2 className="mx-auto size-5 animate-spin" />}
        {faqs?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma pergunta</p>}
        {faqs?.map((f, i) => (
          <div key={f._id} className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{f.question}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{f.answer}</p>
            </div>
            {!f.active && <Badge variant="outline">Inativa</Badge>}
            <Button variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => move(f, -1)}><ChevronUp className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" disabled={i === (faqs?.length ?? 1) - 1} onClick={() => move(f, 1)}><ChevronDown className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setEditing({ id: f._id, question: f.question, answer: f.answer, active: f.active })}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="text-red-600"
              onClick={async () => {
                if (confirm("Excluir pergunta?")) {
                  await remove({ id: f._id });
                  toast.success("Excluída");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar pergunta" : "Nova pergunta"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Pergunta</Label><Input value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} /></div>
              <div><Label>Resposta</Label><Textarea rows={4} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} /></div>
              <label className="flex items-center justify-between text-sm">Ativa <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /></label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={saveFaq}>Salvar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Banners ───

function BannersTab() {
  const banners = useQuery(api.content.listBanners, {}) as any[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; data: any } | null>(null);
  const save = useMutation(api.content.saveBanner);
  const remove = useMutation(api.content.removeBanner);

  const openNew = () =>
    setEditing({ id: null, data: { title: "", subtitle: "", imageDesktop: "", buttonText: "", buttonUrl: "", position: "hero", active: true } });
  const openEdit = (b: any) =>
    setEditing({
      id: b._id,
      data: {
        title: b.title ?? "", subtitle: b.subtitle ?? "", imageDesktop: b.imageDesktop ?? "",
        buttonText: b.buttonText ?? "", buttonUrl: b.buttonUrl ?? "", position: b.position, active: b.active,
      },
    });

  const saveBanner = async () => {
    if (!editing) return;
    try {
      await save({
        id: (editing.id as any) ?? undefined,
        title: editing.data.title || undefined,
        subtitle: editing.data.subtitle || undefined,
        imageDesktop: editing.data.imageDesktop || undefined,
        buttonText: editing.data.buttonText || undefined,
        buttonUrl: editing.data.buttonUrl || undefined,
        position: editing.data.position,
        active: editing.data.active,
      });
      toast.success("Banner salvo");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="mr-1 size-3.5" /> Novo banner</Button>
      </div>
      <div className="space-y-2">
        {banners === undefined && <Loader2 className="mx-auto size-5 animate-spin" />}
        {banners?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum banner</p>}
        {banners?.map((b) => (
          <div key={b._id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex-1">
              <p className="font-medium">{b.title ?? "Sem título"}</p>
              <p className="text-xs text-muted-foreground">Posição: {b.position}</p>
            </div>
            {!b.active && <Badge variant="outline">Inativo</Badge>}
            <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="size-4" /></Button>
            <Button
              variant="ghost" size="icon" className="text-red-600"
              onClick={async () => {
                if (confirm("Excluir banner?")) {
                  await remove({ id: b._id });
                  toast.success("Excluído");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar banner" : "Novo banner"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.data.title} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} /></div>
              <div><Label>Subtítulo</Label><Input value={editing.data.subtitle} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, subtitle: e.target.value } })} /></div>
              <div><Label>Imagem (URL)</Label><Input value={editing.data.imageDesktop} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, imageDesktop: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Texto do botão</Label><Input value={editing.data.buttonText} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, buttonText: e.target.value } })} /></div>
                <div><Label>URL do botão</Label><Input value={editing.data.buttonUrl} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, buttonUrl: e.target.value } })} /></div>
              </div>
              <div>
                <Label>Posição</Label>
                <Select value={editing.data.position} onValueChange={(v) => setEditing({ ...editing, data: { ...editing.data, position: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hero">Hero</SelectItem>
                    <SelectItem value="top">Topo</SelectItem>
                    <SelectItem value="middle">Meio</SelectItem>
                    <SelectItem value="footer">Rodapé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between text-sm">Ativo <Switch checked={editing.data.active} onCheckedChange={(v) => setEditing({ ...editing, data: { ...editing.data, active: v } })} /></label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={saveBanner}>Salvar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminContent() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conteúdo</h1>
        <p className="text-sm text-muted-foreground">Páginas institucionais, blog, FAQ e banners</p>
      </div>
      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Páginas</TabsTrigger>
          <TabsTrigger value="posts">Blog</TabsTrigger>
          <TabsTrigger value="faqs">FAQ</TabsTrigger>
          <TabsTrigger value="banners">Banners</TabsTrigger>
        </TabsList>
        <TabsContent value="pages"><PagesTab /></TabsContent>
        <TabsContent value="posts"><PostsTab /></TabsContent>
        <TabsContent value="faqs"><FaqsTab /></TabsContent>
        <TabsContent value="banners"><BannersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
