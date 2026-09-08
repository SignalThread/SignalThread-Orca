# Admin and Backend Help Docs Backlog

This backlog tracks missing help documentation for Admin and backend-supported workflows. It is a planning document, not customer-facing product documentation. Each item should be confirmed against current product behavior before a full article is published, and planned integrations or future workflow steps should stay clearly marked as planned until they are live.

## 1. Admin Dashboard

- **Title:** Admin Dashboard
- **Target user:** Exhibitor admins, organizer admins, platform support
- **Purpose:** Explain what the Admin dashboard shows and how users should use it to monitor event activity.
- **Key sections:** Dashboard metrics, event selector, lead activity, quick actions, alerts or empty states.
- **Open product questions / missing implementation details:** Confirm which dashboard metrics are available by role and whether platform support sees cross-company summaries.
- **Audience:** Customer-facing, with an internal support note for platform-only views.

## 2. Lead Upload / Lead Import

- **Title:** Upload Lead Data
- **Target user:** Exhibitor admins and users who manage lead lists.
- **Purpose:** Explain how to upload lead data, choose the correct event, and start the import workflow.
- **Key sections:** Supported file types, event scope, upload steps, validation results, common import errors.
- **Open product questions / missing implementation details:** Confirm whether Google Sheets links are planned or available, and confirm current size limits and supported spreadsheet formats.
- **Audience:** Customer-facing.

## 3. Lead Management

- **Title:** Manage Leads
- **Target user:** Exhibitor admins and team members with lead access.
- **Purpose:** Explain how users search, filter, update, qualify, and organize captured leads.
- **Key sections:** Lead list, search and filters, lead detail, notes, ratings, temperature, follow-up dates, delete behavior.
- **Open product questions / missing implementation details:** Confirm role-specific edit and delete permissions, and confirm whether bulk actions differ by role.
- **Audience:** Customer-facing.

## 4. Campaign Agents

- **Title:** Campaign Agents
- **Target user:** Exhibitor admins, marketers, and sales leaders.
- **Purpose:** Explain how Campaign Agents are used to guide campaign drafts, prioritization, and AI-assisted workflows.
- **Key sections:** Agent types, default agents, company agents, editing permissions, campaign usage, governance.
- **Open product questions / missing implementation details:** Confirm which roles can create or edit Campaign Agents, and identify any planned agent templates.
- **Audience:** Customer-facing, with internal support notes for setup behavior.

## 5. Campaign Builder

- **Title:** Build Campaigns
- **Target user:** Exhibitor admins and campaign owners.
- **Purpose:** Explain how to create a campaign draft from selected leads, Campaign Agents, and event context.
- **Key sections:** Audience selection, Campaign Agent selection, draft generation, editing, approval, saved drafts.
- **Open product questions / missing implementation details:** Confirm campaign creation limits, draft ownership, and whether viewers can preview without editing.
- **Audience:** Customer-facing.

## 6. Campaign Sending / Email Delivery

- **Title:** Send Campaigns and Track Delivery
- **Target user:** Exhibitor admins, campaign owners, and support.
- **Purpose:** Explain what happens when a campaign is sent and how delivery status should be interpreted.
- **Key sections:** Send readiness, sender setup, delivery statuses, bounces, failures, suppression rules, resend behavior.
- **Open product questions / missing implementation details:** Confirm the email provider behavior, sender verification rules, unsubscribe handling, and retry policy.
- **Audience:** Customer-facing plus internal support/admin-facing troubleshooting details.

## 7. Integrations

- **Title:** Integrations
- **Target user:** Exhibitor admins and technical admins.
- **Purpose:** Explain available integrations and clearly mark planned integrations.
- **Key sections:** Available integrations, planned integrations, connection setup, permissions, sync cadence, disconnect behavior.
- **Open product questions / missing implementation details:** Confirm which integrations are live, which are planned, what data each integration can sync, and the customer-safe status language for integrations that are not yet available.
- **Audience:** Customer-facing for live integrations; internal support/admin-facing for setup notes.

## 8. Field Mapping

- **Title:** Map Lead Fields
- **Target user:** Exhibitor admins importing lead data.
- **Purpose:** Explain how uploaded columns map to lead fields before import.
- **Key sections:** Required fields, optional fields, unmapped columns, custom fields, validation messages, saving mappings.
- **Open product questions / missing implementation details:** Confirm custom field support, mapping reuse, and how duplicate columns are handled.
- **Audience:** Customer-facing.

## 9. Users and Roles

