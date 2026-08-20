import Link from "next/link";
import { UserRole } from "@prisma/client";
import { listPlatformAccountsPage, listPlatformUsers, searchPlatformAdmin, type PlatformPage } from "@/src/server/services/platform-admin";

type Params = Record<string, string | string[] | undefined>;
const value = (params: Params, key: string) => typeof params[key] === "string" ? params[key] : "";
const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
const hrefFor = (path: string, params: Params, changes: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) if (typeof raw === "string" && raw) search.set(key, raw);
  for (const [key, raw] of Object.entries(changes)) raw ? search.set(key, String(raw)) : search.delete(key);
  const rendered = search.toString();
  return rendered ? `${path}?${rendered}` : path;
};

function Pager({ path, params, page }: { path: string; params: Params; page: PlatformPage }) {
  return <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
    <span>{page.total} total · Page {page.page} of {page.pageCount}</span>
    <div className="flex gap-2">
      <Link aria-disabled={page.page <= 1} className="rounded border border-slate-300 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" href={hrefFor(path, params, { page: page.page - 1 })}>Previous</Link>
      <Link aria-disabled={page.page >= page.pageCount} className="rounded border border-slate-300 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" href={hrefFor(path, params, { page: page.page + 1 })}>Next</Link>
    </div>
  </div>;
}

