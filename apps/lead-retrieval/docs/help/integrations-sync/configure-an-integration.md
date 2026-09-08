# Configure an Integration

Use the Admin Portal integrations area to connect approved systems for your company or event workspace.

Configuration steps vary by provider. Only configure an integration when your team understands what data will move and who owns the external account.

---

## Before You Start

Confirm:

- You are signed in as an Admin with permission to configure integrations.
- You are in the correct company or event workspace.
- You have the provider credentials, OAuth access, API key, bearer token, or webhook URL.
- Your team knows whether the integration is for enrichment, CRM sync, registration lookup, or workflow automation.

---

## Configure from the Integrations Page

1. Open **Integrations** in the Admin Portal.
2. Choose the provider.
3. Follow the provider-specific setup flow.
4. Save the connection.
5. Run a test or validation if the provider offers one.
6. Review sync behavior before relying on it for production follow-up.

Connection methods may include OAuth, an API key, a bearer token, or a webhook URL.

---

## Reconnect or Replace Credentials

Reconnect when:

- OAuth access expires
- An API key or bearer token changes
- The external account no longer accepts requests
- A test connection fails

Some integrations let you replace a key or token. Others require reconnecting through the provider's OAuth flow.

---

## Disconnect

Disconnecting stops future sync or enrichment for that provider in the current workspace. It does not remove records that were already sent to the external system.

For webhook integrations, disabling can preserve the saved setup while preventing future webhook delivery.

---

## Permission Requirements

Most exhibitor integrations require Exhibitor Admin access and a valid company assignment. Platform registration integrations may require Platform Admin access.

If setup is blocked, check your role, company assignment, and selected event.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
- [Field Mapping](field-mapping.md)
