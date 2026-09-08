import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSelectedEventExhibitorRows } from "../lib/data/admin-exhibitors-event-scope";

const participation = (id: string, eventId: string, companyId: string) => ({
  id,
  event_id: eventId,
  company_id: companyId,
  status: "active",
  created_at: "2026-08-10T00:00:00.000Z"
});

const license = (input: {
  eventId: string | null;
  companyId: string;
  seats: number;
  used: number;
  cents: number;
  status?: string;
  scope?: "event" | "company";
}) => ({
  event_id: input.eventId,
  exhibitor_company_id: input.companyId,
  seats_total: input.seats,
  seats_used: input.used,
  status: input.status ?? "active",
  price_cents: input.cents,
  scope: input.scope ?? "event",
  created_at: "2026-08-10T00:00:00.000Z"
});

test("Event A returns only its explicit exhibitor participation", () => {
  const rows = buildSelectedEventExhibitorRows({
    event: { id: "event-a", company_id: "host" },
    participationRows: [
      participation("link-a", "event-a", "company-a"),
      participation("link-b", "event-b", "company-b")
    ],
    licenseRows: [license({ eventId: "event-a", companyId: "company-a", seats: 5, used: 2, cents: 12000 })],
    companyRows: [
      { id: "company-a", name: "Alpha" },
      { id: "company-b", name: "Beta" }
    ]
  });

  assert.deepEqual(rows.map((row) => row.name), ["Alpha"]);
  assert.equal(rows[0]?.eventId, "event-a");
});

test("Event B cannot leak Event A exhibitors", () => {
  const rows = buildSelectedEventExhibitorRows({
    event: { id: "event-b", company_id: "host" },
    participationRows: [
      participation("link-a", "event-a", "company-a"),
      participation("link-b", "event-b", "company-b")
    ],
    licenseRows: [
      license({ eventId: "event-a", companyId: "company-a", seats: 10, used: 9, cents: 90000 }),
      license({ eventId: "event-b", companyId: "company-b", seats: 3, used: 1, cents: 15000 })
    ],
    companyRows: [
      { id: "company-a", name: "Alpha" },
      { id: "company-b", name: "Beta" }
    ]
  });

  assert.deepEqual(rows.map((row) => row.companyId), ["company-b"]);
  assert.equal(rows[0]?.seatsPurchased, 3);
});

test("a company in multiple events uses the selected event link and commercial metrics", () => {
  const participationRows = [
    participation("link-a", "event-a", "multi-company"),
    participation("link-b", "event-b", "multi-company")
  ];
  const licenseRows = [
    license({ eventId: "event-a", companyId: "multi-company", seats: 7, used: 6, cents: 70000 }),
    license({ eventId: "event-b", companyId: "multi-company", seats: 2, used: 1, cents: 20000, status: "expired" })
  ];

  const eventA = buildSelectedEventExhibitorRows({
    event: { id: "event-a", company_id: "host" },
    participationRows,
    licenseRows,
    companyRows: [{ id: "multi-company", name: "Multi Co" }]
  });
  const eventB = buildSelectedEventExhibitorRows({
    event: { id: "event-b", company_id: "host" },
    participationRows,
    licenseRows,
    companyRows: [{ id: "multi-company", name: "Multi Co" }]
  });

  assert.deepEqual(
    [eventA[0]?.seatsPurchased, eventA[0]?.seatsUsed, eventA[0]?.revenue, eventA[0]?.licenseStatus],
    [7, 6, 700, "active"]
  );
  assert.deepEqual(
    [eventB[0]?.seatsPurchased, eventB[0]?.seatsUsed, eventB[0]?.revenue, eventB[0]?.licenseStatus],
    [2, 1, 200, "expired"]
  );
});

test("Bear-like direct buyer uses event ownership plus company license, never leads alone", () => {
  const base = {
    event: { id: "bear-event", company_id: "bear-company" },
    participationRows: [],
    companyRows: [{ id: "bear-company", name: "Bear Analytics" }],
    eventUserRows: [
      { event_id: "bear-event", exhibitor_company_id: "bear-company", status: "active" }
    ],
    leadRows: [{ event_id: "bear-event", company_id: "bear-company" }]
  };

  assert.equal(buildSelectedEventExhibitorRows({ ...base, licenseRows: [] }).length, 0);

  const rows = buildSelectedEventExhibitorRows({
    ...base,
    licenseRows: [
      license({ eventId: null, companyId: "bear-company", seats: 4, used: 1, cents: 0, scope: "company" })
    ]
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0]?.name, rows[0]?.seatsPurchased, rows[0]?.seatsUsed, rows[0]?.revenue, rows[0]?.licenseStatus],
    ["Bear Analytics", 4, 1, 0, "active"]
  );
  assert.equal(rows[0]?.participationId, null);
});

test("explicit event selection is server-scoped and does not consume account-context state", () => {
  const loader = readFileSync("lib/data/admin-exhibitors.ts", "utf8");
  const page = readFileSync("app/admin/exhibitors/page.tsx", "utf8");

  assert.match(page, /getAdminExhibitorsIndexData\(\{ selectedEventId:/);
  assert.match(loader, /from\("exhibitors"\)[\s\S]*?\.eq\("event_id", selectedEvent\.id\)/);
  assert.match(loader, /from\("event_users"\)[\s\S]*?\.eq\("event_id", selectedEvent\.id\)/);
  assert.match(loader, /from\("leads"\)[\s\S]*?\.eq\("event_id", selectedEvent\.id\)/);
  assert.doesNotMatch(loader, /activeCompanyId|account-context|account_context/);
});

test("empty state is returned only when no explicit or direct-buyer participation exists", () => {
  const rows = buildSelectedEventExhibitorRows({
    event: { id: "empty-event", company_id: "host-company" },
    participationRows: [],
    licenseRows: [
      license({ eventId: null, companyId: "unrelated-company", seats: 99, used: 99, cents: 999999, scope: "company" })
    ],
    companyRows: [
      { id: "host-company", name: "Host" },
      { id: "unrelated-company", name: "Unrelated" }
    ]
  });

  assert.deepEqual(rows, []);
});
