import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AVATAR_MAX_MB } from "@/convex/lib/discord";
import { useAuth } from "@/hooks/use-auth";
import { StoreLayout } from "@/components/store/StoreLayout";
import { DeliveriesList } from "@/components/store/DeliveriesList";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/lib/format";
import { PAYMENT_STATUS_COLOR, DELIVERY_STATUS_COLOR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Loader2, Package, Clock, CheckCircle2, XCircle, User, ShoppingBag,
  LogOut, RefreshCcw, Pencil, Check, X, ShieldCheck, Settings2, Calendar,
  Sparkles, TriangleAlert, UserRound, Camera, ImagePlus,
} from "lucide-react";

type Order = {
  _id: string;
  number: string;
  items: Array<{ name: string; variantName?: string; quantity: number; totalCents: number; image?: string }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: number;
  paidAt?: number;
  minecraftNick?: string;
};

type AccountUser = {
  _id?: string;
  _creationTime?: number;
  name?: string;
  email?: string;
  image?: string;
  isAnonymous?: boolean;
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  paid: <CheckCircle2 className="size-5 text-emerald-600" />,
  delivered: <CheckCircle2 className="size-5 text-emerald-600" />,
  pending: <Clock className="size-5 text-yellow-600" />,
  processing: <Loader2 className="size-5 animate-spin text-sky-600" />,
  cancelled: <XCircle className="size-5 text-zinc-500" />,
  expired: <XCircle className="size-5 text-orange-600" />,
  refunded: <XCircle className="size-5 text-sky-600" />,
  failed: <XCircle className="size-5 text-red-600" />,
};

function StatusBadge({ status, kind }: { status: string; kind: "payment" | "delivery" }) {
  const label = kind === "payment" ? PAYMENT_STATUS_LABEL[status] ?? status : DELIVERY_STATUS_LABEL[status] ?? status;
  const color = kind === "payment" ? PAYMENT_STATUS_COLOR[status] : DELIVERY_STATUS_COLOR[status];
  return (
    <Badge variant="outline" className={color ?? ""}>
      {label}
    </Badge>
  );
}

/** Cartão de ação rápida da conta. */
function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  to,
  tone = "default",
  loading = false,
}: {
  icon: typeof User;
  title: string;
  description: string;
  onClick?: () => void;
  to?: string;
  tone?: "default" | "danger" | "primary";
  loading?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          tone === "danger"
            ? "bg-destructive/15 text-destructive"
            : tone === "primary"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-foreground",
        )}
      >
        {loading ? <Loader2 className="size-4.5 animate-spin" /> : <Icon className="size-4.5" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
    </>
  );

  const className = cn(
    "flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 transition-all",
    tone === "danger"
      ? "hover:border-destructive/50 hover:bg-destructive/5"
      : "hover:border-sky-500/40 hover:bg-accent/40",
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {content}
    </button>
  );
}

