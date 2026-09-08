import { zoomInfoPostJson } from "@/lib/integrations/zoominfo/client";

export async function searchCompanies(token: string, attributes: Record<string, unknown>) {
  return zoomInfoPostJson("/data/v1/companies/search", token, {
    data: {
      type: "CompanySearch",
      attributes,
    },
  });
}

export async function searchContacts(token: string, attributes: Record<string, unknown>) {
  return zoomInfoPostJson("/data/v1/contacts/search", token, {
    data: {
      type: "ContactSearch",
      attributes,
    },
  });
}

export async function enrichContacts(
  token: string,
  matchPersonInput: Record<string, unknown>[],
  outputFields: string[]
) {
  return zoomInfoPostJson("/data/v1/contacts/enrich", token, {
    data: {
      type: "ContactEnrich",
      attributes: {
        outputFields,
        matchPersonInput,
      },
    },
  });
}
