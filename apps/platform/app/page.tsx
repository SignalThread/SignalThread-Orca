import { redirect } from "next/navigation";

/**
 * The root is a router, not a page. Middleware has already decided whether this
 * request carries a verified session, so an authenticated user reaching here
 * belongs on /home and everyone else has been sent to /signin.
 */
export default function RootPage() {
  redirect("/home");
}
