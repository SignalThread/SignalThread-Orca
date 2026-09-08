import type { Database } from "@/types/database";

export type UserRow = Database["public"]["Tables"]["users"]["Row"];

export type AppRole =
  | "platform_admin"
  | "organizer_admin"
  | "exhibitor_admin"
  | "exhibitor_viewer"
  | "viewer";
