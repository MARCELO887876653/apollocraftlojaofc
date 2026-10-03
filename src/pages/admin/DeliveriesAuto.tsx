import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, RefreshCw, Ban, RotateCcw, Server, Zap } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";

type Command = {
  _id: string; id: string; orderId: string; orderNumber: string; productName: string;
  clientIdentifier: string; serverId: string; addonId: string; action: string; command: string;
  payload: unknown; offlineExecute: boolean; status: string; attempts: number; maxAttempts: number;
  response: string; reason: string; executeAt: number; createdAt: number;
  completedAt?: number; lastAttemptAt?: number;
};

type ServerInfo = {
  _id: string; serverId: string; addonId: string; version: string;
  minecraftVersion: string; lastSeenAt: number; online: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  DONE: "Concluída",
  FAILED: "Falhou",
  CANCELED: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/15",
  PROCESSING: "bg-sky-500/15 text-sky-700 dark:text-sky-400 hover:bg-sky-500/15",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/15",
  CANCELED: "bg-zinc-500/15 text-zinc-600 hover:bg-zinc-500/15",
};

type Filter = "ALL" | "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED" | "SCHEDULED";

export default function AdminDeliveriesAuto() {
  const all = useQuery(api.deliveryCommands.adminList, {}) as Command[] | undefined;
  const servers = useQuery(api.apiV1Data.adminListServers) as ServerInfo[] | undefined;
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const retry = useMutation(api.deliveryCommands.adminRetry);
  const cancel = useMutation(api.deliveryCommands.adminCancel);
  const redeliver = useMutation(api.deliveryCommands.adminRedeliver);

  const now = Date.now();
  const commands = useMemo(() => {
    if (!all) return [];
    switch (filter) {
      case "PENDING":
        return all.filter((c) => c.status === "PENDING" && c.executeAt <= now);
      case "SCHEDULED":
        return all.filter((c) => c.status === "PENDING" && c.executeAt > now);
      case "ALL":
        return all;
      default:
        return all.filter((c) => c.status === filter);
    }
  }, [all, filter, now]);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      ALL: all?.length ?? 0, PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0, CANCELED: 0, SCHEDULED: 0,
    };
    for (const c of all ?? []) {
      if (c.status === "PENDING") {
        if (c.executeAt > now) base.SCHEDULED++;
        else base.PENDING++;
      } else if (c.status === "PROCESSING") base.PROCESSING++;
      else if (c.status === "DONE") base.DONE++;
      else if (c.status === "FAILED") base.FAILED++;
      else if (c.status === "CANCELED") base.CANCELED++;
    }
    return base;
  }, [all, now]);

  const TABS: Filter[] = ["ALL", "PENDING", "PROCESSING", "DONE", "FAILED", "CANCELED", "SCHEDULED"];

  const detail = useQuery(
    api.deliveryCommands.adminGet,
    openId ? { id: openId as any } : "skip",
  ) as { command: Command; attempts: any[] } | undefined;

  if (all === undefined) {
    return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Entregas automáticas</h1>
        <p className="text-sm text-muted-foreground">
          Fila consumida pela sua API (<code className="rounded bg-muted px-1">/api/v1/app/queued_commands</code>).
        </p>
      </div>

      {/* Servidores / heartbeat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="size-4 text-sky-400" /> Servidores conectados (heartbeat)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {servers === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum servidor enviou heartbeat ainda. Configure seu addon para chamar{" "}
              <code className="rounded bg-muted px-1">POST /api/v1/app/heartbeat</code>.
            </p>
          ) : (
            servers.map((s) => (
              <div key={s._id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
                <span className={cn("size-2.5 rounded-full", s.online ? "bg-emerald-500" : "bg-red-500")} />
                <span className="text-sm font-semibold">{s.serverId}</span>
                {s.addonId && <Badge variant="outline" className="font-mono text-[10px]">{s.addonId}</Badge>}
                {s.version && <span className="text-xs text-muted-foreground">v{s.version}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.online ? "🟢 Online" : "🔴 Offline"} · última comunicação {formatRelative(s.lastSeenAt)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              filter === t
                ? "border-sky-500/50 bg-sky-500/15 text-sky-400"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "ALL" ? "Todas" : STATUS_LABEL[t]}
            <span className="ml-1.5 opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {commands.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">
          Nenhuma entrega neste filtro.
        </div>
      ) : (
        <div className="space-y-2">
          {commands.map((c) => (
            <button
              key={c._id}
              onClick={() => setOpenId(c._id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-sky-500/40"
            >
              <Zap className="size-4 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <span className="font-mono text-sky-400">{c.action}</span> · {c.productName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{c.id}</span> · {c.orderNumber} · {c.clientIdentifier} ·{" "}
                  {c.serverId}/{c.addonId} · {formatDate(c.createdAt)}
                </p>
              </div>
              <Badge className={STATUS_CLASS[c.status] ?? ""}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
              {c.status === "PENDING" && c.executeAt > now && (
                <Badge variant="outline" className="text-[10px]">agendada {formatRelative(c.executeAt)}</Badge>
              )}
              <span className="text-xs text-muted-foreground">{c.attempts}/{c.maxAttempts} tent.</span>
            </button>
          ))}
        </div>
      )}

      {/* Detalhes */}
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Entrega {detail?.command.id}
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Status">
                  <Badge className={STATUS_CLASS[detail.command.status] ?? ""}>
                    {STATUS_LABEL[detail.command.status] ?? detail.command.status}
                  </Badge>
                </Field>
                <Field label="Pedido">{detail.command.orderNumber}</Field>
                <Field label="Produto">{detail.command.productName}</Field>
                <Field label="Sistema">{detail.command.clientIdentifier}</Field>
                <Field label="Servidor">{detail.command.serverId}</Field>
                <Field label="Addon">{detail.command.addonId}</Field>
                <Field label="Ação">
                  <span className="font-mono text-sky-400">{detail.command.action}</span>
                </Field>
                <Field label="Tentativas">
                  {detail.command.attempts}/{detail.command.maxAttempts}
                </Field>
                <Field label="Criada em">{formatDate(detail.command.createdAt)}</Field>
                <Field label="Executada em">
                  {detail.command.completedAt ? formatDate(detail.command.completedAt) : "—"}
                </Field>
                <Field label="Executar em">{formatDate(detail.command.executeAt)}</Field>
                <Field label="Offline">{detail.command.offlineExecute ? "Sim" : "Não"}</Field>
              </div>

              {detail.command.command && (
                <Field label="Comando">
                  <code className="block rounded bg-muted px-2 py-1 font-mono text-xs">{detail.command.command}</code>
                </Field>
              )}
              {detail.command.payload != null && (
                <Field label="Payload">
                  <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">{JSON.stringify(detail.command.payload, null, 2)}</pre>
                </Field>
              )}
              {detail.command.response && (
                <Field label="Resposta do addon">{detail.command.response}</Field>
              )}
              {detail.command.reason && <Field label="Motivo">{detail.command.reason}</Field>}

              <div className="flex flex-wrap gap-2">
                {detail.command.status === "FAILED" && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await retry({ id: detail.command._id as any });
                        toast.success("Entrega reenviada para a fila");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <RotateCcw className="mr-2 size-3.5" /> Reenviar (FAILED → PENDING)
                  </Button>
                )}
                {detail.command.status === "DONE" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!confirm("Reenviar uma entrega JÁ CONCLUÍDA pode duplicar benefícios. Confirmar?")) return;
                      try {
                        await redeliver({ id: detail.command._id as any, confirm: true });
                        toast.success("Entrega reenviada (risco de duplicidade)");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <RefreshCw className="mr-2 size-3.5" /> Reenviar mesmo assim
                  </Button>
                )}
                {detail.command.status !== "DONE" && detail.command.status !== "CANCELED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={async () => {
                      try {
                        await cancel({ id: detail.command._id as any });
                        toast.success("Entrega cancelada");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <Ban className="mr-2 size-3.5" /> Cancelar
                  </Button>
                )}
              </div>

              <Separator />
              <div>
                <p className="mb-2 text-sm font-semibold">Histórico de tentativas</p>
                {detail.attempts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma tentativa registrada.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.attempts.map((a: any) => (
                      <div key={a._id} className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{a.status}</span>
                          <span className="text-muted-foreground">
                            {formatDate(a.startedAt)}
                            {a.finishedAt ? ` → ${formatDate(a.finishedAt)}` : " (em andamento)"}
                          </span>
                        </div>
                        {a.response && <p className="mt-1 text-muted-foreground">{a.response}</p>}
                        {a.reason && <p className="mt-0.5 text-muted-foreground">motivo: {a.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}