- **Title:** Users and Roles
- **Target user:** Exhibitor admins, organizer admins, and platform support.
- **Purpose:** Explain available user roles and what each role can do inside its allowed company and event scope.
- **Key sections:** Role definitions, admin permissions, viewer permissions, company scope, event access, read-only behavior.
- **Open product questions / missing implementation details:** Confirm final role names shown in Admin and how legacy roles should be described.
- **Audience:** Customer-facing with internal support/admin-facing role-mapping notes.

## 10. Inviting Team Members

- **Title:** Invite Team Members
- **Target user:** Exhibitor admins and platform support.
- **Purpose:** Explain how to invite users, resend invites, remove invites, and correct invite details safely.
- **Key sections:** Invite form, role selection, event access, resend, remove invite, active users, email correction guidance.
- **Open product questions / missing implementation details:** Confirm invite expiration, resend limits, and the exact correction flow for pending invites.
- **Audience:** Customer-facing.

## 11. Licenses / Seats

- **Title:** Licenses and Seats
- **Target user:** Platform support, organizer admins, and exhibitor admins where seat visibility is enabled.
- **Purpose:** Explain how seats are allocated, used, and shown in Admin.
- **Key sections:** Seat counts, assigned users, pending invites, overage states, remove or reassign access, license event scope.
- **Open product questions / missing implementation details:** Confirm whether exhibitor admins can view seat totals and how license modes are named for customers.
- **Audience:** Internal support/admin-facing first; customer-facing summary if enabled.

## 12. Event Access

- **Title:** Event Access
- **Target user:** Exhibitor admins, organizer admins, and platform support.
- **Purpose:** Explain how users receive access to events and how event scope affects Admin and mobile workflows.
- **Key sections:** Selected event, assigned events, all-company event access, permissions, troubleshooting missing access.
- **Open product questions / missing implementation details:** Confirm customer-facing names for all-company access and assigned-event access.
- **Audience:** Customer-facing with internal support/admin-facing troubleshooting details.

## 13. Mobile App Sync / Backend Relationship

- **Title:** How Mobile Sync Works with Admin
- **Target user:** Exhibitor admins, mobile users, and support teams.
- **Purpose:** Explain how mobile activity syncs with Admin and what users should expect when switching devices or events.
- **Key sections:** Sign-in, event selection, lead sync, offline capture, conflict expectations, refresh behavior.
- **Open product questions / missing implementation details:** Confirm sync timing, retry behavior, offline limits, and how users are notified of sync issues.
- **Audience:** Customer-facing with internal support/admin-facing diagnostics.

## 14. Audio Notes / Voice Notes

- **Title:** Audio Notes and Voice Notes
- **Target user:** Mobile users and exhibitor admins reviewing lead context.
- **Purpose:** Explain how voice notes support lead follow-up and where processed notes appear.
- **Key sections:** Recording notes, saving notes, processing status, transcript review, lead context updates, offline behavior.
- **Open product questions / missing implementation details:** Confirm retention rules, transcript editing support, processing limits, and failed upload recovery.
- **Audience:** Customer-facing.

## 15. Data Enrichment

- **Title:** Data Enrichment
- **Target user:** Exhibitor admins, sales leaders, and support.
- **Purpose:** Explain what enrichment can add to lead records and how users should review enriched data.
- **Key sections:** Available providers, enrichment status, review steps, stale data handling, errors, privacy expectations.
- **Open product questions / missing implementation details:** Confirm which enrichment providers are live, which fields are updated, and whether enrichment is automatic or user-triggered.
- **Audience:** Customer-facing for live behavior; internal support/admin-facing for provider details.

## 16. Exports

- **Title:** Export Leads
- **Target user:** Exhibitor admins and team members with export permission.
- **Purpose:** Explain how to export lead data and what filters or selected leads are included.
- **Key sections:** Export button, selected-lead export, filtered export, exported fields, file format, permission limits.
- **Open product questions / missing implementation details:** Confirm export field list, whether custom fields are included, and role-specific export restrictions.
- **Audience:** Customer-facing.

## 17. Troubleshooting / FAQ

- **Title:** Troubleshooting and FAQ
- **Target user:** Exhibitor admins, mobile users, and support teams.
- **Purpose:** Collect common issues and short answers that help users resolve access, sync, import, and campaign problems.
- **Key sections:** Sign-in issues, missing event, missing leads, import errors, invite issues, campaign delivery issues, sync delays, contacting support.
- **Open product questions / missing implementation details:** Confirm support escalation paths, expected response language, and which diagnostics can be safely exposed to customers.
- **Audience:** Customer-facing with internal support/admin-facing escalation notes.
