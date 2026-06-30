// useMatchReminder — schedules a browser notification 15 min before a match
// Uses localStorage to persist reminders across page reloads.
// Falls back to a setTimeout on the current tab if push is unavailable.

import { useState, useEffect } from "react";
import type { EnrichedMatch } from "../types";

const STORAGE_KEY = "sz_reminders";
const REMIND_MS = 15 * 60 * 1000; // 15 minutes before

export interface Reminder {
  matchId: string;
  matchTitle: string;
  matchDate: number; // UTC ms
  setAt: number;
}

function loadReminders(): Record<string, Reminder> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReminders(r: Record<string, Reminder>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {}
}

export function getAllReminders(): Record<string, Reminder> {
  return loadReminders();
}

export function isReminderSet(matchId: string): boolean {
  return !!loadReminders()[matchId];
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// Schedule a local notification via setTimeout (works without a push server)
function scheduleLocalNotification(reminder: Reminder) {
  const fireAt = reminder.matchDate - REMIND_MS;
  const delay = fireAt - Date.now();
  if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) return; // skip if past or >7d away

  setTimeout(() => {
    if (Notification.permission !== "granted") return;
    // Re-check the reminder is still set (user may have removed it)
    if (!isReminderSet(reminder.matchId)) return;
    new Notification("Match starting soon — StreamZone", {
      body: `${reminder.matchTitle} kicks off in 15 minutes`,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: `sz-${reminder.matchId}`,
    });
  }, delay);
}

export function useMatchReminder(match: EnrichedMatch) {
  const [isSet, setIsSet] = useState(() => isReminderSet(match.id));

  // Sync state if another tab changes localStorage
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setIsSet(isReminderSet(match.id));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [match.id]);

  async function toggle() {
    const reminders = loadReminders();

    if (isSet) {
      // Cancel
      delete reminders[match.id];
      saveReminders(reminders);
      setIsSet(false);
      return;
    }

    // Set reminder — request permission first
    const granted = await requestNotificationPermission();
    if (!granted) {
      alert(
        "Please allow notifications in your browser settings to set reminders."
      );
      return;
    }

    const reminder: Reminder = {
      matchId: match.id,
      matchTitle: match.title || `${match.teams?.home?.name} vs ${match.teams?.away?.name}`,
      matchDate: match.date,
      setAt: Date.now(),
    };
    reminders[match.id] = reminder;
    saveReminders(reminders);
    scheduleLocalNotification(reminder);
    setIsSet(true);
  }

  return { isSet, toggle };
}

// Re-schedule all stored reminders on app boot (survives page reload within same tab)
export function rehydrateReminders() {
  if (Notification.permission !== "granted") return;
  const reminders = loadReminders();
  const now = Date.now();
  // Prune expired reminders
  const active: Record<string, Reminder> = {};
  for (const [id, r] of Object.entries(reminders)) {
    if (r.matchDate > now) {
      active[id] = r;
      scheduleLocalNotification(r);
    }
  }
  saveReminders(active);
}
