import { TerminologySettings } from "./_components/terminology-settings";

export default function SettingsPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-2 text-sm text-slate-500">Manage workspace and organization defaults.</p>
      <TerminologySettings />
    </section>
  );
}