export default function AccountPage() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const orders = useQuery(api.orders.myOrders) as Order[] | null | undefined;
  const me = useQuery(api.team.me) as { admin: { role: string; name: string } | null } | null | undefined;
  const providers = useQuery(api.profile.myProviders) as string[] | undefined;
  const updateProfile = useMutation(api.profile.updateProfile);
  const avatarUploadUrl = useMutation(api.profile.avatarUploadUrl);
  const setAvatar = useMutation(api.profile.setAvatar);

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"signOut" | "switch" | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        </div>
      </StoreLayout>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <User className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Entre para ver seus pedidos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Faça login com seu e-mail para acompanhar compras, pagamentos e o que você recebeu.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/auth?returnTo=%2Fconta">Entrar</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/loja">Ver a loja</Link>
            </Button>
          </div>
        </div>
      </StoreLayout>
    );
  }

  const u = user as AccountUser;
  const email = u.email ?? "";
  const displayName = u.name?.trim() || email.split("@")[0] || "Cliente";
  const isGuest = u.isAnonymous === true;
  const role = me?.admin?.role;

  const list = orders === undefined || orders === null ? [] : orders;
  const paidOrders = list.filter((o) => o.paymentStatus === "paid");
  const totalSpent = paidOrders.reduce((acc, o) => acc + o.totalCents, 0);

  const startEditing = () => {
    setNameDraft(displayName);
    setEditing(true);
  };

  const saveName = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: nameDraft });
      toast.success("Nome atualizado!");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o nome.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG, WEBP ou GIF).");
      return;
    }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
      toast.error(`A foto deve ter no máximo ${AVATAR_MAX_MB} MB.`);
      return;
    }
    setAvatarBusy(true);
    try {
      const postUrl = await avatarUploadUrl();
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Falha no envio da foto.");
      const { storageId } = (await res.json()) as { storageId: string };
      const saved = await setAvatar({ storageId: storageId as never });
      if (!saved.ok) throw new Error(saved.error);
      toast.success("Foto atualizada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a foto.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await updateProfile({ image: null });
      toast.success("Foto removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover a foto.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy("signOut");
    try {
      await signOut();
      toast.success("Você saiu da conta.");
      navigate("/");
    } catch {
      toast.error("Não foi possível sair agora.");
      setBusy(null);
    }
  };

  const handleSwitchAccount = async () => {
    setBusy("switch");
    try {
      await signOut();
      toast.success("Pronto! Entre com outro e-mail.");
      navigate("/auth?returnTo=%2Fconta");
    } catch {
      toast.error("Não foi possível trocar de conta agora.");
      setBusy(null);
    }
  };

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {/* Cabeçalho / perfil */}
        <div className="relative overflow-hidden rounded-3xl border bg-card">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/15 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              disabled={avatarBusy}
              aria-label={u.image ? "Trocar minha foto" : "Adicionar minha foto"}
              title={u.image ? "Trocar minha foto" : "Adicionar minha foto"}
              className="group relative shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {u.image ? (
                <img
                  src={u.image}
                  alt={displayName}
                  className="size-16 rounded-2xl object-cover shadow-lg shadow-sky-500/20 ring-1 ring-sky-500/30"
                />
              ) : (
                <span className="neon-glow flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 text-2xl font-extrabold text-sky-950 shadow-lg shadow-sky-500/25">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background transition-transform group-hover:scale-110">
                {avatarBusy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Camera className="size-3" />
                )}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={60}
                    className="h-10 max-w-56"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveName();
                      if (e.key === "Escape") setEditing(false);
                    }}
                  />
                  <Button size="sm" onClick={() => void saveName()} disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-extrabold tracking-tight">{displayName}</h1>
                  <button
                    type="button"
                    onClick={startEditing}
                    aria-label="Editar nome"
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              )}
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {isGuest ? (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                    <TriangleAlert className="mr-1 size-3" /> Conta de visitante
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                    <ShieldCheck className="mr-1 size-3" /> E-mail verificado
                  </Badge>
                )}
                {role && (
                  <Badge variant="outline" className="border-sky-500/40 capitalize text-sky-400">
                    <Sparkles className="mr-1 size-3" /> Equipe · {role}
                  </Badge>
                )}
                {providers?.includes("discord") && (
                  <Badge variant="outline" className="border-[#5865F2]/50 text-[#5865F2]">
                    <DiscordIcon className="mr-1 size-3" /> Discord conectado
                  </Badge>
                )}
                {u.image && (
                  <button
                    type="button"
                    onClick={() => void removeAvatar()}
                    disabled={avatarBusy}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Remover foto
                  </button>
                )}
                {u._creationTime && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="size-3" /> Desde {formatDate(u._creationTime)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ações da conta */}
        <h2 className="mt-8 flex items-center gap-2 text-lg font-bold">
          <Settings2 className="size-5 text-primary" /> Sua conta
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={ShoppingBag}
            title="Ir para a loja"
            description="Explorar categorias e novidades"
            to="/loja"
          />
          <ActionCard
            icon={ImagePlus}
            title={u.image ? "Trocar minha foto" : "Adicionar uma foto"}
            description={`JPG, PNG ou GIF até ${AVATAR_MAX_MB} MB`}
            onClick={() => avatarInput.current?.click()}
            tone="primary"
            loading={avatarBusy}
          />
          <ActionCard
            icon={Pencil}
            title="Editar meu nome"
            description="Como você aparece na loja"
            onClick={startEditing}
          />
          {role && (
            <ActionCard
              icon={ShieldCheck}
              title="Painel administrativo"
              description="Gerenciar a loja"
              to="/painel"
            />
          )}
          <ActionCard
            icon={RefreshCcw}
            title="Trocar de conta"
            description="Entrar com outro e-mail"
            onClick={handleSwitchAccount}
            loading={busy === "switch"}
          />
          <ActionCard
            icon={LogOut}
            title="Sair da conta"
            description="Encerrar esta sessão"
            onClick={handleSignOut}
            tone="danger"
            loading={busy === "signOut"}
          />
        </div>

        {isGuest && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              Você está em uma <strong className="text-foreground">conta de visitante</strong> —
              seus pedidos ficam salvos apenas neste dispositivo. Saia e entre com seu e-mail para
              acessar de qualquer lugar.
            </p>
          </div>
        )}

        {/* Métricas */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="mt-1 text-2xl font-bold">{list.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pagos</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{paidOrders.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border bg-card p-4 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Total gasto</p>
            <p className="mt-1 text-2xl font-bold">{formatBRL(totalSpent)}</p>
          </div>
        </div>

        {/* Histórico */}
        <h2 className="mt-8 flex items-center gap-2 text-lg font-bold">
          <Package className="size-5 text-primary" /> Histórico de pedidos
        </h2>

        {orders === undefined && (
          <div className="mt-4 py-10 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {orders !== undefined && orders !== null && orders.length === 0 && (
          <div className="mt-4 rounded-xl border bg-card p-10 text-center">
            <Package className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Você ainda não fez nenhum pedido</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dica: use o mesmo e-mail no checkout para vincular suas compras aqui.
            </p>
            <Button className="mt-5" asChild>
              <Link to="/loja">Explorar produtos</Link>
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {list.map((order) => (
            <div key={order._id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-3 p-4">
                {STATUS_ICONS[order.paymentStatus]}
                <div className="min-w-0 flex-1">
                  <Link to={`/pedido/${order.number}`} className="font-semibold hover:underline">
                    Pedido {order.number}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.paymentStatus} kind="payment" />
                  <StatusBadge status={order.deliveryStatus} kind="delivery" />
                  <span className="font-bold">{formatBRL(order.totalCents)}</span>
                </div>
              </div>

              <div className="space-y-1.5 border-t px-4 py-3 text-sm">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {item.quantity}× {item.name}
                      {item.variantName ? ` — ${item.variantName}` : ""}
                    </span>
                    <span className="shrink-0 font-medium">{formatBRL(item.totalCents)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t p-3">
                <DeliveriesList number={order.number} collapsible />
              </div>
            </div>
          ))}
        </div>

        {orders !== undefined && orders !== null && orders.length > 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Comprando com o e-mail <span className="font-medium">{email}</span> suas compras aparecem aqui automaticamente.
          </p>
        )}

        <Separator className="my-8" />
        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <UserRound className="size-3.5" />
          Precisa de ajuda com algum pedido? Fale com o suporte da loja.
        </p>
      </div>
    </StoreLayout>
  );
}
