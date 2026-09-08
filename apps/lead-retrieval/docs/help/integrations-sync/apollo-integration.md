# Apollo Integration

The Apollo integration stores an Apollo API key for lead enrichment and connection testing.

Status: live API key setup is implemented. People Enrichment testing is implemented. People Search can be tested, but access may depend on Apollo plan or key type.

---

## What It Does

Apollo can support lead enrichment through People Match. The setup page also tests People Search access for net-new list building.

People Search results are described in the product as list-building support and may not include email or phone in results.

---

## Who Can Configure It

Exhibitor Admins with company access can configure Apollo from the exhibitor Integrations page.

---

## Where to Configure It

Open **Admin Portal → Integrations → Apollo**.

Paste the Apollo API key, save it, and run the connection test.

---

## Connection Test Results

The Apollo test checks:

- People Enrichment using People Match
- People Search access

The result may show that enrichment is available while People Search requires a master key or a plan with search access.

---

## Default Enrichment Provider

If Apollo is connected and valid, it can be selected as the default enrichment provider for the company workspace.

---

## Common Issues

**API key invalid.**
Replace the key and test again.

**People Search requires a master key.**
The key may still work for enrichment. Ask your Apollo admin whether your plan includes People Search API access.

**Default provider cannot be set.**
Connect and validate the provider first.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
