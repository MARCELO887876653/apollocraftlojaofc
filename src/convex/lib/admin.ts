import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────
// Autenticação e permissões da equipe administrativa
// ─────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  ordersView: "orders.view",
  ordersManage: "orders.manage",
  productsManage: "products.manage",
  categoriesManage: "categories.manage",
  customersView: "customers.view",
  couponsManage: "coupons.manage",
  contentManage: "content.manage",
  appearanceManage: "appearance.manage",
  settingsManage: "settings.manage",
  integrationsManage: "integrations.manage",
  deliveriesView: "deliveries.view",
  deliveriesManage: "deliveries.manage",
  teamManage: "team.manage",
  logsView: "logs.view",
  financeView: "finance.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);

export const ROLE_PRESETS: Record<string, { label: string; permissions: string[] }> = {
  owner: { label: "Owner", permissions: ALL_PERMISSIONS },
  admin: {
    label: "Administrador",
    permissions: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.teamManage),
  },
  manager: {
    label: "Gerente",
    permissions: [
      PERMISSIONS.ordersView, PERMISSIONS.ordersManage,
      PERMISSIONS.productsManage, PERMISSIONS.categoriesManage,
      PERMISSIONS.customersView, PERMISSIONS.couponsManage,
      PERMISSIONS.contentManage, PERMISSIONS.appearanceManage,
      PERMISSIONS.deliveriesView, PERMISSIONS.deliveriesManage,
      PERMISSIONS.financeView,
    ],
  },
  support: {
    label: "Suporte",
    permissions: [
      PERMISSIONS.ordersView, PERMISSIONS.customersView,
      PERMISSIONS.deliveriesView, PERMISSIONS.deliveriesManage,
    ],
  },
};

export type AdminUser = Doc<"adminUsers">;

export async function getAdminUser(
  ctx: QueryCtx,
): Promise<AdminUser | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  if (!user?.email) return null;
  // Vincula userId automaticamente quando o admin entra pelo mesmo e-mail.
  let admin = await ctx.db
    .query("adminUsers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (!admin) {
    admin = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", user.email!))
      .first();
  }
  if (!admin || !admin.active) return null;
  return admin;
}

export class AdminError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function hasPermission(admin: AdminUser, permission: string): boolean {
  if (admin.role === "owner") return true;
  return admin.permissions.includes(permission);
}

/** Exige admin autenticado; opcionalmente uma permissão específica. */
export async function requireAdmin(
  ctx: QueryCtx,
  permission?: string,
): Promise<AdminUser> {
  const admin = await getAdminUser(ctx);
  if (!admin) {
    throw new AdminError("UNAUTHENTICATED", "Acesso restrito à equipe.");
  }
  if (permission && !hasPermission(admin, permission)) {
    throw new AdminError("FORBIDDEN", `Sem permissão: ${permission}`);
  }
  return admin;
}

/** Registra ação na auditoria (usar dentro de mutations). */
export async function logAudit(
  ctx: MutationCtx,
  admin: AdminUser | null,
  action: string,
  entity?: string,
  entityId?: string,
  details?: unknown,
) {
  await ctx.db.insert("auditLogs", {
    userId: admin?.userId ?? undefined,
    userName: admin?.name ?? "sistema",
    action,
    entity,
    entityId,
    details: details === undefined ? undefined : (details as any),
    createdAt: Date.now(),
  });
}
