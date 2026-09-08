export function normalizeLinkedinUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const withoutLeadingSlashes = trimmed.replace(/^\/+/, "");

  if (/^linkedin\.com\//i.test(withoutLeadingSlashes) || /^www\.linkedin\.com\//i.test(withoutLeadingSlashes)) {
    return `https://${withoutLeadingSlashes}`;
  }

  if (/linkedin\.com/i.test(withoutLeadingSlashes)) {
    const withoutProtocol = withoutLeadingSlashes.replace(/^https?:\/\//i, "");
    return `https://${withoutProtocol}`;
  }

  return trimmed;
}

export function normalizeCompanyDomain(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const withoutLeadingWww = withoutProtocol.replace(/^www\./, "");
  const withoutQuery = withoutLeadingWww.split("?")[0];
  const withoutHash = withoutQuery.split("#")[0];
  const withoutTrailingSlash = withoutHash.replace(/\/+$/, "");
  const domainOnly = withoutTrailingSlash.split("/")[0];

  if (!domainOnly || !domainOnly.includes(".")) return null;
  return domainOnly;
}

export function companyDomainToUrl(value: string | null | undefined): string | null {
  const domain = normalizeCompanyDomain(value);
  if (!domain) return null;
  return `https://${domain}`;
}
