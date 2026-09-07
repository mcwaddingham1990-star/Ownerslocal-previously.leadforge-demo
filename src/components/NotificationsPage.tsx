import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { hasPermission } from "../types/permissions";
import { Bell, Eye, EyeOff, Trash2 } from "lucide-react";

// Written by logOperationalEvent (App.tsx) for real business actions, and by
// notificationsService.ts for time-clock approval requests/results. The two
// sources fill different fields -- see visibleNotifications below for how
// that's told apart -- so every field except id/title/description/time/
// isRead is optional.
export interface DetailedNotification {
  id: string;
  category?: string; // an OS_SCREENS id (e.g. "customers"), or "system"
  title: string;
  description: string;
  icon?: string;
  time: string;
  isRead: boolean;
  screenId?: string;
  relatedCustomerId?: string;
  recipientEmail?: string;
}

export const NotificationsPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { notifications, setNotifications } = useDomainData();
  const { navigateToScreen } = useNavTelemetry();
  const notifList = notifications as DetailedNotification[];
  const setNotifList = setNotifications as React.Dispatch<React.SetStateAction<DetailedNotification[]>>;

  const [listFilter, setListFilter] = useState<"all" | "unread" | "read">("all");

  // Only what this role can actually see. General business-event
  // notifications (added by logOperationalEvent, carrying `category`) are
  // visible to anyone whose role has view access to that module -- Owner
  // always does. Personal notifications (time clock approvals and their
  // results, carrying no `category`) are only ever shown to the person
  // they're addressed to, regardless of role.
  const visibleNotifications = useMemo(() => {
    return [...notifList]
      .filter((n) => {
        if (!n.category) return n.recipientEmail === loggedInUser?.email;
        if (activeRole === "Owner") return true;
        if (n.category === "system") return false;
        return hasPermission(loggedInUser?.granularPermissions, n.category, "view");
      })
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  }, [notifList, activeRole, loggedInUser]);

  const unreadCount = useMemo(() => visibleNotifications.filter((n) => !n.isRead).length, [visibleNotifications]);

  const filteredNotifications = useMemo(() => {
    if (listFilter === "unread") return visibleNotifications.filter((n) => !n.isRead);
    if (listFilter === "read") return visibleNotifications.filter((n) => n.isRead);
    return visibleNotifications;
  }, [visibleNotifications, listFilter]);

  const markRead = (id: string, isRead: boolean) => {
    setNotifList((prev) => prev.map((n) => (n.id === id ? { ...n, isRead } : n)));
  };

  const deleteNotification = (id: string) => {
    setNotifList((prev) => prev.filter((n) => n.id !== id));
  };

  const clearRead = () => {
    setNotifList((prev) => prev.filter((n) => !n.isRead));
  };

  const openNotification = (n: DetailedNotification) => {
    if (!n.isRead) markRead(n.id, true);
    const screen = n.screenId || (n.category && n.category !== "system" ? n.category : undefined);
    if (screen) navigateToScreen(screen, n.relatedCustomerId ? { customerId: n.relatedCustomerId } : undefined);
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-4 animate-fade-in text-left">
      {/* HEADER */}
      <div className="flex items-center gap-2.5">
        <span className="p-1.5 bg-[#E3F3FF] text-[#342D7E] rounded-xl border border-[#A9CDEE]">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
            Notifications
          </h1>
          <p className="text-xs text-slate-500 font-sans font-medium">
            {unreadCount === 0 ? "You're all caught up" : `${unreadCount} unread`}
          </p>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-[#E3F3FF] rounded-2xl border border-[#A9CDEE] divide-y divide-[#A9CDEE]/50 overflow-hidden">
        {filteredNotifications.length === 0 ? (
          <div className="py-14 text-center">
            <Bell className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-500">
              {listFilter === "unread"
                ? "No unread notifications."
                : listFilter === "read"
                ? "No read notifications."
                : "No notifications yet."}
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${n.isRead ? "" : "bg-white/60"}`}
            >
              <button
                type="button"
                onClick={() => openNotification(n)}
                className="flex-1 min-w-0 flex items-start gap-3 text-left cursor-pointer"
              >
                <span className="text-lg leading-none mt-0.5 shrink-0 select-none">{n.icon || "🔔"}</span>
                <span className="min-w-0 block">
                  <span className="flex items-center gap-1.5">
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#315C9F] shrink-0" />}
                    <span className="text-xs font-bold text-[#1F3557] truncate">{n.title}</span>
                  </span>
                  <span className="block text-[11px] text-slate-500 font-medium mt-0.5 leading-relaxed">
                    {n.description}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono mt-1">{n.time}</span>
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => markRead(n.id, !n.isRead)}
                  title={n.isRead ? "Mark unread" : "Mark read"}
                  className="p-1.5 bg-white hover:bg-slate-100 border border-[#A9CDEE] rounded-lg text-slate-500 cursor-pointer transition-colors"
                >
                  {n.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteNotification(n.id)}
                  title="Delete"
                  className="p-1.5 bg-white hover:bg-rose-50 border border-[#A9CDEE] hover:border-rose-200 rounded-lg text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* LIST-LEVEL ACTIONS */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setListFilter((prev) => (prev === "unread" ? "all" : "unread"))}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border ${
            listFilter === "unread"
              ? "bg-[#315C9F] text-white border-[#315C9F]"
              : "bg-[#E3F3FF] text-[#315C9F] border-[#A9CDEE] hover:bg-white"
          }`}
        >
          View Unread
        </button>
        <button
          type="button"
          onClick={() => setListFilter((prev) => (prev === "read" ? "all" : "read"))}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border ${
            listFilter === "read"
              ? "bg-[#315C9F] text-white border-[#315C9F]"
              : "bg-[#E3F3FF] text-[#315C9F] border-[#A9CDEE] hover:bg-white"
          }`}
        >
          View Read
        </button>
        <button
          type="button"
          onClick={clearRead}
          className="px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border bg-[#E3F3FF] text-rose-600 border-[#A9CDEE] hover:bg-rose-50"
        >
          Clear Read
        </button>
      </div>
    </div>
  );
};
