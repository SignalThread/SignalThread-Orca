"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  notifications?: NotificationItem[];
};

type UnreadCountResponse = {
  unreadCount?: number;
};

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, "day");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsBell() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedUnreadCountRef = useRef(false);
  const unreadCountRequestInFlightRef = useRef(false);
  const notificationsRequestInFlightRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (unreadCountRequestInFlightRef.current) return;
    unreadCountRequestInFlightRef.current = true;

    try {
      const response = await fetch("/api/notifications/unread-count", {
        credentials: "include",
      });
      const payload = (await response.json()) as UnreadCountResponse;

      if (!response.ok) return;
      setUnreadCount(typeof payload.unreadCount === "number" ? payload.unreadCount : 0);
    } catch {
      // Ignore transient count fetch failures.
    } finally {
      unreadCountRequestInFlightRef.current = false;
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (notificationsRequestInFlightRef.current) return;
    notificationsRequestInFlightRef.current = true;
    setIsLoadingList(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/notifications?limit=20", {
        credentials: "include",
      });
      const payload = (await response.json()) as NotificationsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load notifications");
      }

      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load notifications");
    } finally {
      notificationsRequestInFlightRef.current = false;
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedUnreadCountRef.current || typeof window === "undefined") return;

    const timeout = window.setTimeout(() => {
      if (hasLoadedUnreadCountRef.current || isOpen) return;
      hasLoadedUnreadCountRef.current = true;
      void loadUnreadCount();
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [isOpen, loadUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;

    if (!hasLoadedUnreadCountRef.current) {
      hasLoadedUnreadCountRef.current = true;
      void loadUnreadCount();
    }

    void loadNotifications();
  }, [isOpen, loadNotifications, loadUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [isOpen]);

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return "";
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  async function handleNotificationClick(notification: NotificationItem) {
    setErrorMessage(null);

    try {
      if (!notification.isRead) {
        const response = await fetch(`/api/notifications/${notification.id}/read`, {
          method: "POST",
          credentials: "include",
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setErrorMessage(payload.error || "Failed to mark notification as read");
          return;
        }

        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      setIsOpen(false);
      if (notification.linkUrl) {
        router.push(notification.linkUrl);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to open notification");
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => setIsOpen((current) => !current)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      >
        <Bell className="h-4 w-4" />
        {badgeLabel ? (
          <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] leading-none font-semibold text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute top-11 right-0 z-40 w-[360px] max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <p className="mt-1 text-xs text-slate-500">{unreadCount} unread</p>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {isLoadingList ? <p className="px-4 py-3 text-sm text-slate-500">Loading...</p> : null}

            {!isLoadingList && notifications.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No notifications yet.</p>
            ) : null}

            {!isLoadingList
              ? notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={[
                      "w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50",
                      notification.isRead ? "bg-white" : "bg-blue-50/40",
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{notification.body}</p>
                    <p className="mt-2 text-[11px] text-slate-500">{formatRelativeTime(notification.createdAt)}</p>
                  </button>
                ))
              : null}
          </div>

          {errorMessage ? <p className="border-t border-slate-100 px-4 py-2 text-xs text-rose-600">{errorMessage}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
