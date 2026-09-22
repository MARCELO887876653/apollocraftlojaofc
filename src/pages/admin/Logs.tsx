import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, ScrollText } from "lucide-react";

type AuditLog = {
  _id: string; userName: string; action: string; entity?: string;
  entityId?: string; createdAt: number;
};

export default function AdminLogs() {
  const [search, setSearch] = useState("");
  const logs = useQuery(api.logs.listAudit, { search: search || undefined, limit: 200 }) as AuditLog[] | undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Registro de todas as ações da equipe</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar ação, usuário, entidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {logs === undefined && (
            <div className="py-12 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></div>
          )}
          {logs?.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <ScrollText className="mx-auto mb-2 size-8" />
              Nenhum registro
            </div>
          )}
          <div className="divide-y">
            {logs?.map((log) => (
              <div key={log._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <p>
                    <span className="font-medium">{log.userName}</span>{" "}
                    <span className="font-mono text-xs text-primary">{log.action}</span>
                    {log.entity && (
                      <span className="text-muted-foreground">
                        {" "}· {log.entity}
                        {log.entityId ? ` (${log.entityId.slice(-6)})` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
