import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";

type Log = {
  _id: string; apiKeyId?: string; serverId?: string; addonId?: string; deliveryId?: string;
  endpoint: string; method: string; statusCode: number; durationMs: number; ip?: string;
  error?: string; createdAt: number;
};

export default function AdminApiLogs() {
  const logs = useQuery(api.apiV1Data.adminListLogs) as Log[] | undefined;

  if (logs === undefined) {
    return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Logs da API</h1>
        <p className="text-sm text-muted-foreground">
          Últimas 200 chamadas à API de entregas. A chave nunca é registrada (apenas o id da chave).
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">
          Nenhuma chamada registrada ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Duração</th>
                <th className="px-3 py-2">Servidor/Addon</th>
                <th className="px-3 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatDate(l.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.method}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.endpoint}</td>
                  <td className="px-3 py-2">
                    <Badge
                      className={
                        l.statusCode < 300
                          ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"
                          : l.statusCode < 500
                            ? "bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/15"
                            : "bg-red-500/15 text-red-700 hover:bg-red-500/15"
                      }
                    >
                      {l.statusCode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{l.durationMs} ms</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {l.serverId ?? "—"} / {l.addonId ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-500">{l.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
