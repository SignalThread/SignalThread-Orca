"use client";

import { useState } from "react";
import type {
  PipedriveSetupOption,
  PipedriveSetupSettings,
  PipedriveStageOption
} from "@/lib/integrations/pipedrive/setup-core";

type Props = {
  settings: PipedriveSetupSettings;
  pipelines: PipedriveSetupOption[];
  stages: PipedriveStageOption[];
  users: PipedriveSetupOption[];
  providerOptionsAvailable: boolean;
};

const controlClass = "mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const checkClass = "h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500";

export function PipedriveSetupForm({
  settings,
  pipelines,
  stages,
  users,
  providerOptionsAvailable
}: Props) {
  const [destinationType, setDestinationType] = useState(settings.destinationType);
  const [ownerMode, setOwnerMode] = useState(settings.ownerMode);
  const [pipelineId, setPipelineId] = useState(settings.pipelineId ?? "");
  const [stageId, setStageId] = useState(settings.stageId ?? "");
  const availableStages = stages.filter((stage) => stage.pipelineId === pipelineId);

  return (
    <form method="post" action="/api/integrations/pipedrive/setup" className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Destination type</legend>
        <p className="text-sm text-slate-600">Send captured leads to Pipedrive as:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: "lead", label: "Leads", description: "Create Pipedrive Leads without creating a Deal immediately." },
            { value: "deal", label: "Deals", description: "Use your selected pipeline and stage when Phase 2 delivery is enabled." }
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                destinationType === option.value
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="destinationType"
                value={option.value}
                checked={destinationType === option.value}
                onChange={() => setDestinationType(option.value as "lead" | "deal")}
                className="mt-1 h-4 w-4 border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>
                <span className="block font-semibold text-slate-900">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Contact creation</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="createPerson" type="checkbox" defaultChecked={settings.createPerson} className={checkClass} />
            Create or update Person
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="createOrganization" type="checkbox" defaultChecked={settings.createOrganization} className={checkClass} />
            Create or update Organization
          </label>
        </div>
      </fieldset>

      {destinationType === "deal" ? (
        <fieldset className="grid gap-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 md:grid-cols-2">
          <legend className="sr-only">Pipeline and stage</legend>
          <label className="text-sm font-semibold text-slate-800">
            Pipeline
            <select
              name="pipelineId"
              value={pipelineId}
              onChange={(event) => {
                setPipelineId(event.target.value);
                setStageId("");
              }}
              disabled={!providerOptionsAvailable}
              className={controlClass}
            >
              <option value="">Select pipeline</option>
              {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Stage
            <select
              name="stageId"
              value={stageId}
              onChange={(event) => setStageId(event.target.value)}
              disabled={!providerOptionsAvailable || !pipelineId}
              className={controlClass}
            >
              <option value="">Select stage</option>
              {availableStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
        </fieldset>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Owner assignment</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { value: "connected_user", label: "Use connected Pipedrive user" },
            { value: "selected_user", label: "Select Pipedrive user" }
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              <input
                type="radio"
                name="ownerMode"
                value={option.value}
                checked={ownerMode === option.value}
                onChange={() => setOwnerMode(option.value as "connected_user" | "selected_user")}
                className="h-4 w-4 border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              {option.label}
            </label>
          ))}
        </div>
        {ownerMode === "selected_user" ? (
          <label className="block max-w-xl text-sm font-semibold text-slate-800">
            Owner
            <select
              name="ownerUserId"
              defaultValue={settings.ownerUserId ?? ""}
              disabled={!providerOptionsAvailable}
              className={controlClass}
            >
              <option value="">Select owner</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Follow-up behavior</legend>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
          <input name="createFollowUpActivity" type="checkbox" defaultChecked={settings.createFollowUpActivity} className={checkClass} />
          Create Pipedrive activity from LR follow-up date
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Duplicate matching</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="matchPersonByEmail" type="checkbox" defaultChecked={settings.matchPersonByEmail} className={checkClass} />
            Match Person by email
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="matchOrganizationByNameOrDomain" type="checkbox" defaultChecked={settings.matchOrganizationByNameOrDomain} className={checkClass} />
            Match Organization by name/domain
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-bold text-slate-900">Note content</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="sendConversationSynopsis" type="checkbox" defaultChecked={settings.sendConversationSynopsis} className={checkClass} />
            Send conversation synopsis
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input name="sendGeneratedEmailDraft" type="checkbox" defaultChecked={settings.sendGeneratedEmailDraft} className={checkClass} />
            Send generated email draft
          </label>
        </div>
        <p className="text-xs text-slate-500">Each is sent as its own Pipedrive Note. The email itself is never sent — only the draft content.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700">
          Save Pipedrive Setup
        </button>
        <p className="text-xs text-slate-500">Settings are saved for this company and take effect immediately for new sends.</p>
      </div>
    </form>
  );
}
