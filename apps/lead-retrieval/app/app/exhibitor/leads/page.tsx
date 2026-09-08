import { redirect } from "next/navigation";
import { serializeSearchParams } from "@/lib/url/serializeSearchParams";

export default async function LegacyExhibitorLeadsRedirectPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const qs = serializeSearchParams(resolved);
  redirect(qs ? `/exhibitor/leads?${qs}` : "/exhibitor/leads");
}
