import "server-only";

import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  updateEventSettingsWithDeps,
  type EventSettingsUpdateActor,
  type EventSettingsUpdateInput,
  type EventSettingsUpdatePatch,
  type EventSettingsUpdateResult
} from "@/lib/events/event-settings-update-core";

export type EditableEventSettings = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  timezone: string | null;
};

export const EDITABLE_EVENT_SETTINGS_SELECT = "id, name, start_date, end_date, location, timezone";

export async function loadEditableEventSettingsForUser(
  userId: string,
  eventId: string | null | undefined
): Promise<EditableEventSettings | null> {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) return null;

  await assertEventIdAccessibleForUser(userId, normalizedEventId);

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("events")
    .select(EDITABLE_EVENT_SETTINGS_SELECT)
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading event settings.");
  }

  return (data as EditableEventSettings | null) ?? null;
}

export async function updateEventSettingsForUser(
  actor: EventSettingsUpdateActor,
  input: EventSettingsUpdateInput
): Promise<EventSettingsUpdateResult> {
  return updateEventSettingsWithDeps(actor, input, {
    nowIso: () => new Date().toISOString(),
    assertEventAccessible: async (userId, eventId) => {
      await assertEventIdAccessibleForUser(userId, eventId);
    },
    updateEvent: async (eventId: string, patch: EventSettingsUpdatePatch) => {
      const supabase = createAdminClient();
      const { error } = await (supabase as any).from("events").update(patch).eq("id", eventId);
      if (error) {
        return { ok: false, message: error.message ?? "Failed updating event settings." };
      }
      return { ok: true };
    }
  });
}
