"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { updateEventSettingsForUser } from "@/lib/server/events/update-event-settings";

export type EventSettingsActionState =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string }
  | null;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateEventSettingsAction(
  _prev: EventSettingsActionState,
  formData: FormData
): Promise<EventSettingsActionState> {
  const sessionUser = await requireAuth();
  const eventId = formValue(formData, "eventId");

  const result = await updateEventSettingsForUser(
    { userId: sessionUser.id, role: sessionUser.role },
    {
      eventId,
      name: formValue(formData, "name"),
      startDate: formValue(formData, "startDate"),
      endDate: formValue(formData, "endDate"),
      location: formValue(formData, "location"),
      timezone: formValue(formData, "timezone")
    }
  );

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }

  revalidatePath(`/app/events/${encodeURIComponent(result.eventId)}/settings`);
  revalidatePath("/exhibitor/settings");
  revalidatePath("/app/events");

  return { ok: true, message: "Event settings updated." };
}