export async function AccountsTable({ searchParams }: { searchParams: Params }) {
  const result = await listPlatformAccountsPage({
    search: value(searchParams, "search"), primaryAdmin: value(searchParams, "primaryAdmin") === "present" ? "present" : value(searchParams, "primaryAdmin") === "missing" ? "missing" : null,
    zeroUsers: value(searchParams, "zeroUsers") === "true", zeroEvents: value(searchParams, "zeroEvents") === "true",
    sort: (["name", "createdAt", "updatedAt", "userCount", "eventCount", "primaryAdmin"] as const).find((item) => item === value(searchParams, "sort")),
    direction: value(searchParams, "direction") === "desc" ? "desc" : "asc", page: Number(value(searchParams, "page")), pageSize: Number(value(searchParams, "pageSize")) || 25,
  });
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <form className="flex flex-wrap gap-3 border-b border-slate-200 p-4" method="get">
      <input name="search" defaultValue={value(searchParams, "search")} placeholder="Search accounts, people, or email" className="h-10 min-w-[250px] flex-1 rounded-lg border border-slate-300 px-3" />
      <select name="primaryAdmin" defaultValue={value(searchParams, "primaryAdmin")} className="rounded-lg border border-slate-300 px-3"><option value="">All admin states</option><option value="present">Has primary admin</option><option value="missing">Missing primary admin</option></select>
      <select name="sort" defaultValue={value(searchParams, "sort") || "name"} className="rounded-lg border border-slate-300 px-3"><option value="name">Account name</option><option value="createdAt">Created</option><option value="updatedAt">Updated</option><option value="userCount">Users</option><option value="eventCount">Events</option></select>
      <select name="direction" defaultValue={value(searchParams, "direction") || "asc"} className="rounded-lg border border-slate-300 px-3"><option value="asc">Ascending</option><option value="desc">Descending</option></select>
      <button className="rounded-lg bg-[#2d4ba8] px-4 font-semibold text-white">Apply</button>
    </form>
    <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th className="px-4 py-3">Account</th><th>Primary admin</th><th>Users / memberships</th><th>Events</th><th>Created</th><th className="px-4">Actions</th></tr></thead><tbody>
      {result.accounts.map((account) => <tr key={account.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-semibold text-slate-950">{account.name}</p></td><td>{account.primaryAdmin?.name ?? account.primaryAdmin?.email ?? <span className="text-amber-700">Missing</span>}</td><td>{account.userCount} / {account.memberCount}</td><td>{account.eventCount}</td><td>{formatDate(account.createdAt)}</td><td className="px-4"><Link className="font-semibold text-[#2d4ba8]" href={`/platform/accounts/${account.id}`}>View</Link></td></tr>)}
      {result.accounts.length === 0 && <tr><td className="px-4 py-8 text-slate-500" colSpan={6}>No accounts match these filters.</td></tr>}
    </tbody></table><Pager path="/platform/accounts" params={searchParams} page={result.page} />
  </section>;
}

export async function UsersTable({ searchParams }: { searchParams: Params }) {
  const role = value(searchParams, "role");
  const result = await listPlatformUsers({ search: value(searchParams, "search"), role: Object.values(UserRole).includes(role as UserRole) ? role as UserRole : null, hasEventAccess: value(searchParams, "hasEventAccess") === "true" ? true : value(searchParams, "hasEventAccess") === "false" ? false : null, sort: (["name", "email", "createdAt", "role"] as const).find((item) => item === value(searchParams, "sort")), direction: value(searchParams, "direction") === "asc" ? "asc" : "desc", page: Number(value(searchParams, "page")), pageSize: Number(value(searchParams, "pageSize")) || 25 });
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <form className="flex flex-wrap gap-3 border-b border-slate-200 p-4" method="get"><input name="search" defaultValue={value(searchParams, "search")} placeholder="Search users, accounts, or email" className="h-10 min-w-[250px] flex-1 rounded-lg border border-slate-300 px-3" /><select name="role" defaultValue={role} className="rounded-lg border border-slate-300 px-3"><option value="">All current user roles</option>{Object.values(UserRole).map((item) => <option key={item}>{item}</option>)}</select><select name="hasEventAccess" defaultValue={value(searchParams, "hasEventAccess")} className="rounded-lg border border-slate-300 px-3"><option value="">All event access</option><option value="true">Has event access</option><option value="false">No event access</option></select><select name="sort" defaultValue={value(searchParams, "sort") || "createdAt"} className="rounded-lg border border-slate-300 px-3"><option value="createdAt">Created</option><option value="name">Name</option><option value="email">Email</option><option value="role">Current user role</option></select><button className="rounded-lg bg-[#2d4ba8] px-4 font-semibold text-white">Apply</button></form>
    <p className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900"><strong>Current user role</strong> is the global <code>User.role</code> field. Account membership has no role in the current schema.</p>
    <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th className="px-4 py-3">User</th><th>Current user role</th><th>Memberships</th><th>Event access</th><th className="px-4">Created</th></tr></thead><tbody>{result.users.map((user) => <tr key={user.id} className="border-t border-slate-100"><td className="px-4 py-3"><Link className="font-semibold text-[#2d4ba8]" href={`/platform/users/${user.id}`}>{user.name || "Unnamed user"}</Link><p className="text-slate-500">{user.email}</p></td><td>{user.role}</td><td>{user.accountCount}</td><td>{user.totalEventAccessGrants}</td><td className="px-4">{formatDate(user.createdAt)}</td></tr>)}{result.users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-slate-500">No users match these filters.</td></tr>}</tbody></table><Pager path="/platform/users" params={searchParams} page={result.page} />
  </section>;
}

export async function PlatformSearch({ query }: { query: string }) {
  const result = await searchPlatformAdmin(query);
  if (!query) return null;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Global search results</h2><div className="mt-4 grid gap-5 md:grid-cols-3"><div><h3 className="font-medium">Accounts</h3>{result.accounts.map((a) => <Link className="mt-2 block text-sm text-[#2d4ba8]" key={a.id} href={`/platform/accounts/${a.id}`}>{a.name}</Link>)}</div><div><h3 className="font-medium">Users</h3>{result.users.map((u) => <Link className="mt-2 block text-sm text-[#2d4ba8]" key={u.id} href={`/platform/users/${u.id}`}>{u.name || u.email}</Link>)}</div><div><h3 className="font-medium">Events</h3>{result.events.map((e) => <Link className="mt-2 block text-sm text-[#2d4ba8]" key={e.id} href={`/platform/accounts/${e.orgId}`}>{e.name}<span className="text-slate-500"> · {e.accountName}</span></Link>)}</div></div></section>;
}
