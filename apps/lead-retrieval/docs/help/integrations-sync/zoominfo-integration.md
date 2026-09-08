# ZoomInfo Integration

The ZoomInfo integration stores a company-level ZoomInfo GTM API bearer token for enrichment and pre-show intelligence workflows.

Status: live bearer token setup and validation are implemented.

---

## What It Does

ZoomInfo can be configured as an enrichment provider using your organization's ZoomInfo API bearer token.

The token is stored for the company workspace and is not shown again after save.

---

## Who Can Configure It

Exhibitor Admins with company access can configure ZoomInfo.

---

## Where to Configure It

Open **Admin Portal → Integrations → ZoomInfo**.

Paste the bearer token, save it, and use **Validate connection** to confirm ZoomInfo accepts it.

---

## Default Enrichment Provider

When connected, ZoomInfo can be selected as the default enrichment provider for the company workspace.

---

## Common Issues

**Invalid token.**
The saved token failed validation. Replace the token or confirm it in ZoomInfo.

**Connection status shows error.**
Run validation again after updating the token.

**Cannot configure.**
Confirm your Admin user is linked to a company workspace.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Pre-Sales Briefs](../leads-briefs/pre-sales-briefs.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
