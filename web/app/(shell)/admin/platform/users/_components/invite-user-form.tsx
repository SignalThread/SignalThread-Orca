"use client";

import { FormEvent, useMemo, useState } from "react";

type InviteRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type OrganizationOption = {
  id: string;
  name: string;
};

type InviteResult = {
  ok: boolean;
  invitedEmail: string;
  orgId: string;
  role: InviteRole;
  userId: string;
  membershipId: string;
  eventsProvisionedCount: number;
};

const ROLE_OPTIONS: InviteRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

export function InviteUserForm({ organizations }: { organizations: OrganizationOption[] }) {
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [role, setRole] = useState<InviteRole>("MEMBER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && orgId.trim().length > 0 && !isSubmitting,
    [email, orgId, isSubmitting],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          orgId: orgId.trim(),
          role,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        reason?: string;
        hint?: string;
      } & Partial<InviteResult>;

      if (!response.ok || !payload.ok) {
        setErrorMessage(payload.hint || payload.message || payload.reason || "Failed to invite user.");
        return;
      }

      setResult(payload as InviteResult);
      setEmail("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to invite user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-[18px] leading-[22px] font-semibold text-slate-900">Invite and Provision User</h3>
      <p className="mt-2 text-sm text-slate-600">
        Sends a Supabase invite email, upserts the app user, and ensures org + event membership in one step.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            placeholder="user@company.com"
          />
        </label>

        {organizations.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Organization</span>
            <select
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.id})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Organization ID</span>
            <input
              type="text"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
              required
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#28439A] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Inviting..." : "Invite user"}
        </button>
      </form>

      {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}

      {result ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>
            Invited <strong>{result.invitedEmail}</strong>. Provisioned org membership +{" "}
            <strong>{result.eventsProvisionedCount}</strong> event memberships.
          </p>
          <p>Organization ID: {result.orgId}</p>
          <p>Role: {result.role}</p>
          <p>User ID: {result.userId}</p>
          <p>Membership ID: {result.membershipId}</p>
        </div>
      ) : null}
    </div>
  );
}
