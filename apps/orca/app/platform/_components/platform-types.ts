export type PlatformAccountAdmin = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export type PlatformAccount = {
  id: string;
  name: string;
  slug?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  userCount?: number | null;
  memberCount?: number | null;
  eventCount?: number | null;
  primaryAdmin?: PlatformAccountAdmin | null;
};

export type PlatformAccountsResponse = {
  accounts?: PlatformAccount[];
  account?: PlatformAccount;
  message?: string;
  reason?: string;
  hint?: string;
};

export type PlatformAccountUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  orgId: string;
  membershipId: string;
  membershipStatus: "MEMBER";
  membershipCreatedAt?: string | null;
  userCreatedAt?: string | null;
  eventAccessCount: number;
  hasEventAccess: boolean;
  eventAccessStatus: "HAS_EVENT_ACCESS" | "NO_EVENT_ACCESS_ASSIGNED";
};

export type PlatformAccountUsersResponse = {
  users?: PlatformAccountUser[];
  result?: {
    action: "linked" | "updated" | "removed";
    user?: PlatformAccountUser;
    userId: string;
    orgId: string;
  };
  message?: string;
  reason?: string;
  hint?: string;
};

export type PlatformAccountEvent = {
  id: string;
  orgId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  eventMemberCount: number;
};

export type PlatformAccountEventMember = {
  id: string;
  eventId: string;
  userId: string;
  eventRole: "EVENT_ADMIN" | "EVENT_EDITOR" | "EVENT_VIEWER";
  createdAt?: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    orgId: string;
  };
};

export type PlatformAccountEventsResponse = {
  events?: PlatformAccountEvent[];
  members?: PlatformAccountEventMember[];
  result?: {
    action: "granted" | "updated" | "revoked";
    orgId: string;
    eventId: string;
    userId: string;
    eventMember?: PlatformAccountEventMember;
  };
  message?: string;
  reason?: string;
  hint?: string;
};

export type PlatformContextResponse = {
  context?: {
    orgId: string;
    account: PlatformAccount;
  } | null;
  ok?: boolean;
  message?: string;
  reason?: string;
  hint?: string;
};
