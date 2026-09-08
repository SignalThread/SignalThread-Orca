"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Mail, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CompanyScopedUsersDirectoryRow } from "@/lib/data/admin-company-licenses-overview";
import { getCompanyScopedUserActionState } from "@/lib/admin/company-scoped-user-actions";
import type { EmergencyLoginCodeResult } from "@/lib/server/emergency-login-code-core";
import {
  deleteCompanyScopedUserFromAdminAction,
  generateCompanyScopedUserLoginCodeFromAdminAction,
  resendCompanyScopedUserInviteFromAdminAction,
  updateCompanyScopedUserFromAdminAction
} from "@/app/admin/company-licenses/users/actions";

type Props = {
  row: CompanyScopedUsersDirectoryRow;
};

type Banner = { kind: "ok" | "err"; text: string };
type EmergencyLoginSuccess = Extract<EmergencyLoginCodeResult, { ok: true }>;

const menuButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50";

function actionKind(row: CompanyScopedUsersDirectoryRow) {
  return row.isPendingInvite ? "pending" : "user";
}

function appendRowIdentity(fd: FormData, row: CompanyScopedUsersDirectoryRow) {
  fd.set("kind", actionKind(row));
  fd.set("companyId", row.companyId);
  fd.set("targetUserId", row.isPendingInvite ? "" : row.id);
  fd.set("email", row.email ?? "");
  fd.set("currentEmail", row.email ?? "");
}

export function CompanyScopedUsersRowActions({ row }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyResult, setEmergencyResult] = useState<EmergencyLoginSuccess | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [fullName, setFullName] = useState(row.fullName ?? "");
  const [role, setRole] = useState(row.role);
  const actions = useMemo(() => getCompanyScopedUserActionState(row), [row]);
  const isInviteLike = row.isPendingInvite || row.status === "invited" || row.status === "expired";
  const emailHelper =
    isInviteLike
      ? "To correct an email, remove this invite and send a new one."
      : "Email is managed by the user's login identity and cannot be edited here.";

  function run(
    action: (fd: FormData) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>,
    build: (fd: FormData) => void,
    onSuccess?: () => void
  ) {
    startTransition(async () => {
      const fd = new FormData();
      appendRowIdentity(fd, row);
      build(fd);
      const result = await action(fd);
      if (result.ok) {
        setBanner({ kind: "ok", text: result.message ?? "Done." });
        setMenuOpen(false);
        setEditOpen(false);
        onSuccess?.();
        router.refresh();
      } else {
        setBanner({ kind: "err", text: result.error });
      }
    });
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(updateCompanyScopedUserFromAdminAction, (fd) => {
      fd.set("fullName", fullName);
      fd.set("role", role);
    });
  }

  function closeEmergency() {
    setEmergencyOpen(false);
    setEmergencyReason("");
    setEmergencyResult(null);
  }

  function submitEmergency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const fd = new FormData();
      appendRowIdentity(fd, row);
      fd.set("reason", emergencyReason);
      const result = await generateCompanyScopedUserLoginCodeFromAdminAction(fd);
      if (result.ok) {
        setEmergencyResult(result);
        setBanner(null);
        router.refresh();
      } else {
        setBanner({ kind: "err", text: result.error });
      }
    });
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setBanner({ kind: "ok", text: "Copied." });
  }

  return (
    <div className="relative inline-flex justify-end">
      {banner ? (
        <span
          role={banner.kind === "err" ? "alert" : "status"}
          className={`absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border px-3 py-2 text-left text-xs font-medium shadow-sm ${
            banner.kind === "err"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {banner.text}
        </span>
      ) : null}
      <button
        type="button"
        className={menuButtonClass}
        onClick={() => setMenuOpen((value) => !value)}
        aria-expanded={menuOpen}
        aria-label={`Manage ${row.email ?? row.fullName ?? "user"}`}
        title="Manage"
        disabled={isPending}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.9} aria-hidden />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 text-left shadow-md shadow-slate-200/60">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setFullName(row.fullName ?? "");
              setRole(row.role);
              setEditOpen(true);
              setMenuOpen(false);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </button>
          {actions.canResendInvite ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => run(resendCompanyScopedUserInviteFromAdminAction, () => undefined)}
            >
              <Mail className="h-4 w-4" aria-hidden />
              Resend invite
            </button>
          ) : null}
          {!row.isPendingInvite ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setEmergencyReason("");
                setEmergencyResult(null);
                setEmergencyOpen(true);
                setMenuOpen(false);
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Generate code
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
            onClick={() => {
              if (!window.confirm(`Remove ${row.email ?? row.fullName ?? "this user"}?`)) return;
              run(deleteCompanyScopedUserFromAdminAction, () => undefined);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Remove
          </button>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 text-left shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit user</h2>
                <p className="mt-1 text-xs text-slate-500">{row.companyName}</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
              >
                x
              </button>
            </div>
            <form className="space-y-4" onSubmit={submitEdit}>
              {!row.isPendingInvite ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                  />
                </label>
              ) : null}
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <div className="min-h-10 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {row.email ?? "No email on file"}
                </div>
                <p className="text-xs text-slate-500">{emailHelper}</p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as CompanyScopedUsersDirectoryRow["role"])}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="exhibitor_admin">Exhibitor admin</option>
                  <option value="viewer">App user</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => setEditOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {emergencyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-xl border border-border bg-white p-5 text-left shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Emergency Login Code</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Use this only when the user cannot receive the normal login email.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeEmergency}
                aria-label="Close"
                disabled={isPending}
              >
                x
              </button>
            </div>

            {emergencyResult ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <p className="font-semibold">Shown once only</p>
                  <p className="mt-1 text-xs leading-5">
                    This access will not be emailed automatically and disappears when you close this dialog.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Emergency Login Code for {emergencyResult.targetEmail}
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={emergencyResult.loginCode.code}
                      aria-label="Emergency Login Code"
                      className="h-12 flex-1 rounded-lg border border-border bg-slate-50 px-3 text-center font-mono text-xl font-semibold tracking-[0.3em] text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(emergencyResult.loginCode.code)}
                      className="h-10 shrink-0 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      Copy
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  The user enters this code with their email on a supported Lead Retrieval login screen. It expires and can be redeemed only once.
                </p>
                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeEmergency}
                    className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Close and clear
                  </button>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submitEmergency}>
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <p className="font-semibold">Emergency/support action</p>
                  <p className="mt-1 text-xs leading-5">
                    Verify the user first. Nothing will be emailed automatically.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-slate-700">Target user</p>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {row.fullName || row.email || "Selected user"}
                    {row.email ? <span className="block text-xs text-slate-500">{row.email}</span> : null}
                  </p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Reason</span>
                  <textarea
                    required
                    value={emergencyReason}
                    onChange={(event) => setEmergencyReason(event.target.value)}
                    placeholder="Example: Verified identity by phone; normal login email did not arrive."
                    className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                    onClick={closeEmergency}
                    disabled={isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending || !emergencyReason.trim()}
                  >
                    {isPending ? "Generating..." : "Generate"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
