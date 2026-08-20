"use client";

import { useState } from "react";
import { PLATFORM_USER_ROLES, platformRoleLabel, type PlatformUserRole } from "@/lib/platform-admin-labels";

export function PlatformUserRoleEditor({ userId, currentRole, isCurrentOperator }: { userId: string; currentRole: PlatformUserRole; isCurrentOperator: boolean }) {
  const [role, setRole] = useState(currentRole);
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<string | null>(null);
  async function save() {
    setState(null);
    const response = await fetch(`/api/platform/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ role, confirmCurrentOperator: confirmed }) });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? "Saved current user role." : payload.message || "Role could not be saved.");
  }
  const changed = role !== currentRole;
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end gap-3"><div className="min-w-56 flex-1"><h2 className="font-semibold text-slate-950">Platform role</h2><p className="mt-1 text-sm text-slate-500">Controls platform-wide administrative access.</p><select value={role} onChange={(event) => { setRole(event.target.value as PlatformUserRole); setConfirmed(false); }} className="mt-3 h-10 w-full rounded-lg border border-slate-300 bg-white px-3">{PLATFORM_USER_ROLES.map((item) => <option key={item} value={item}>{platformRoleLabel(item)}</option>)}</select></div>{isCurrentOperator && changed ? <label className="max-w-sm text-sm text-slate-700"><input className="mr-2" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this change to my own platform access.</label> : null}<button disabled={!changed || (isCurrentOperator && !confirmed)} onClick={save} className="rounded-lg bg-[#2d4ba8] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save role</button></div>{isCurrentOperator && changed && currentRole === "SUPER_ADMIN" && role !== "SUPER_ADMIN" ? <p className="mt-3 text-sm text-rose-700">Lowering your own Super admin access is a high-risk action.</p> : null}{state && <p className="mt-3 text-sm text-slate-600">{state}</p>}</section>;
}
