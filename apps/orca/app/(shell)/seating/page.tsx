import { notFound, redirect } from "next/navigation";
import { ROOM_SET_SEATING_ENABLED } from "@/config/features";

export default function RetiredStandaloneAssignmentsPage() {
  if (!ROOM_SET_SEATING_ENABLED) notFound();

  redirect("/events");
}
