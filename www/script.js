/**
 * Flow — Tasks & Calendar
 * SPA: Supabase for cloud data; theme/language prefs in localStorage.
 */
(function () {
  "use strict";
  const supabaseUrl = "https://shmxrxdjxfimybnvmntu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNobXhyeGRqeGZpbXlibnZtbnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTAzODQsImV4cCI6MjA5MDQ2NjM4NH0.LcmdjgcegHv_aUwosR-Kc_CBIvU8yt1nn28m40-X-jU";

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
async function checkUser() {
  let data = { session: null };
  let error = null;
  try {
    const out = await supabase.auth.getSession();
    data = out.data || data;
    error = out.error;
  } catch (e) {
    console.error("Fehler beim Abrufen der Session:", e);
    return;
  }

  if (error) {
    console.error("Fehler beim Abrufen der Session:", error.message);
    return;
  }

  if (data && data.session) {
    document.getElementById("authGate").hidden = true;
    document.getElementById("app").hidden = false;
    /* Profile: Supabase via mergeProfileFromSupabase in loadState — do not sync OAuth here (race / overwrite). */
  }
}

checkUser();
async function getCurrentUserId() {
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.user?.id) return sess.session.user.id;
  } catch (_) {}
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

function mapTaskFromSupabase(row) {
  const completed = Boolean(row.completed);
  const out = {
    id: row.id,
    title: String(row.title || ""),
    notes: String(row.notes || ""),
    priority: row.priority || "medium",
    dueDate: row.due_date || null,
    completed,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    groupId: (row.group_id && String(row.group_id).trim()) || null,
  };
  if (completed && row.completed_at) {
    out.completedAt = String(row.completed_at).slice(0, 10);
  }
  return out;
}

/** Full row for INSERT into `tasks` */
function mapTaskToSupabase(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title || "",
    notes: task.notes || "",
    priority: task.priority || "medium",
    due_date: task.dueDate || null,
    completed: Boolean(task.completed),
    completed_at: task.completed ? task.completedAt || null : null,
    created_at: task.createdAt ? new Date(task.createdAt).toISOString() : new Date().toISOString(),
    group_id: (task.groupId && String(task.groupId).trim()) || null,
  };
}

/** Patch for UPDATE — never send id/user_id/created_at */
function mapTaskToSupabaseUpdate(task) {
  return {
    title: task.title || "",
    notes: task.notes || "",
    priority: task.priority || "medium",
    due_date: task.dueDate || null,
    completed: Boolean(task.completed),
    completed_at: task.completed ? task.completedAt || null : null,
    group_id: (task.groupId && String(task.groupId).trim()) || null,
  };
}

/** Local calendar day YYYY-MM-DD from an ISO / DB timestamp */
function localYmdFromIso(iso) {
  const d = iso ? new Date(iso) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localHHMMFromDate(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function normalizeHHMM(t) {
  if (!t || typeof t !== "string") return "09:00";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function mapEventFromSupabase(row) {
  const start = row.start_time ? new Date(row.start_time) : new Date();
  const allDay = Boolean(row.all_day);
  const ymd = localYmdFromIso(row.start_time);
  let startTime = "09:00";
  let endTime = null;
  if (!allDay) {
    startTime = localHHMMFromDate(start);
    endTime = row.end_time ? localHHMMFromDate(new Date(row.end_time)) : null;
  }
  return {
    id: row.id,
    title: String(row.title || ""),
    notes: String(row.notes || ""),
    date: ymd,
    allDay,
    startTime,
    endTime,
    color: row.color || "violet",
    streakDone: Boolean(row.streak_done),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    groupId: row.group_id || null,
  };
}

/**
 * Maps frontend event → Supabase row.
 * Expects table `events` with: id, user_id, title, notes, start_time, end_time, all_day, color, created_at
 * Plus streak_done (boolean) for timed “streak” checkbox — add column in DB if missing.
 */
function mapEventToSupabase(ev, userId) {
  const ymd = ev.date || localYmdFromIso(null);
  const startIso = ev.allDay
    ? new Date(`${ymd}T00:00:00`).toISOString()
    : new Date(`${ymd}T${normalizeHHMM(ev.startTime)}:00`).toISOString();
  const endIso = !ev.allDay && ev.endTime ? new Date(`${ymd}T${normalizeHHMM(ev.endTime)}:00`).toISOString() : null;
  return {
    id: ev.id,
    user_id: userId,
    title: ev.title || "",
    notes: ev.notes || "",
    start_time: startIso,
    end_time: endIso,
    all_day: !!ev.allDay,
    color: ev.color || "violet",
    streak_done: !!ev.streakDone,
    created_at: ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString(),
    group_id: ev.groupId || null,
  };
}

/** Patch for UPDATE on `events` */
function mapEventToSupabaseUpdate(ev) {
  const ymd = ev.date || localYmdFromIso(null);
  const startIso = ev.allDay
    ? new Date(`${ymd}T00:00:00`).toISOString()
    : new Date(`${ymd}T${normalizeHHMM(ev.startTime)}:00`).toISOString();
  const endIso = !ev.allDay && ev.endTime ? new Date(`${ymd}T${normalizeHHMM(ev.endTime)}:00`).toISOString() : null;
  return {
    title: ev.title || "",
    notes: ev.notes || "",
    start_time: startIso,
    end_time: endIso,
    all_day: !!ev.allDay,
    color: ev.color || "violet",
    streak_done: !!ev.streakDone,
    group_id: ev.groupId || null,
  };
}

async function fetchMySupabaseGroupIds(userId) {
  const { data, error } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
  if (error) {
    console.error("group_members (for tasks/events scope):", error.message);
    return [];
  }
  return [...new Set((data || []).map((r) => r.group_id).filter(Boolean))];
}

/**
 * @param {string[] | null} [groupIdsPreloaded]  If provided (e.g. after loadGroups), skips an extra group_members query.
 */
async function loadTasksFromSupabase(groupIdsPreloaded) {
  const userId = await getCurrentUserId();

  if (!userId) return [];

  const groupIds = Array.isArray(groupIdsPreloaded)
    ? groupIdsPreloaded
    : await fetchMySupabaseGroupIds(userId);
  let q = supabase.from("tasks").select("*");
  if (groupIds.length === 0) {
    q = q.eq("user_id", userId);
  } else {
    q = q.or(`user_id.eq.${userId},group_id.in.(${groupIds.join(",")})`);
  }
  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    console.error("Fehler beim Laden der Tasks:", error);
    return [];
  }

  return (data || []).map(mapTaskFromSupabase);
}

/**
 * @param {string[] | null} [groupIdsPreloaded]
 */
async function loadEventsFromSupabase(groupIdsPreloaded) {
  const userId = await getCurrentUserId();

  if (!userId) return [];

  const groupIds = Array.isArray(groupIdsPreloaded)
    ? groupIdsPreloaded
    : await fetchMySupabaseGroupIds(userId);
  let q = supabase.from("events").select("*");
  if (groupIds.length === 0) {
    q = q.eq("user_id", userId);
  } else {
    q = q.or(`user_id.eq.${userId},group_id.in.(${groupIds.join(",")})`);
  }
  const { data, error } = await q.order("start_time", { ascending: true });

  if (error) {
    console.error("Fehler beim Laden der Events:", error.message);
    return [];
  }

  return (data || []).map(mapEventFromSupabase);
}
/** Load profile row from Supabase (source of truth). Prefer mergeProfileFromSupabase during init. */
async function loadUserProfile() {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Kein User zum Laden gefunden");
    return null;
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("Fehler beim Laden des Profils:", error.message);
    return null;
  }
  if (!data) return null;
  applyProfileRowFromSupabasePayload(data);
  return data;
}

/** Parse public.profiles.avatar_url into local profile avatar fields. */
  function parseAvatarUrlFromDatabase(avatar_url) {
    const au = avatar_url || "";
    if (au.startsWith("flow://avatar/")) {
      const id = au.slice("flow://avatar/".length).trim().slice(0, 16) || "p1";
      return { avatarId: id, avatarCustom: null, avatarUrl: "" };
    }
    if (/^https?:\/\//i.test(au)) {
      return { avatarId: "p1", avatarCustom: null, avatarUrl: au };
    }
    if (au.startsWith("data:image")) {
      return { avatarId: "p1", avatarCustom: au, avatarUrl: "" };
    }
    return { avatarId: "p1", avatarCustom: null, avatarUrl: "" };
  }

  function applyProfileRowFromSupabasePayload(data) {
    if (!data) return;
    profile.displayName = data.full_name || data.email || profile.displayName || "You";
    const p = parseAvatarUrlFromDatabase(data.avatar_url);
    profile.avatarId = p.avatarId;
    profile.avatarCustom = p.avatarCustom;
    profile.avatarUrl = p.avatarUrl;
    saveProfile();
    if (typeof els !== "undefined" && els.profileDisplayName) {
      els.profileDisplayName.value = profile.displayName;
    }
    if (typeof applyProfileAvatars === "function") applyProfileAvatars();
    if (typeof syncAvatarPickerActive === "function") syncAvatarPickerActive();
    if (typeof updateSidebarUserName === "function") updateSidebarUserName();
  }
  // ——— Storage keys ———
  const STORAGE_THEME = "flow_theme";
  const STORAGE_LANG = "flow_lang";
  const STORAGE_PROFILE = "flow_profile";
  const STORAGE_REMINDED = "flow_reminded_events";
  /** Set after first automatic browser notification permission prompt (one-time per device). */
  const STORAGE_NOTIF_FIRST_LAUNCH_ASKED = "flow_notif_first_launch_asked_v1";
  const STORAGE_COACH_DISMISS = "flow_coach_dismissed_ymd";
  const STORAGE_SESSION = "flow_auth_session";
  const STORAGE_USERS = "flow_auth_users";
  const STORAGE_COOKIE_CONSENT = "flow_cookie_consent_v1";
  const STORAGE_APP_PREFS = "flow_app_prefs_v1";
  /** Last-opened settings category (sidebar tab id) */
  const STORAGE_SETTINGS_ACTIVE_PANEL = "flow_settings_active_panel_v1";
  const DEFAULT_SETTINGS_PANEL_ID = "settings-section-account";
  const POINTS_PER_TASK_DONE = 5;
  const POINTS_PER_EVENT_STREAK = 3;
  const POINTS_PER_GOAL_DAY = 10;
  /** sessionStorage: show welcome overlay at most once per browser tab session */
  const WELCOME_SESSION_KEY = "flow_welcome_shown_session";

  /** Replace with real OAuth client IDs before production. */
  const AUTH_CONFIG = {
    googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
    appleClientId: "YOUR_APPLE_SERVICE_ID",
    appleRedirectUri: typeof window !== "undefined" ? window.location.origin + "/" : "",
  };

  /**
   * Preset avatars: 48×48 inline SVG, soft modern illustrations (neutral, inclusive).
   * Stylized shapes only — no caricature or stereotypes.
   */
  const AVATAR_PRESETS = {
    p1: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#EDE9FE"/><path d="M9 28c0-11 7-18 15-18s15 7 15 18v2H9v-2z" fill="#3F2E1F"/><ellipse cx="24" cy="27" rx="13" ry="14" fill="#E8B4A0"/><ellipse cx="18.5" cy="25.5" rx="2.2" ry="2.6" fill="#1E293B"/><ellipse cx="29.5" cy="25.5" rx="2.2" ry="2.6" fill="#1E293B"/><path d="M19 31c2.5 2.2 7.5 2.2 10 0" stroke="#1E293B" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M12 40c2-5 6-8 12-8s10 3 12 8" fill="#6366F1"/></svg>',
    p2: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF7ED"/><path d="M8 26c2-10 9-17 16-17s14 7 16 17c-4 6-10 9-16 9s-12-3-16-9z" fill="#1C1917"/><ellipse cx="24" cy="28" rx="12" ry="13" fill="#C48055"/><ellipse cx="18.5" cy="26" rx="2.2" ry="2.7" fill="#0C0A09"/><ellipse cx="29.5" cy="26" rx="2.2" ry="2.7" fill="#0C0A09"/><path d="M19 32c2.5 2 7.5 2 10 0" stroke="#0C0A09" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="38" rx="14" ry="6" fill="#EA580C"/></svg>',
    p3: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#ECFEFF"/><ellipse cx="24" cy="18" rx="16" ry="9" fill="#0369A1"/><ellipse cx="24" cy="28" rx="12" ry="14" fill="#F3D2C1"/><ellipse cx="18.5" cy="26.5" rx="2" ry="2.5" fill="#164E63"/><ellipse cx="29.5" cy="26.5" rx="2" ry="2.5" fill="#164E63"/><path d="M19 32c2.5 2 7.5 2 10 0" stroke="#164E63" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M10 42c2-6 6-9 14-9s12 3 14 9" fill="#0EA5E9"/></svg>',
    p4: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F5F5F4"/><path d="M12 24c0-9 5-15 12-15s12 6 12 15v6H12v-6z" fill="#0C0A09"/><ellipse cx="24" cy="27" rx="11" ry="13" fill="#6B4423"/><ellipse cx="18.5" cy="25.5" rx="2" ry="2.5" fill="#FAFAF9"/><ellipse cx="29.5" cy="25.5" rx="2" ry="2.5" fill="#FAFAF9"/><path d="M19 31c2.5 2 7.5 2 10 0" stroke="#FAFAF9" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="35" cy="30" r="3" fill="#D6D3D1"/><path d="M11 40c2-4 6-6 13-6s11 2 13 6" fill="#78716C"/></svg>',
    p5: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F0FDF4"/><path d="M10 26c0-9 6-15 14-15s14 6 14 15v3H10v-3z" fill="#292524"/><ellipse cx="24" cy="28" rx="12" ry="13" fill="#D4A574"/><rect x="14" y="23" width="20" height="8" rx="2" fill="none" stroke="#1C1917" stroke-width="1.6"/><ellipse cx="18.5" cy="26" rx="2" ry="2.4" fill="#1C1917"/><ellipse cx="29.5" cy="26" rx="2" ry="2.4" fill="#1C1917"/><path d="M19 31.5c2.5 1.8 7.5 1.8 10 0" stroke="#1C1917" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M12 40c2-5 6-7 12-7s10 2 12 7" fill="#22C55E"/></svg>',
    p6: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FDF4FF"/><path d="M6 30c4-14 10-20 18-20s14 6 18 20c-5 4-11 6-18 6s-13-2-18-6z" fill="#831843"/><ellipse cx="24" cy="29" rx="11" ry="12" fill="#FBC9A8"/><ellipse cx="18" cy="27" rx="2" ry="2.5" fill="#4A044E"/><ellipse cx="30" cy="27" rx="2" ry="2.5" fill="#4A044E"/><path d="M19 33c2.5 1.8 7.5 1.8 10 0" stroke="#4A044E" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M10 42c2-5 6-8 14-8s12 3 14 8" fill="#DB2777"/></svg>',
    p7: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F8FAFC"/><path d="M8 44c0-12 4-18 16-18s16 6 16 18H8z" fill="#64748B"/><ellipse cx="24" cy="26" rx="10" ry="11" fill="#C99E83"/><path d="M14 18c2-6 8-10 10-10s8 4 10 10" fill="#475569"/><ellipse cx="18.5" cy="25" rx="1.8" ry="2.2" fill="#0F172A"/><ellipse cx="29.5" cy="25" rx="1.8" ry="2.2" fill="#0F172A"/><path d="M19 30c2.5 1.6 7.5 1.6 10 0" stroke="#0F172A" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>',
    p8: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFFBEB"/><path d="M14 22c0-8 4-13 10-13s10 5 10 13v8H14v-8z" fill="#0F172A"/><ellipse cx="24" cy="27" rx="11" ry="12" fill="#9A6B4A"/><ellipse cx="18.5" cy="25.5" rx="2" ry="2.4" fill="#FEF3C7"/><ellipse cx="29.5" cy="25.5" rx="2" ry="2.4" fill="#FEF3C7"/><path d="M19 31c2.5 2 7.5 2 10 0" stroke="#FEF3C7" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M11 40c2-4 6-6 13-6s11 2 13 6" fill="#F59E0B"/></svg>',
    p9: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#ECFDF5"/><path d="M10 20h28v5H10v-5z" fill="#059669"/><ellipse cx="24" cy="28" rx="12" ry="13" fill="#FFD8BE"/><path d="M12 26c2-8 8-13 12-13s10 5 12 13" fill="#134E4A"/><ellipse cx="18.5" cy="26.5" rx="2" ry="2.5" fill="#064E3B"/><ellipse cx="29.5" cy="26.5" rx="2" ry="2.5" fill="#064E3B"/><path d="M19 32c2.5 1.8 7.5 1.8 10 0" stroke="#064E3B" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M12 40c2-5 6-7 12-7s10 2 12 7" fill="#34D399"/></svg>',
    p10: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FEF3C7"/><path d="M8 28c2-10 8-16 16-16s14 6 16 16v4H8v-4z" fill="#78350F"/><ellipse cx="24" cy="28" rx="12" ry="13" fill="#F0C4A8"/><ellipse cx="18.5" cy="26" rx="2.1" ry="2.6" fill="#422006"/><ellipse cx="29.5" cy="26" rx="2.1" ry="2.6" fill="#422006"/><path d="M19 32c2.5 2 7.5 2 10 0" stroke="#422006" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M10 42c3-5 7-7 14-7s11 2 14 7" fill="#D97706"/></svg>',
    p11: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#EDE9FE"/><path d="M7 24c3-12 9-17 17-17s14 5 17 17c-4 7-10 10-17 10s-13-3-17-10z" fill="#4C1D95"/><ellipse cx="24" cy="28" rx="11" ry="12" fill="#4A3728"/><ellipse cx="18.5" cy="26" rx="2" ry="2.5" fill="#F5F5F4"/><ellipse cx="29.5" cy="26" rx="2" ry="2.5" fill="#F5F5F4"/><path d="M19 31.5c2.5 1.8 7.5 1.8 10 0" stroke="#F5F5F4" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M11 40c2-5 6-7 13-7s11 2 13 7" fill="#8B5CF6"/></svg>',
    p12: '<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E0E7FF"/><circle cx="24" cy="22" r="14" fill="#A5B4FC"/><circle cx="24" cy="26" r="11" fill="#C7D2FE"/><circle cx="19" cy="24" r="2.5" fill="#312E81"/><circle cx="29" cy="24" r="2.5" fill="#312E81"/><path d="M19 29c2.5 2 7.5 2 10 0" stroke="#312E81" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="38" rx="16" ry="5" fill="#818CF8"/></svg>',
  };

  /** @type {{ name: string, code: string, link: string }|null} */
  let lastGroupShareContext = null;
  const LOCALE_MAP = { de: "de-DE", en: "en-US", es: "es-ES", it: "it-IT", tr: "tr-TR", ar: "ar-SA" };
  let currentLang = "en";

  const T = {
    en: {
      "aria.calMode": "Calendar view mode",
      "aria.closeDialog": "Close dialog",
      "aria.nextPeriod": "Next period",
      "aria.openMenu": "Open menu",
      "aria.prevPeriod": "Previous period",
      "aria.settings": "Settings",
      "aria.sidebarNav": "Main navigation",
      "aria.toggleTheme": "Toggle light or dark theme",
      "brand.tagline": "Tasks & events",
      "brand.workspace": "Momentum over management",
      "day.detailKicker": "Day detail",
      "calendar.month": "Month",
      "calendar.newEvent": "New event",
      "calendar.today": "Today",
      "calendar.week": "Week",
      "color.amber": "Amber",
      "color.mint": "Mint",
      "color.rose": "Rose",
      "color.sky": "Sky",
      "color.violet": "Violet",
      "common.cancel": "Cancel",
      "common.delete": "Delete",
      "common.save": "Save",
      "confirm.deleteEvent": "Delete this event?",
      "confirm.deleteTask": "Delete this task?",
      "dashboard.calendarBtn": "Calendar",
      "dashboard.emptyEvents": "No upcoming events in the next two weeks.",
      "dashboard.emptyTasks": "No open tasks. You're all caught up.",
      "dashboard.upcomingEvents": "Upcoming events",
      "dashboard.upcomingTasks": "Upcoming tasks",
      "dashboard.viewAll": "View all",
      "day.allDay": "All day",
      "day.events": "Events",
      "day.noEvents": "No events this day.",
      "day.noTasks": "No tasks due this day.",
      "day.tasks": "Tasks",
      "day.timeNotSet": "Time not set",
      "eventModal.allDay": "All day",
      "eventModal.colorLabel": "Color",
      "eventModal.dateLabel": "Date",
      "eventModal.edit": "Edit event",
      "eventModal.end": "End",
      "eventModal.new": "New event",
      "eventModal.notesLabel": "Notes (optional)",
      "eventModal.placeholderNotes": "Optional notes",
      "eventModal.placeholderTitle": "Meeting, workout, …",
      "eventModal.start": "Start",
      "eventModal.titleLabel": "Title",
      "meta.title": "Flow — Tasks & Calendar",
      "nav.calendar": "Calendar",
      "nav.dashboard": "Dashboard",
      "nav.tasks": "Tasks",
      "page.calendar.subtitle": "Plan events and scan your month",
      "page.calendar.title": "Calendar",
      "page.dashboard.subtitle": "Your upcoming work at a glance",
      "page.dashboard.title": "Dashboard",
      "page.tasks.subtitle": "Organize priorities and due dates",
      "page.tasks.title": "Tasks",
      "priority.high": "High",
      "priority.low": "Low",
      "priority.medium": "Medium",
      "settings.language": "Language",
      "settings.languageHint": "Choose the interface language. Changes apply immediately.",
      "settings.languageLabel": "App language",
      "settings.moreSoon": "More options will appear here later.",
      "settings.openTitle": "Settings",
      "settings.title": "Settings",
      "stats.dueSoon": "Due soon",
      "stats.eventsWeek": "Events this week",
      "stats.openTasks": "Open tasks",
      "taskModal.completedLabel": "Mark as completed",
      "share.scopeLabel": "Share with",
      "share.scopePrivate": "Private (only me)",
      "taskModal.dueLabel": "Due date (optional)",
      "taskModal.edit": "Edit task",
      "taskModal.new": "New task",
      "taskModal.notesLabel": "Notes (optional)",
      "taskModal.placeholderNotes": "Add context or links…",
      "taskModal.placeholderTitle": "What needs to be done?",
      "taskModal.priorityLabel": "Priority",
      "taskModal.titleLabel": "Title",
      "taskModal.saveFailed": "Couldn’t save the task. See the browser console for details.",
      "taskModal.titleRequired": "Please enter a title.",
      "tasks.createTask": "Create task",
      "tasks.delete": "Delete",
      "tasks.duePrefix": "Due",
      "tasks.edit": "Edit",
      "tasks.emptyText": "Add your first task and stay on top of what matters.",
      "tasks.emptyTitle": "Nothing here yet",
      "tasks.filter": "Filter",
      "tasks.filterAll": "All tasks",
      "tasks.filterDone": "Completed",
      "tasks.filterOpen": "Open",
      "tasks.markComplete": "Mark complete",
      "tasks.markIncomplete": "Mark incomplete",
      "tasks.newTask": "New task",
      "tasks.noDueDate": "No due date",
      "tasks.prioritySuffix": "priority",
      "tasks.sort": "Sort",
      "tasks.sortCreated": "Recently added",
      "tasks.sortDue": "By due date",
      "tasks.sortPriority": "By priority",
      "theme.toggleTitle": "Toggle theme",
    },
    de: {
      "aria.calMode": "Kalenderansicht",
      "aria.closeDialog": "Dialog schließen",
      "aria.nextPeriod": "Nächster Zeitraum",
      "aria.openMenu": "Menü öffnen",
      "aria.prevPeriod": "Vorheriger Zeitraum",
      "aria.settings": "Einstellungen",
      "aria.sidebarNav": "Hauptnavigation",
      "aria.toggleTheme": "Hell- oder Dunkelmodus",
      "brand.tagline": "Aufgaben & Termine",
      "brand.workspace": "Momentum statt Management",
      "day.detailKicker": "Tagesdetails",
      "calendar.month": "Monat",
      "calendar.newEvent": "Neuer Termin",
      "calendar.today": "Heute",
      "calendar.week": "Woche",
      "color.amber": "Bernstein",
      "color.mint": "Mint",
      "color.rose": "Rosa",
      "color.sky": "Himmelblau",
      "color.violet": "Violett",
      "common.cancel": "Abbrechen",
      "common.delete": "Löschen",
      "common.save": "Speichern",
      "confirm.deleteEvent": "Diesen Termin löschen?",
      "confirm.deleteTask": "Diese Aufgabe löschen?",
      "dashboard.calendarBtn": "Kalender",
      "dashboard.emptyEvents": "Keine anstehenden Termine in den nächsten zwei Wochen.",
      "dashboard.emptyTasks": "Keine offenen Aufgaben. Alles erledigt.",
      "dashboard.upcomingEvents": "Anstehende Termine",
      "dashboard.upcomingTasks": "Anstehende Aufgaben",
      "dashboard.viewAll": "Alle anzeigen",
      "day.allDay": "Ganztägig",
      "day.events": "Termine",
      "day.noEvents": "Keine Termine an diesem Tag.",
      "day.noTasks": "Keine Aufgaben für diesen Tag.",
      "day.tasks": "Aufgaben",
      "day.timeNotSet": "Keine Uhrzeit",
      "eventModal.allDay": "Ganztägig",
      "eventModal.colorLabel": "Farbe",
      "eventModal.dateLabel": "Datum",
      "eventModal.edit": "Termin bearbeiten",
      "eventModal.end": "Ende",
      "eventModal.new": "Neuer Termin",
      "eventModal.notesLabel": "Notizen (optional)",
      "eventModal.placeholderNotes": "Optionale Notizen",
      "eventModal.placeholderTitle": "Meeting, Sport, …",
      "eventModal.start": "Beginn",
      "eventModal.titleLabel": "Titel",
      "meta.title": "Flow — Aufgaben & Kalender",
      "nav.calendar": "Kalender",
      "nav.dashboard": "Übersicht",
      "nav.tasks": "Aufgaben",
      "page.calendar.subtitle": "Termine planen und den Monat überblicken",
      "page.calendar.title": "Kalender",
      "page.dashboard.subtitle": "Ihre nächsten Schritte auf einen Blick",
      "page.dashboard.title": "Übersicht",
      "page.tasks.subtitle": "Prioritäten und Fälligkeiten ordnen",
      "page.tasks.title": "Aufgaben",
      "priority.high": "Hoch",
      "priority.low": "Niedrig",
      "priority.medium": "Mittel",
      "settings.language": "Sprache",
      "settings.languageHint": "Wählen Sie die Oberflächensprache. Änderungen gelten sofort.",
      "settings.languageLabel": "App-Sprache",
      "settings.moreSoon": "Weitere Optionen folgen.",
      "settings.openTitle": "Einstellungen",
      "settings.title": "Einstellungen",
      "stats.dueSoon": "Bald fällig",
      "stats.eventsWeek": "Termine diese Woche",
      "stats.openTasks": "Offene Aufgaben",
      "taskModal.completedLabel": "Als erledigt markieren",
      "share.scopeLabel": "Teilen mit",
      "share.scopePrivate": "Privat (nur ich)",
      "taskModal.dueLabel": "Fälligkeitsdatum (optional)",
      "taskModal.edit": "Aufgabe bearbeiten",
      "taskModal.new": "Neue Aufgabe",
      "taskModal.notesLabel": "Notizen (optional)",
      "taskModal.placeholderNotes": "Kontext oder Links…",
      "taskModal.placeholderTitle": "Was ist zu erledigen?",
      "taskModal.priorityLabel": "Priorität",
      "taskModal.titleLabel": "Titel",
      "taskModal.saveFailed": "Die Aufgabe konnte nicht gespeichert werden. Details in der Browser-Konsole.",
      "taskModal.titleRequired": "Bitte einen Titel eingeben.",
      "tasks.createTask": "Aufgabe erstellen",
      "tasks.delete": "Löschen",
      "tasks.duePrefix": "Fällig",
      "tasks.edit": "Bearbeiten",
      "tasks.emptyText": "Legen Sie Ihre erste Aufgabe an und behalten Sie den Überblick.",
      "tasks.emptyTitle": "Noch nichts hier",
      "tasks.filter": "Filter",
      "tasks.filterAll": "Alle Aufgaben",
      "tasks.filterDone": "Erledigt",
      "tasks.filterOpen": "Offen",
      "tasks.markComplete": "Als erledigt markieren",
      "tasks.markIncomplete": "Als offen markieren",
      "tasks.newTask": "Neue Aufgabe",
      "tasks.noDueDate": "Kein Fälligkeitsdatum",
      "tasks.prioritySuffix": "Priorität",
      "tasks.sort": "Sortierung",
      "tasks.sortCreated": "Zuletzt hinzugefügt",
      "tasks.sortDue": "Nach Fälligkeit",
      "tasks.sortPriority": "Nach Priorität",
      "theme.toggleTitle": "Erscheinungsbild",
    },
    es: {
      "aria.calMode": "Modo de vista del calendario",
      "aria.closeDialog": "Cerrar diálogo",
      "aria.nextPeriod": "Periodo siguiente",
      "aria.openMenu": "Abrir menú",
      "aria.prevPeriod": "Periodo anterior",
      "aria.settings": "Ajustes",
      "aria.sidebarNav": "Navegación principal",
      "aria.toggleTheme": "Cambiar tema claro u oscuro",
      "brand.tagline": "Tareas y eventos",
      "brand.workspace": "Impulso, no solo gestión",
      "day.detailKicker": "Detalle del día",
      "calendar.month": "Mes",
      "calendar.newEvent": "Nuevo evento",
      "calendar.today": "Hoy",
      "calendar.week": "Semana",
      "color.amber": "Ámbar",
      "color.mint": "Menta",
      "color.rose": "Rosa",
      "color.sky": "Cielo",
      "color.violet": "Violeta",
      "common.cancel": "Cancelar",
      "common.delete": "Eliminar",
      "common.save": "Guardar",
      "confirm.deleteEvent": "¿Eliminar este evento?",
      "confirm.deleteTask": "¿Eliminar esta tarea?",
      "dashboard.calendarBtn": "Calendario",
      "dashboard.emptyEvents": "No hay eventos próximos en las dos próximas semanas.",
      "dashboard.emptyTasks": "No hay tareas abiertas. Todo al día.",
      "dashboard.upcomingEvents": "Próximos eventos",
      "dashboard.upcomingTasks": "Próximas tareas",
      "dashboard.viewAll": "Ver todo",
      "day.allDay": "Todo el día",
      "day.events": "Eventos",
      "day.noEvents": "No hay eventos este día.",
      "day.noTasks": "No hay tareas para este día.",
      "day.tasks": "Tareas",
      "day.timeNotSet": "Sin hora",
      "eventModal.allDay": "Todo el día",
      "eventModal.colorLabel": "Color",
      "eventModal.dateLabel": "Fecha",
      "eventModal.edit": "Editar evento",
      "eventModal.end": "Fin",
      "eventModal.new": "Nuevo evento",
      "eventModal.notesLabel": "Notas (opcional)",
      "eventModal.placeholderNotes": "Notas opcionales",
      "eventModal.placeholderTitle": "Reunión, deporte, …",
      "eventModal.start": "Inicio",
      "eventModal.titleLabel": "Título",
      "meta.title": "Flow — Tareas y calendario",
      "nav.calendar": "Calendario",
      "nav.dashboard": "Resumen",
      "nav.tasks": "Tareas",
      "page.calendar.subtitle": "Planifica eventos y revisa el mes",
      "page.calendar.title": "Calendario",
      "page.dashboard.subtitle": "Tu trabajo próximo de un vistazo",
      "page.dashboard.title": "Resumen",
      "page.tasks.subtitle": "Organiza prioridades y fechas límite",
      "page.tasks.title": "Tareas",
      "priority.high": "Alta",
      "priority.low": "Baja",
      "priority.medium": "Media",
      "settings.language": "Idioma",
      "settings.languageHint": "Elige el idioma de la interfaz. Los cambios son inmediatos.",
      "settings.languageLabel": "Idioma de la app",
      "settings.moreSoon": "Más opciones próximamente.",
      "settings.openTitle": "Ajustes",
      "settings.title": "Ajustes",
      "stats.dueSoon": "Próximas fechas",
      "stats.eventsWeek": "Eventos esta semana",
      "stats.openTasks": "Tareas abiertas",
      "taskModal.completedLabel": "Marcar como completada",
      "taskModal.dueLabel": "Fecha límite (opcional)",
      "taskModal.edit": "Editar tarea",
      "taskModal.new": "Nueva tarea",
      "taskModal.notesLabel": "Notas (opcional)",
      "taskModal.placeholderNotes": "Contexto o enlaces…",
      "taskModal.placeholderTitle": "¿Qué hay que hacer?",
      "taskModal.priorityLabel": "Prioridad",
      "taskModal.titleLabel": "Título",
      "tasks.createTask": "Crear tarea",
      "tasks.delete": "Eliminar",
      "tasks.duePrefix": "Vence",
      "tasks.edit": "Editar",
      "tasks.emptyText": "Añade tu primera tarea y mantén el control.",
      "tasks.emptyTitle": "Aún no hay nada",
      "tasks.filter": "Filtro",
      "tasks.filterAll": "Todas las tareas",
      "tasks.filterDone": "Completadas",
      "tasks.filterOpen": "Abiertas",
      "tasks.markComplete": "Marcar como completada",
      "tasks.markIncomplete": "Marcar como pendiente",
      "tasks.newTask": "Nueva tarea",
      "tasks.noDueDate": "Sin fecha límite",
      "tasks.prioritySuffix": "prioridad",
      "tasks.sort": "Orden",
      "tasks.sortCreated": "Añadidas recientemente",
      "tasks.sortDue": "Por fecha límite",
      "tasks.sortPriority": "Por prioridad",
      "theme.toggleTitle": "Tema",
    },
    it: {
      "aria.calMode": "Modalità calendario",
      "aria.closeDialog": "Chiudi finestra",
      "aria.nextPeriod": "Periodo successivo",
      "aria.openMenu": "Apri menu",
      "aria.prevPeriod": "Periodo precedente",
      "aria.settings": "Impostazioni",
      "aria.sidebarNav": "Navigazione principale",
      "aria.toggleTheme": "Tema chiaro o scuro",
      "brand.tagline": "Attività ed eventi",
      "brand.workspace": "Slancio oltre la gestione",
      "day.detailKicker": "Dettaglio giorno",
      "calendar.month": "Mese",
      "calendar.newEvent": "Nuovo evento",
      "calendar.today": "Oggi",
      "calendar.week": "Settimana",
      "color.amber": "Ambra",
      "color.mint": "Menta",
      "color.rose": "Rosa",
      "color.sky": "Cielo",
      "color.violet": "Viola",
      "common.cancel": "Annulla",
      "common.delete": "Elimina",
      "common.save": "Salva",
      "confirm.deleteEvent": "Eliminare questo evento?",
      "confirm.deleteTask": "Eliminare questa attività?",
      "dashboard.calendarBtn": "Calendario",
      "dashboard.emptyEvents": "Nessun evento nelle prossime due settimane.",
      "dashboard.emptyTasks": "Nessuna attività aperta. Tutto in ordine.",
      "dashboard.upcomingEvents": "Prossimi eventi",
      "dashboard.upcomingTasks": "Prossime attività",
      "dashboard.viewAll": "Vedi tutto",
      "day.allDay": "Tutto il giorno",
      "day.events": "Eventi",
      "day.noEvents": "Nessun evento in questo giorno.",
      "day.noTasks": "Nessuna attività per questo giorno.",
      "day.tasks": "Attività",
      "day.timeNotSet": "Ora non impostata",
      "eventModal.allDay": "Tutto il giorno",
      "eventModal.colorLabel": "Colore",
      "eventModal.dateLabel": "Data",
      "eventModal.edit": "Modifica evento",
      "eventModal.end": "Fine",
      "eventModal.new": "Nuovo evento",
      "eventModal.notesLabel": "Note (opzionale)",
      "eventModal.placeholderNotes": "Note opzionali",
      "eventModal.placeholderTitle": "Riunione, allenamento, …",
      "eventModal.start": "Inizio",
      "eventModal.titleLabel": "Titolo",
      "meta.title": "Flow — Attività e calendario",
      "nav.calendar": "Calendario",
      "nav.dashboard": "Riepilogo",
      "nav.tasks": "Attività",
      "page.calendar.subtitle": "Pianifica eventi e consulta il mese",
      "page.calendar.title": "Calendario",
      "page.dashboard.subtitle": "Il tuo lavoro in arrivo a colpo d'occhio",
      "page.dashboard.title": "Riepilogo",
      "page.tasks.subtitle": "Organizza priorità e scadenze",
      "page.tasks.title": "Attività",
      "priority.high": "Alta",
      "priority.low": "Bassa",
      "priority.medium": "Media",
      "settings.language": "Lingua",
      "settings.languageHint": "Scegli la lingua dell'interfaccia. Le modifiche sono immediate.",
      "settings.languageLabel": "Lingua dell'app",
      "settings.moreSoon": "Altre opzioni in arrivo.",
      "settings.openTitle": "Impostazioni",
      "settings.title": "Impostazioni",
      "stats.dueSoon": "In scadenza",
      "stats.eventsWeek": "Eventi questa settimana",
      "stats.openTasks": "Attività aperte",
      "taskModal.completedLabel": "Segna come completata",
      "taskModal.dueLabel": "Scadenza (opzionale)",
      "taskModal.edit": "Modifica attività",
      "taskModal.new": "Nuova attività",
      "taskModal.notesLabel": "Note (opzionale)",
      "taskModal.placeholderNotes": "Contesto o link…",
      "taskModal.placeholderTitle": "Cosa c'è da fare?",
      "taskModal.priorityLabel": "Priorità",
      "taskModal.titleLabel": "Titolo",
      "tasks.createTask": "Crea attività",
      "tasks.delete": "Elimina",
      "tasks.duePrefix": "Scadenza",
      "tasks.edit": "Modifica",
      "tasks.emptyText": "Aggiungi la prima attività e resta organizzato.",
      "tasks.emptyTitle": "Ancora niente qui",
      "tasks.filter": "Filtro",
      "tasks.filterAll": "Tutte le attività",
      "tasks.filterDone": "Completate",
      "tasks.filterOpen": "Aperte",
      "tasks.markComplete": "Segna come completata",
      "tasks.markIncomplete": "Segna come non completata",
      "tasks.newTask": "Nuova attività",
      "tasks.noDueDate": "Nessuna scadenza",
      "tasks.prioritySuffix": "priorità",
      "tasks.sort": "Ordina",
      "tasks.sortCreated": "Aggiunte di recente",
      "tasks.sortDue": "Per scadenza",
      "tasks.sortPriority": "Per priorità",
      "theme.toggleTitle": "Tema",
    },
    tr: {
      "aria.calMode": "Takvim görünümü",
      "aria.closeDialog": "Pencereyi kapat",
      "aria.nextPeriod": "Sonraki dönem",
      "aria.openMenu": "Menüyü aç",
      "aria.prevPeriod": "Önceki dönem",
      "aria.settings": "Ayarlar",
      "aria.sidebarNav": "Ana gezinme",
      "aria.toggleTheme": "Açık veya koyu tema",
      "brand.tagline": "Görevler ve etkinlikler",
      "brand.workspace": "Yönetimden önce momentum",
      "day.detailKicker": "Gün özeti",
      "calendar.month": "Ay",
      "calendar.newEvent": "Yeni etkinlik",
      "calendar.today": "Bugün",
      "calendar.week": "Hafta",
      "color.amber": "Kehribar",
      "color.mint": "Nane",
      "color.rose": "Gül",
      "color.sky": "Gök",
      "color.violet": "Menekşe",
      "common.cancel": "İptal",
      "common.delete": "Sil",
      "common.save": "Kaydet",
      "confirm.deleteEvent": "Bu etkinlik silinsin mi?",
      "confirm.deleteTask": "Bu görev silinsin mi?",
      "dashboard.calendarBtn": "Takvim",
      "dashboard.emptyEvents": "Önümüzdeki iki haftada etkinlik yok.",
      "dashboard.emptyTasks": "Açık görev yok. Her şey güncel.",
      "dashboard.upcomingEvents": "Yaklaşan etkinlikler",
      "dashboard.upcomingTasks": "Yaklaşan görevler",
      "dashboard.viewAll": "Tümünü gör",
      "day.allDay": "Tüm gün",
      "day.events": "Etkinlikler",
      "day.noEvents": "Bu gün etkinlik yok.",
      "day.noTasks": "Bu gün için görev yok.",
      "day.tasks": "Görevler",
      "day.timeNotSet": "Saat yok",
      "eventModal.allDay": "Tüm gün",
      "eventModal.colorLabel": "Renk",
      "eventModal.dateLabel": "Tarih",
      "eventModal.edit": "Etkinliği düzenle",
      "eventModal.end": "Bitiş",
      "eventModal.new": "Yeni etkinlik",
      "eventModal.notesLabel": "Notlar (isteğe bağlı)",
      "eventModal.placeholderNotes": "İsteğe bağlı notlar",
      "eventModal.placeholderTitle": "Toplantı, spor, …",
      "eventModal.start": "Başlangıç",
      "eventModal.titleLabel": "Başlık",
      "meta.title": "Flow — Görevler ve takvim",
      "nav.calendar": "Takvim",
      "nav.dashboard": "Özet",
      "nav.tasks": "Görevler",
      "page.calendar.subtitle": "Etkinlikleri planlayın ve ayı görün",
      "page.calendar.title": "Takvim",
      "page.dashboard.subtitle": "Yaklaşan işlerinize genel bakış",
      "page.dashboard.title": "Özet",
      "page.tasks.subtitle": "Öncelikleri ve son tarihleri düzenleyin",
      "page.tasks.title": "Görevler",
      "priority.high": "Yüksek",
      "priority.low": "Düşük",
      "priority.medium": "Orta",
      "settings.language": "Dil",
      "settings.languageHint": "Arayüz dilini seçin. Değişiklikler hemen uygulanır.",
      "settings.languageLabel": "Uygulama dili",
      "settings.moreSoon": "Daha fazla seçenek yakında.",
      "settings.openTitle": "Ayarlar",
      "settings.title": "Ayarlar",
      "stats.dueSoon": "Yakında bitecek",
      "stats.eventsWeek": "Bu haftanın etkinlikleri",
      "stats.openTasks": "Açık görevler",
      "taskModal.completedLabel": "Tamamlandı olarak işaretle",
      "taskModal.dueLabel": "Son tarih (isteğe bağlı)",
      "taskModal.edit": "Görevi düzenle",
      "taskModal.new": "Yeni görev",
      "taskModal.notesLabel": "Notlar (isteğe bağlı)",
      "taskModal.placeholderNotes": "Bağlam veya bağlantılar…",
      "taskModal.placeholderTitle": "Ne yapılması gerekiyor?",
      "taskModal.priorityLabel": "Öncelik",
      "taskModal.titleLabel": "Başlık",
      "tasks.createTask": "Görev oluştur",
      "tasks.delete": "Sil",
      "tasks.duePrefix": "Son tarih",
      "tasks.edit": "Düzenle",
      "tasks.emptyText": "İlk görevinizi ekleyin ve kontrolü elinizde tutun.",
      "tasks.emptyTitle": "Henüz bir şey yok",
      "tasks.filter": "Filtre",
      "tasks.filterAll": "Tüm görevler",
      "tasks.filterDone": "Tamamlandı",
      "tasks.filterOpen": "Açık",
      "tasks.markComplete": "Tamamlandı işaretle",
      "tasks.markIncomplete": "Tamamlanmadı işaretle",
      "tasks.newTask": "Yeni görev",
      "tasks.noDueDate": "Son tarih yok",
      "tasks.prioritySuffix": "öncelik",
      "tasks.sort": "Sırala",
      "tasks.sortCreated": "Son eklenenler",
      "tasks.sortDue": "Son tarihe göre",
      "tasks.sortPriority": "Önceliğe göre",
      "theme.toggleTitle": "Tema",
    },
    ar: {
      "aria.calMode": "وضع عرض التقويم",
      "aria.closeDialog": "إغلاق الحوار",
      "aria.nextPeriod": "الفترة التالية",
      "aria.openMenu": "فتح القائمة",
      "aria.prevPeriod": "الفترة السابقة",
      "aria.settings": "الإعدادات",
      "aria.sidebarNav": "التنقل الرئيسي",
      "aria.toggleTheme": "تبديل السمة الفاتحة أو الداكنة",
      "brand.tagline": "المهام والفعاليات",
      "brand.workspace": "الزخم قبل الإدارة",
      "day.detailKicker": "تفاصيل اليوم",
      "calendar.month": "شهر",
      "calendar.newEvent": "فعالية جديدة",
      "calendar.today": "اليوم",
      "calendar.week": "أسبوع",
      "color.amber": "كهرماني",
      "color.mint": "نعناعي",
      "color.rose": "وردي",
      "color.sky": "سماوي",
      "color.violet": "بنفسجي",
      "common.cancel": "إلغاء",
      "common.delete": "حذف",
      "common.save": "حفظ",
      "confirm.deleteEvent": "حذف هذه الفعالية؟",
      "confirm.deleteTask": "حذف هذه المهمة؟",
      "dashboard.calendarBtn": "التقويم",
      "dashboard.emptyEvents": "لا فعاليات قادمة خلال أسبوعين.",
      "dashboard.emptyTasks": "لا توجد مهام مفتوحة. كل شيء محدث.",
      "dashboard.upcomingEvents": "الفعاليات القادمة",
      "dashboard.upcomingTasks": "المهام القادمة",
      "dashboard.viewAll": "عرض الكل",
      "day.allDay": "طوال اليوم",
      "day.events": "الفعاليات",
      "day.noEvents": "لا فعاليات في هذا اليوم.",
      "day.noTasks": "لا مهام في هذا اليوم.",
      "day.tasks": "المهام",
      "day.timeNotSet": "لم يُحدد وقت",
      "eventModal.allDay": "طوال اليوم",
      "eventModal.colorLabel": "اللون",
      "eventModal.dateLabel": "التاريخ",
      "eventModal.edit": "تعديل الفعالية",
      "eventModal.end": "النهاية",
      "eventModal.new": "فعالية جديدة",
      "eventModal.notesLabel": "ملاحظات (اختياري)",
      "eventModal.placeholderNotes": "ملاحظات اختيارية",
      "eventModal.placeholderTitle": "اجتماع، رياضة، …",
      "eventModal.start": "البداية",
      "eventModal.titleLabel": "العنوان",
      "meta.title": "Flow — المهام والتقويم",
      "nav.calendar": "التقويم",
      "nav.dashboard": "لوحة التحكم",
      "nav.tasks": "المهام",
      "page.calendar.subtitle": "خطط للفعاليات واطلع على الشهر",
      "page.calendar.title": "التقويم",
      "page.dashboard.subtitle": "نظرة على عملك القادم",
      "page.dashboard.title": "لوحة التحكم",
      "page.tasks.subtitle": "نظّم الأولويات والمواعيد النهائية",
      "page.tasks.title": "المهام",
      "priority.high": "عالية",
      "priority.low": "منخفضة",
      "priority.medium": "متوسطة",
      "settings.language": "اللغة",
      "settings.languageHint": "اختر لغة الواجهة. يُطبَّق التغيير فورًا.",
      "settings.languageLabel": "لغة التطبيق",
      "settings.moreSoon": "المزيد من الخيارات لاحقًا.",
      "settings.openTitle": "الإعدادات",
      "settings.title": "الإعدادات",
      "stats.dueSoon": "قريب الاستحقاق",
      "stats.eventsWeek": "فعاليات هذا الأسبوع",
      "stats.openTasks": "مهام مفتوحة",
      "taskModal.completedLabel": "وضع كمكتمل",
      "taskModal.dueLabel": "تاريخ الاستحقاق (اختياري)",
      "taskModal.edit": "تعديل المهمة",
      "taskModal.new": "مهمة جديدة",
      "taskModal.notesLabel": "ملاحظات (اختياري)",
      "taskModal.placeholderNotes": "سياق أو روابط…",
      "taskModal.placeholderTitle": "ما المطلوب إنجازه؟",
      "taskModal.priorityLabel": "الأولوية",
      "taskModal.titleLabel": "العنوان",
      "tasks.createTask": "إنشاء مهمة",
      "tasks.delete": "حذف",
      "tasks.duePrefix": "يستحق",
      "tasks.edit": "تعديل",
      "tasks.emptyText": "أضف مهمتك الأولى وابقَ على اطلاع.",
      "tasks.emptyTitle": "لا شيء هنا بعد",
      "tasks.filter": "تصفية",
      "tasks.filterAll": "كل المهام",
      "tasks.filterDone": "مكتملة",
      "tasks.filterOpen": "مفتوحة",
      "tasks.markComplete": "وضع كمكتمل",
      "tasks.markIncomplete": "وضع كغير مكتمل",
      "tasks.newTask": "مهمة جديدة",
      "tasks.noDueDate": "بدون تاريخ استحقاق",
      "tasks.prioritySuffix": "أولوية",
      "tasks.sort": "ترتيب",
      "tasks.sortCreated": "المضافة مؤخرًا",
      "tasks.sortDue": "حسب الاستحقاق",
      "tasks.sortPriority": "حسب الأولوية",
      "theme.toggleTitle": "المظهر",
    },
  };

  Object.assign(T.en, {
    "nav.motivation": "Motivation",
    "nav.selfcare": "Self-Care",
    "nav.groups": "Groups",
    "page.motivation.title": "Motivation",
    "page.motivation.subtitle": "Streaks, buddy goals, and consistency",
    "page.selfcare.title": "Self-Care Journal",
    "page.selfcare.subtitle": "Daily reflection, gratitude, and gentle check-ins",
    "page.groups.title": "Groups",
    "page.groups.subtitle": "Create or join a group with a code or link",
    "selfcare.kicker": "Daily journal",
    "selfcare.title": "Self-Care Journal",
    "selfcare.intro": "A calm space for reflection. Capture what mattered today and revisit past entries any time.",
    "selfcare.dateLabel": "Date",
    "selfcare.historyLabel": "Open an existing entry",
    "selfcare.historyPlaceholder": "No saved entries yet",
    "selfcare.historyTitle": "Saved entries",
    "selfcare.historyHint": "Newest first. Select a day to preview or edit.",
    "selfcare.placeholder": "Write freely...",
    "selfcare.q.grateful": "What are you grateful for today?",
    "selfcare.q.smile": "What made you smile today?",
    "selfcare.q.well": "What went well today?",
    "selfcare.q.proud": "What are you proud of today?",
    "selfcare.q.self": "What did you appreciate about yourself today?",
    "selfcare.q.surprise": "What surprised you in a positive way today?",
    "selfcare.statusIdle": "No changes yet.",
    "selfcare.statusSaved": "Entry saved.",
    "selfcare.statusDraft": "Unsaved changes.",
    "selfcare.statusLoaded": "Entry loaded.",
    "selfcare.saveBtn": "Save entry",
    "selfcare.clearBtn": "Clear form",
    "selfcare.loadDateBtn": "Open selected date",
    "selfcare.editBtn": "Edit this entry",
    "nav.achievements": "Achievements",
    "page.achievements.title": "Achievements",
    "page.achievements.subtitle": "Unlock milestones through consistency",
    "ach.kicker": "Progress rewards",
    "ach.title": "Achievements",
    "ach.intro": "Unlock badges through real consistency: tasks, streaks, self-care, social progress, and long-term discipline.",
    "ach.filter.status": "Status",
    "ach.filter.category": "Category",
    "ach.filter.all": "All",
    "ach.filter.unlocked": "Unlocked",
    "ach.filter.locked": "Locked",
    "ach.filter.allCategories": "All categories",
    "ach.summary.unlocked": "{n} unlocked",
    "ach.summary.total": "{n} total",
    "ach.summary.progress": "{n}% complete",
    "ach.status.unlocked": "Unlocked",
    "ach.status.locked": "Locked",
    "ach.achievedOn": "Achieved on {date}",
    "ach.progress": "Progress {done}/{target}",
    "ach.empty": "No achievements match the current filter.",
    "ach.toastUnlocked": "Achievement unlocked: {name}",
    "ach.category.productivity": "Productivity",
    "ach.category.discipline": "Discipline",
    "ach.category.streaks": "Streaks",
    "ach.category.selfcare": "Self-Care",
    "ach.category.social": "Social",
    "ach.category.progress": "Progress",
    "ach.name.task_done_50": "Task Finisher I",
    "ach.desc.task_done_50": "Complete 50 tasks.",
    "ach.name.task_done_100": "Task Finisher II",
    "ach.desc.task_done_100": "Complete 100 tasks.",
    "ach.name.timed_events_10": "On Time",
    "ach.desc.timed_events_10": "Mark 10 timed events as done.",
    "ach.name.streak_7": "7-Day Streak",
    "ach.desc.streak_7": "Reach a streak of 7 days.",
    "ach.name.streak_30": "30-Day Streak",
    "ach.desc.streak_30": "Reach a streak of 30 days.",
    "ach.name.perfect_days_5": "Perfect Week Start",
    "ach.desc.perfect_days_5": "Reach 5 successful goal days.",
    "ach.name.perfect_days_10": "Perfect Ten",
    "ach.desc.perfect_days_10": "Reach 10 successful goal days.",
    "ach.name.selfcare_first": "First Reflection",
    "ach.desc.selfcare_first": "Save your first self-care journal entry.",
    "ach.name.selfcare_streak_3": "Mindful Trio",
    "ach.desc.selfcare_streak_3": "Write journal entries on 3 consecutive days.",
    "ach.name.selfcare_days_7": "Weekly Reflection",
    "ach.desc.selfcare_days_7": "Save journal entries on 7 different days.",
    "ach.name.group_created": "Founder",
    "ach.desc.group_created": "Create your first group.",
    "ach.name.group_member_2": "First Invite",
    "ach.desc.group_member_2": "Have at least 2 members in one of your groups.",
    "ach.name.group_rank_1": "Top of the Group",
    "ach.desc.group_rank_1": "Reach rank #1 in your group ranking.",
    "ach.name.active_days_30": "30 Active Days",
    "ach.desc.active_days_30": "Be active on 30 different days.",
    "ach.name.achievements_3": "Collector I",
    "ach.desc.achievements_3": "Unlock 3 achievements.",
    "ach.name.achievements_10": "Collector II",
    "ach.desc.achievements_10": "Unlock 10 achievements.",
    "streak.title": "Your streak",
    "streak.subtitle": "Stay consistent with tasks and timed events.",
    "streak.current": "Current streak",
    "streak.longest": "Longest streak",
    "streak.days": "days",
    "streak.todayYes": "Today: activity logged ✓",
    "streak.todayNo": "Today: not yet — complete a task or mark an event done",
    "streak.weekProgress": "Last 7 days",
    "streak.ruleHint": "A day counts when you complete a task or mark a timed event as done for streak.",
    "buddy.title": "Buddy streak",
    "buddy.subtitle": "Stay accountable together.",
    "buddy.partnerName": "Buddy name",
    "buddy.partnerPlaceholder": "Friend or teammate",
    "buddy.together": "Together",
    "buddy.best": "Best",
    "buddy.activityLabel": "Activity",
    "buddy.me": "You",
    "buddy.partner": "Buddy",
    "buddy.partnerActiveToday": "My buddy was active today",
    "buddy.hint": "Both of you need activity on the same day to grow the buddy streak. Your activity comes from completed tasks and timed events marked done.",
    "buddy.lastYou": "You last active",
    "buddy.lastBuddy": "Buddy last marked active",
    "groups.createTitle": "Create a group",
    "groups.createHint": "Create a cloud group and invite others with a code or link.",
    "groups.nameLabel": "Group name",
    "groups.namePlaceholder": "Study crew",
    "groups.createBtn": "Create group",
    "groups.joinTitle": "Join a group",
    "groups.joinHint": "Enter a code or use an invite link.",
    "groups.codeLabel": "Group code",
    "groups.joinPlaceholder": "ABC123",
    "groups.joinBtn": "Join with code",
    "groups.yourGroup": "Your group",
    "groups.noGroup": "You are not in a group yet.",
    "groups.inviteLink": "Invite link",
    "groups.members": "Members",
    "groups.copyCode": "Copy",
    "groups.copyLink": "Copy link",
    "groups.leave": "Leave group",
    "groups.joined": "Joined group",
    "groups.created": "Group created",
    "groups.copied": "Copied",
    "groups.invalidCode": "No group matches this code.",
    "groups.createFailed": "Could not create the group. Try again.",
    "settings.profile": "Profile",
    "settings.profileHint": "Used in groups and buddy features.",
    "settings.displayName": "Display name",
    "settings.displayNamePlaceholder": "Your name",
    "settings.reminders": "Reminders",
    "settings.remindersHint": "Get notified 30 minutes before timed events. Browser notifications require permission.",
    "settings.enableNotifications": "Enable notifications",
    "settings.notifGranted": "Notifications enabled",
    "settings.notifDenied": "Blocked — reminders will show inside the app only",
    "settings.notifDefault": "Not requested yet",
    "notif.eventBodySoon": "Starting soon",
    "notif.tasksDueTitle": "Tasks due today",
    "notif.tasksDueBody": "You have {n} open task(s) due today.",
    "toast.reminderTitle": "Upcoming",
    "toast.reminderBody": "{title} at {time}",
    "dashboard.openMotivation": "Open",
    "buddy.shortLabel": "Buddy",
    "eventModal.streakDone": "Mark as done for streak (timed event)",
    "eventModal.kicker": "Scheduled event",
    "eventModal.timeSection": "Time on this day",
    "eventModal.timeHint": "Start time is required unless the event is all day. End time is optional.",
    "eventModal.endOptional": "optional",
    "eventModal.errStartRequired": "Please set a start time, or choose “All day”.",
    "eventModal.hourShort": "h",
    "eventModal.minShort": "min",
    "groups.openCreateModal": "Create group",
    "groups.modalTitle": "Create group",
    "groups.modalHint": "Choose a name. You will get a unique code and invite link.",
    "groups.createdReady": "Your group is ready",
    "groups.done": "Done",
    "groups.nameRequired": "Please enter a group name.",
    "groups.shareLabel": "Share",
    "share.whatsapp": "WhatsApp",
    "share.facebook": "Facebook",
    "share.sms": "SMS",
    "share.instagram": "Instagram",
    "share.system": "Share…",
    "share.copyAll": "Copy code & link",
    "share.message": "Join my Flow group \"{name}\"! Code: {code} — {link}",
    "share.instagramHint": "Link copied — paste it in Instagram to share.",
    "settings.avatarLabel": "Profile picture",
    "settings.avatarUpload": "Upload photo",
    "settings.avatarPickerAria": "Choose preset avatar",
    "settings.avatarChoosePreset": "Choose a character",
    "settings.avatarUploadShort": "Your photo",
    "settings.avatarOptionPrefix": "Character",
    "coach.message": "Hey! You have {tasks} open tasks and {events} events today.",
    "settings.avatarError": "Could not read that image.",
    "profile.defaultName": "You",
    "welcome.kicker": "Welcome",
    "welcome.message": "Hello {name}! You have {tasks} open tasks and {events} events today.",
    "welcome.continue": "Let's go",
    "calendar.recap": "Recap",
    "calendar.recapTitle": "Goal recap",
    "calendar.recapWeek": "Week",
    "calendar.recapMonth": "Month",
    "calendar.recapSuccess": "Successful days",
    "calendar.recapFail": "Incomplete days",
    "calendar.recapRate": "Success rate",
    "calendar.recapHint":
      "A day succeeds when every task due that day is done. Past days with open tasks count as incomplete. Today shows success only when all due tasks are complete.",
    "calendar.recapPersistHint": "Based on your tasks stored in this browser.",
    "groups.rankingTitle": "Monthly ranking",
    "groups.rankingHint":
      "Scores are for the current month on this device: tasks completed (+5), timed events marked done for streak (+3), successful calendar days (+10). Other members show 0 until they use Flow on their device.",
    "groups.rankingYou": "You: place {rank} · {pts} pts (−{gap} pts vs top)",
    "groups.rankingYouLead": "You're #1 this month with {pts} pts on this device.",
    "groups.rankingBehind": "−{n} pts vs top",
    "groups.rankingPtsShort": "pts",
    "streak.ruleHintMin":
      "A day counts toward your streak when you complete at least {n} tasks that day, or mark a timed event as done for streak.",
    "settings.nav.account": "Account",
    "settings.nav.notifications": "Notifications",
    "settings.nav.language": "Language & region",
    "settings.nav.appearance": "Appearance",
    "settings.nav.privacy": "Privacy & security",
    "settings.nav.groups": "Groups",
    "settings.nav.streak": "Goals & streak",
    "settings.nav.recap": "Statistics",
    "settings.nav.general": "General",
    "settings.accountProfileHint": "Your sign-in, profile picture, and display name.",
    "settings.changePassword": "Change password",
    "settings.passwordSoon": "Password changes will be available when a server is connected.",
    "settings.masterNotifications": "All notifications & reminders",
    "settings.remindEvents": "Event reminders",
    "settings.remindTasks": "Reminders for tasks due today",
    "settings.reminderLead": "Remind me before events",
    "settings.reminderLeadHint": "How long before a timed event starts.",
    "settings.dailyOpenTasks": "Daily reminder for open tasks",
    "settings.dailyOpenTasksHint": "At the time below, get a summary if you still have open tasks.",
    "settings.dailyTime": "Reminder time",
    "settings.taskDueTodayToast": "You have {n} task(s) due today.",
    "settings.dailyOpenTasksToast": "You have {n} open task(s).",
    "settings.streakNudgeToast": "No activity logged yet today — keep your streak going.",
    "settings.timeFormat": "Time format",
    "settings.time24": "24-hour",
    "settings.time12": "12-hour (AM/PM)",
    "settings.dateStyle": "Date display",
    "settings.dateLocale": "Locale default",
    "settings.dateIso": "ISO (YYYY-MM-DD)",
    "settings.dateDmy": "DD.MM.YYYY",
    "settings.theme": "Theme",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "settings.accent": "Accent",
    "settings.accentDefault": "Default",
    "settings.accentOcean": "Ocean",
    "settings.accentRose": "Rose",
    "settings.accentMint": "Mint",
    "settings.accentAmber": "Amber",
    "settings.animations": "Interface animations",
    "settings.reduceMotion": "Reduce motion",
    "settings.privacyTitle": "Privacy & security",
    "settings.privacyIntro":
      "Your tasks, events, groups, journal, focus history, achievements, buddy, and points are stored securely in Supabase and synced to this device. Theme, language, and app preferences stay locally.",
    "settings.securityHint": "Use a strong password and lock your device. For production, connect a real authentication API.",
    "settings.clearData": "Clear app data on this device",
    "settings.clearDataHint":
      "Deletes your tasks, events, self-care entries, focus sessions, achievements, buddy state, and points log in Supabase for this account. Theme, language, and app preferences are kept.",
    "settings.clearDataConfirm":
      "Delete all your Flow data in the cloud (tasks, events, journal, focus, achievements, buddy, points) for this account? Your login session stays active.",
    "settings.clearDataDone": "Your cloud data was deleted.",
    "settings.clearDataNeedAuth": "Please sign in to clear cloud data.",
    "settings.openCookies": "Cookie preferences",
    "settings.groupsIntro": "Your active group. Manage invites from here or in the Groups tab.",
    "settings.manageInGroups": "Open Groups tab",
    "settings.copyCode": "Copy code",
    "settings.copyInviteLink": "Copy invite link",
    "settings.leaveGroupBtn": "Leave group",
    "settings.leftGroup": "You left the group.",
    "settings.removeFriendSoon": "Remove",
    "settings.removeFriendSoonHint": "Coming soon — requires server sync.",
    "settings.streakSectionHint": "Tune how strictly your streak counts days and optional nudges.",
    "settings.minTasksPerDay": "Minimum tasks per day for streak",
    "settings.streakNudge": "Evening nudge if no activity yet",
    "settings.buddyCardToggle": "Show buddy streak card",
    "settings.recapSectionHint": "Control the calendar Recap button and period toggles.",
    "settings.recapWeek": "Week recap",
    "settings.recapMonth": "Month recap",
    "settings.recapAllOff": "Enable at least one recap period in Settings.",
    "settings.generalHint": "Sounds, default screen, and reset.",
    "settings.defaultStart": "Default view when opening the app",
    "settings.welcomeToggle": "Welcome message after sign-in",
    "settings.coachToggle": "Motivation banner (character)",
    "settings.resetApp": "Reset app data",
    "settings.remindersHint":
      "In-app toasts and optional browser notifications. Enable permission for system notifications where supported.",
    "settings.navAria": "Settings sections",
    "settings.soundsLabel": "Sounds for toasts",
  });

  Object.assign(T.de, {
    "nav.motivation": "Motivation",
    "nav.selfcare": "Self-Care",
    "nav.groups": "Gruppen",
    "page.motivation.title": "Motivation",
    "page.motivation.subtitle": "Streaks, Partner-Ziele und Konstanz",
    "page.selfcare.title": "Self-Care Journal",
    "page.selfcare.subtitle": "Tägliche Reflexion, Dankbarkeit und achtsame Check-ins",
    "page.groups.title": "Gruppen",
    "page.groups.subtitle": "Gruppe erstellen oder mit Code/Link beitreten",
    "selfcare.kicker": "Tagesjournal",
    "selfcare.title": "Self-Care Journal",
    "selfcare.intro": "Ein ruhiger Raum zur Reflexion. Halte fest, was heute wichtig war, und öffne Einträge jederzeit erneut.",
    "selfcare.dateLabel": "Datum",
    "selfcare.historyLabel": "Vorhandenen Eintrag öffnen",
    "selfcare.historyPlaceholder": "Noch keine gespeicherten Einträge",
    "selfcare.historyTitle": "Gespeicherte Einträge",
    "selfcare.historyHint": "Neueste zuerst. Tag auswählen zum Anzeigen oder Bearbeiten.",
    "selfcare.placeholder": "Schreibe frei...",
    "selfcare.q.grateful": "Wofür bist du heute dankbar?",
    "selfcare.q.smile": "Was hat dich heute zum Lächeln gebracht?",
    "selfcare.q.well": "Was ist heute gut gelaufen?",
    "selfcare.q.proud": "Worauf bist du heute stolz?",
    "selfcare.q.self": "Was hast du heute an dir selbst geschätzt?",
    "selfcare.q.surprise": "Was hat dich heute positiv überrascht?",
    "selfcare.statusIdle": "Noch keine Änderungen.",
    "selfcare.statusSaved": "Eintrag gespeichert.",
    "selfcare.statusDraft": "Ungespeicherte Änderungen.",
    "selfcare.statusLoaded": "Eintrag geladen.",
    "selfcare.saveBtn": "Eintrag speichern",
    "selfcare.clearBtn": "Formular leeren",
    "selfcare.loadDateBtn": "Ausgewähltes Datum öffnen",
    "selfcare.editBtn": "Diesen Eintrag bearbeiten",
    "nav.achievements": "Achievements",
    "page.achievements.title": "Achievements",
    "page.achievements.subtitle": "Meilensteine durch Konstanz freischalten",
    "ach.kicker": "Progress-Belohnungen",
    "ach.title": "Achievements",
    "ach.intro": "Schalte Abzeichen durch echte Konstanz frei: Aufgaben, Streaks, Self-Care, soziale Fortschritte und langfristige Disziplin.",
    "ach.filter.status": "Status",
    "ach.filter.category": "Kategorie",
    "ach.filter.all": "Alle",
    "ach.filter.unlocked": "Freigeschaltet",
    "ach.filter.locked": "Gesperrt",
    "ach.filter.allCategories": "Alle Kategorien",
    "ach.summary.unlocked": "{n} freigeschaltet",
    "ach.summary.total": "{n} gesamt",
    "ach.summary.progress": "{n}% abgeschlossen",
    "ach.status.unlocked": "Freigeschaltet",
    "ach.status.locked": "Gesperrt",
    "ach.achievedOn": "Erreicht am {date}",
    "ach.progress": "Fortschritt {done}/{target}",
    "ach.empty": "Keine Achievements für diesen Filter.",
    "ach.toastUnlocked": "Achievement freigeschaltet: {name}",
    "ach.category.productivity": "Produktivität",
    "ach.category.discipline": "Disziplin",
    "ach.category.streaks": "Streaks",
    "ach.category.selfcare": "Self-Care",
    "ach.category.social": "Sozial",
    "ach.category.progress": "Fortschritt",
    "ach.name.task_done_50": "Task-Finisher I",
    "ach.desc.task_done_50": "Erledige 50 Aufgaben.",
    "ach.name.task_done_100": "Task-Finisher II",
    "ach.desc.task_done_100": "Erledige 100 Aufgaben.",
    "ach.name.timed_events_10": "Punktgenau",
    "ach.desc.timed_events_10": "Markiere 10 Termine mit Uhrzeit als erledigt.",
    "ach.name.streak_7": "7-Tage-Streak",
    "ach.desc.streak_7": "Erreiche einen Streak von 7 Tagen.",
    "ach.name.streak_30": "30-Tage-Streak",
    "ach.desc.streak_30": "Erreiche einen Streak von 30 Tagen.",
    "ach.name.perfect_days_5": "Perfekter Wochenstart",
    "ach.desc.perfect_days_5": "Erreiche 5 erfolgreiche Zieltage.",
    "ach.name.perfect_days_10": "Perfekte Zehn",
    "ach.desc.perfect_days_10": "Erreiche 10 erfolgreiche Zieltage.",
    "ach.name.selfcare_first": "Erste Reflexion",
    "ach.desc.selfcare_first": "Speichere deinen ersten Self-Care-Eintrag.",
    "ach.name.selfcare_streak_3": "Achtsame Drei",
    "ach.desc.selfcare_streak_3": "Schreibe 3 Tage in Folge Journal.",
    "ach.name.selfcare_days_7": "Wochen-Reflexion",
    "ach.desc.selfcare_days_7": "Speichere Journal-Einträge an 7 verschiedenen Tagen.",
    "ach.name.group_created": "Gründer",
    "ach.desc.group_created": "Erstelle deine erste Gruppe.",
    "ach.name.group_member_2": "Erste Einladung",
    "ach.desc.group_member_2": "Erreiche mindestens 2 Mitglieder in einer deiner Gruppen.",
    "ach.name.group_rank_1": "Gruppen-Spitze",
    "ach.desc.group_rank_1": "Erreiche Platz 1 im Gruppenranking.",
    "ach.name.active_days_30": "30 aktive Tage",
    "ach.desc.active_days_30": "Sei an 30 verschiedenen Tagen aktiv.",
    "ach.name.achievements_3": "Sammler I",
    "ach.desc.achievements_3": "Schalte 3 Achievements frei.",
    "ach.name.achievements_10": "Sammler II",
    "ach.desc.achievements_10": "Schalte 10 Achievements frei.",
    "streak.title": "Dein Streak",
    "streak.subtitle": "Bleib konstant bei Aufgaben und Terminen mit Uhrzeit.",
    "streak.current": "Aktueller Streak",
    "streak.longest": "Längster Streak",
    "streak.days": "Tage",
    "streak.todayYes": "Heute: Aktivität gezählt ✓",
    "streak.todayNo": "Heute: noch nicht — Aufgabe erledigen oder Termin markieren",
    "streak.weekProgress": "Letzte 7 Tage",
    "streak.ruleHint": "Ein Tag zählt, wenn du eine Aufgabe erledigst oder einen Termin mit Uhrzeit als erledigt markierst.",
    "buddy.title": "Buddy-Streak",
    "buddy.subtitle": "Gemeinsam motiviert bleiben.",
    "buddy.partnerName": "Buddy-Name",
    "buddy.partnerPlaceholder": "Freund oder Team",
    "buddy.together": "Gemeinsam",
    "buddy.best": "Bestwert",
    "buddy.activityLabel": "Aktivität",
    "buddy.me": "Du",
    "buddy.partner": "Buddy",
    "buddy.partnerActiveToday": "Mein Buddy war heute aktiv",
    "buddy.hint": "Beide müssen am selben Tag aktiv sein, damit der Buddy-Streak wächst. Deine Aktivität kommt von erledigten Aufgaben und markierten Terminen.",
    "buddy.lastYou": "Du zuletzt aktiv",
    "buddy.lastBuddy": "Buddy zuletzt aktiv",
    "groups.createTitle": "Gruppe erstellen",
    "groups.createHint": "Erstelle eine Cloud-Gruppe und lade andere per Code oder Link ein.",
    "groups.nameLabel": "Gruppenname",
    "groups.namePlaceholder": "Lerngruppe",
    "groups.createBtn": "Gruppe erstellen",
    "groups.joinTitle": "Gruppe beitreten",
    "groups.joinHint": "Code eingeben oder Einladungslink nutzen.",
    "groups.codeLabel": "Gruppencode",
    "groups.joinPlaceholder": "ABC123",
    "groups.joinBtn": "Mit Code beitreten",
    "groups.yourGroup": "Deine Gruppe",
    "groups.noGroup": "Du bist noch in keiner Gruppe.",
    "groups.inviteLink": "Einladungslink",
    "groups.members": "Mitglieder",
    "groups.copyCode": "Kopieren",
    "groups.copyLink": "Link kopieren",
    "groups.leave": "Gruppe verlassen",
    "groups.joined": "Gruppe beigetreten",
    "groups.created": "Gruppe erstellt",
    "groups.copied": "Kopiert",
    "groups.invalidCode": "Keine Gruppe mit diesem Code.",
    "groups.createFailed": "Gruppe konnte nicht erstellt werden. Bitte erneut versuchen.",
    "settings.profile": "Profil",
    "settings.profileHint": "Wird in Gruppen und Buddy-Funktionen verwendet.",
    "settings.displayName": "Anzeigename",
    "settings.displayNamePlaceholder": "Dein Name",
    "settings.reminders": "Erinnerungen",
    "settings.remindersHint": "Benachrichtigung 30 Minuten vor Terminen mit Uhrzeit. Browser-Benachrichtigungen brauchen Erlaubnis.",
    "settings.enableNotifications": "Benachrichtigungen aktivieren",
    "settings.notifGranted": "Benachrichtigungen aktiv",
    "settings.notifDenied": "Blockiert — Erinnerungen nur in der App",
    "settings.notifDefault": "Noch nicht angefragt",
    "notif.eventBodySoon": "Startet gleich",
    "notif.tasksDueTitle": "Fällige Aufgaben heute",
    "notif.tasksDueBody": "Du hast heute {n} offene fällige Aufgabe(n).",
    "toast.reminderTitle": "Demnächst",
    "toast.reminderBody": "{title} um {time}",
    "dashboard.openMotivation": "Öffnen",
    "buddy.shortLabel": "Buddy",
    "eventModal.streakDone": "Für Streak als erledigt markieren (Termin mit Uhrzeit)",
    "eventModal.kicker": "Termin mit Uhrzeit",
    "eventModal.timeSection": "Uhrzeit",
    "eventModal.timeHint": "Startzeit ist Pflicht, außer bei „Ganztägig“. Endzeit ist optional.",
    "eventModal.endOptional": "optional",
    "eventModal.errStartRequired": "Bitte eine Startzeit wählen oder „Ganztägig“ aktivieren.",
    "eventModal.hourShort": "Std.",
    "eventModal.minShort": "Min.",
    "groups.openCreateModal": "Gruppe erstellen",
    "groups.modalTitle": "Gruppe erstellen",
    "groups.modalHint": "Wähle einen Namen. Du erhältst einen Code und einen Einladungslink.",
    "groups.createdReady": "Deine Gruppe ist bereit",
    "groups.done": "Fertig",
    "groups.nameRequired": "Bitte gib einen Gruppennamen ein.",
    "groups.shareLabel": "Teilen",
    "share.whatsapp": "WhatsApp",
    "share.facebook": "Facebook",
    "share.sms": "SMS",
    "share.instagram": "Instagram",
    "share.system": "Teilen…",
    "share.copyAll": "Code & Link kopieren",
    "share.message": "Komm in meine Flow-Gruppe „{name}“! Code: {code} — {link}",
    "share.instagramHint": "Link kopiert — in Instagram einfügen zum Teilen.",
    "settings.avatarLabel": "Profilbild",
    "settings.avatarUpload": "Foto hochladen",
    "settings.avatarPickerAria": "Vorgefertigten Avatar wählen",
    "settings.avatarChoosePreset": "Charakter wählen",
    "settings.avatarUploadShort": "Eigenes Foto",
    "settings.avatarOptionPrefix": "Charakter",
    "coach.message": "Hey! Du hast heute {tasks} offene Aufgaben und {events} Termine.",
    "settings.avatarError": "Bild konnte nicht geladen werden.",
    "profile.defaultName": "Du",
    "welcome.kicker": "Willkommen",
    "welcome.message": "Hallo {name}! Du hast heute {tasks} offene Aufgaben und {events} Termine.",
    "welcome.continue": "Los geht's",
    "calendar.recap": "Auswertung",
    "calendar.recapTitle": "Ziele-Überblick",
    "calendar.recapWeek": "Woche",
    "calendar.recapMonth": "Monat",
    "calendar.recapSuccess": "Erfolgreiche Tage",
    "calendar.recapFail": "Unvollständige Tage",
    "calendar.recapRate": "Erfolgsquote",
    "calendar.recapHint":
      "Ein Tag zählt als erfolgreich, wenn alle fälligen Aufgaben erledigt sind. Vergangene Tage mit offenen Aufgaben zählen als unvollständig. Heute nur, wenn alle fälligen Aufgaben erledigt sind.",
    "calendar.recapPersistHint": "Basierend auf deinen in diesem Browser gespeicherten Aufgaben.",
    "groups.rankingTitle": "Monats-Ranking",
    "groups.rankingHint":
      "Punkte gelten für den laufenden Monat auf diesem Gerät: erledigte Aufgaben (+5), Termine mit Uhrzeit als Streak erledigt (+3), erfolgreiche Kalendertage (+10). Andere Mitglieder zeigen 0, bis sie Flow auf ihrem Gerät nutzen.",
    "groups.rankingYou": "Du: Platz {rank} · {pts} Pkt. (−{gap} Pkt. zur Spitze)",
    "groups.rankingYouLead": "Du führst diesen Monat mit {pts} Pkt. auf diesem Gerät.",
    "groups.rankingBehind": "−{n} Pkt. zur Spitze",
    "groups.rankingPtsShort": "Pkt.",
    "streak.ruleHintMin":
      "Ein Tag zählt für den Streak, wenn du an diesem Tag mindestens {n} Aufgaben erledigst oder einen Termin mit Uhrzeit als Streak erledigt markierst.",
    "settings.nav.account": "Konto",
    "settings.nav.notifications": "Benachrichtigungen",
    "settings.nav.language": "Sprache & Region",
    "settings.nav.appearance": "Erscheinungsbild",
    "settings.nav.privacy": "Datenschutz & Sicherheit",
    "settings.nav.groups": "Gruppen",
    "settings.nav.streak": "Ziele & Streak",
    "settings.nav.recap": "Statistik",
    "settings.nav.general": "Allgemein",
    "settings.accountProfileHint": "Anmeldung, Profilbild und Anzeigename.",
    "settings.changePassword": "Passwort ändern",
    "settings.passwordSoon": "Passwort ändern ist verfügbar, sobald ein Server angebunden ist.",
    "settings.masterNotifications": "Alle Benachrichtigungen & Erinnerungen",
    "settings.remindEvents": "Termin-Erinnerungen",
    "settings.remindTasks": "Erinnerung an fällige Aufgaben (heute)",
    "settings.reminderLead": "Erinnerung vor Terminen",
    "settings.reminderLeadHint": "Wie lange vor Beginn eines Termins mit Uhrzeit.",
    "settings.dailyOpenTasks": "Tägliche Erinnerung bei offenen Aufgaben",
    "settings.dailyOpenTasksHint": "Zur gewählten Uhrzeit einen Hinweis, falls noch offene Aufgaben bestehen.",
    "settings.dailyTime": "Uhrzeit",
    "settings.taskDueTodayToast": "Du hast heute {n} fällige Aufgabe(n).",
    "settings.dailyOpenTasksToast": "Du hast {n} offene Aufgabe(n).",
    "settings.streakNudgeToast": "Heute noch keine Aktivität — halte deinen Streak!",
    "settings.timeFormat": "Zeitformat",
    "settings.time24": "24 Stunden",
    "settings.time12": "12 Stunden (AM/PM)",
    "settings.dateStyle": "Datumsdarstellung",
    "settings.dateLocale": "Standard (Locale)",
    "settings.dateIso": "ISO (JJJJ-MM-TT)",
    "settings.dateDmy": "TT.MM.JJJJ",
    "settings.theme": "Design",
    "settings.themeLight": "Hell",
    "settings.themeDark": "Dunkel",
    "settings.themeSystem": "System",
    "settings.accent": "Akzentfarbe",
    "settings.accentDefault": "Standard",
    "settings.accentOcean": "Ozean",
    "settings.accentRose": "Rose",
    "settings.accentMint": "Mint",
    "settings.accentAmber": "Bernstein",
    "settings.animations": "Oberflächen-Animationen",
    "settings.reduceMotion": "Weniger Bewegung",
    "settings.privacyTitle": "Datenschutz & Sicherheit",
    "settings.privacyIntro":
      "Aufgaben, Termine, Gruppen, Self-Care, Fokus-Historie, Erfolge, Buddy und Punkte werden sicher über Supabase synchronisiert. Theme, Sprache und App-Einstellungen bleiben lokal auf dem Gerät.",
    "settings.securityHint": "Nutze ein starkes Passwort und sperre dein Gerät. Für den Live-Betrieb eine echte Auth-API anbinden.",
    "settings.clearData": "App-Daten auf diesem Gerät löschen",
    "settings.clearDataHint":
      "Löscht in Supabase deine Aufgaben, Termine, Self-Care-Einträge, Fokus-Sessions, Erfolge, Buddy-Zustand und Punkte-Log für dieses Konto. Theme, Sprache und App-Einstellungen bleiben erhalten.",
    "settings.clearDataConfirm":
      "Alle Flow-Daten in der Cloud (Aufgaben, Termine, Journal, Fokus, Erfolge, Buddy, Punkte) für dieses Konto löschen? Die Anmeldung bleibt aktiv.",
    "settings.clearDataDone": "Deine Cloud-Daten wurden gelöscht.",
    "settings.clearDataNeedAuth": "Bitte melde dich an, um Cloud-Daten zu löschen.",
    "settings.openCookies": "Cookie-Einstellungen",
    "settings.groupsIntro": "Deine aktive Gruppe. Einladungen hier oder unter Gruppen verwalten.",
    "settings.manageInGroups": "Zur Gruppen-Ansicht",
    "settings.copyCode": "Code kopieren",
    "settings.copyInviteLink": "Einladungslink kopieren",
    "settings.leaveGroupBtn": "Gruppe verlassen",
    "settings.leftGroup": "Du hast die Gruppe verlassen.",
    "settings.removeFriendSoon": "Entfernen",
    "settings.removeFriendSoonHint": "Demnächst — braucht Server-Sync.",
    "settings.streakSectionHint": "Strengere Streak-Regeln und optionale Erinnerungen.",
    "settings.minTasksPerDay": "Mindestaufgaben pro Tag für den Streak",
    "settings.streakNudge": "Abend-Hinweis ohne Tagesaktivität",
    "settings.buddyCardToggle": "Buddy-Streak-Karte anzeigen",
    "settings.recapSectionHint": "Kalender-„Auswertung“-Button und Zeiträume.",
    "settings.recapWeek": "Wochen-Recap",
    "settings.recapMonth": "Monats-Recap",
    "settings.recapAllOff": "Bitte mindestens eine Recap-Option in den Einstellungen aktivieren.",
    "settings.generalHint": "Töne, Startansicht und Zurücksetzen.",
    "settings.defaultStart": "Standardansicht beim Öffnen",
    "settings.welcomeToggle": "Willkommensnachricht nach Anmeldung",
    "settings.coachToggle": "Motivations-Banner (Charakter)",
    "settings.resetApp": "App-Daten zurücksetzen",
    "settings.remindersHint":
      "Hinweise in der App und optionale Browser-Benachrichtigungen. System-Benachrichtigungen erfordern die Browser-Erlaubnis.",
    "settings.navAria": "Einstellungsbereiche",
    "settings.soundsLabel": "Töne bei Hinweisen",
  });

  Object.assign(T.es, {
    "nav.achievements": "Logros",
    "page.achievements.title": "Logros",
    "page.achievements.subtitle": "Desbloquea hitos con constancia",
    "ach.kicker": "Recompensas de progreso",
    "ach.title": "Logros",
    "ach.intro": "Desbloquea insignias con constancia real: tareas, rachas, autocuidado, progreso social y disciplina.",
    "ach.filter.status": "Estado",
    "ach.filter.category": "Categoría",
    "ach.filter.all": "Todos",
    "ach.filter.unlocked": "Desbloqueados",
    "ach.filter.locked": "Bloqueados",
    "ach.filter.allCategories": "Todas las categorías",
    "ach.summary.unlocked": "{n} desbloqueados",
    "ach.summary.total": "{n} en total",
    "ach.summary.progress": "{n}% completado",
    "ach.status.unlocked": "Desbloqueado",
    "ach.status.locked": "Bloqueado",
    "ach.achievedOn": "Conseguido el {date}",
    "ach.progress": "Progreso {done}/{target}",
    "ach.empty": "No hay logros para este filtro.",
    "ach.toastUnlocked": "Logro desbloqueado: {name}",
    "ach.category.productivity": "Productividad",
    "ach.category.discipline": "Disciplina",
    "ach.category.streaks": "Rachas",
    "ach.category.selfcare": "Autocuidado",
    "ach.category.social": "Social",
    "ach.category.progress": "Progreso",
    "ach.name.task_done_50": "Finalizador de tareas I",
    "ach.desc.task_done_50": "Completa 50 tareas.",
    "ach.name.task_done_100": "Finalizador de tareas II",
    "ach.desc.task_done_100": "Completa 100 tareas.",
    "ach.name.timed_events_10": "A tiempo",
    "ach.desc.timed_events_10": "Marca 10 eventos con hora como completados.",
    "ach.name.streak_7": "Racha de 7 días",
    "ach.desc.streak_7": "Alcanza una racha de 7 días.",
    "ach.name.streak_30": "Racha de 30 días",
    "ach.desc.streak_30": "Alcanza una racha de 30 días.",
    "ach.name.perfect_days_5": "Inicio perfecto",
    "ach.desc.perfect_days_5": "Logra 5 días objetivo exitosos.",
    "ach.name.perfect_days_10": "Diez perfectos",
    "ach.desc.perfect_days_10": "Logra 10 días objetivo exitosos.",
    "ach.name.selfcare_first": "Primera reflexión",
    "ach.desc.selfcare_first": "Guarda tu primera entrada de autocuidado.",
    "ach.name.selfcare_streak_3": "Trío consciente",
    "ach.desc.selfcare_streak_3": "Escribe 3 días seguidos en el journal.",
    "ach.name.selfcare_days_7": "Reflexión semanal",
    "ach.desc.selfcare_days_7": "Guarda entradas en 7 días diferentes.",
    "ach.name.group_created": "Fundador",
    "ach.desc.group_created": "Crea tu primer grupo.",
    "ach.name.group_member_2": "Primera invitación",
    "ach.desc.group_member_2": "Llega a 2 miembros en uno de tus grupos.",
    "ach.name.group_rank_1": "Top del grupo",
    "ach.desc.group_rank_1": "Alcanza el puesto #1 del ranking del grupo.",
    "ach.name.active_days_30": "30 días activos",
    "ach.desc.active_days_30": "Sé activo en 30 días diferentes.",
    "ach.name.achievements_3": "Coleccionista I",
    "ach.desc.achievements_3": "Desbloquea 3 logros.",
    "ach.name.achievements_10": "Coleccionista II",
    "ach.desc.achievements_10": "Desbloquea 10 logros.",
  });

  Object.assign(T.it, {
    "nav.achievements": "Obiettivi",
    "page.achievements.title": "Obiettivi",
    "page.achievements.subtitle": "Sblocca traguardi con costanza",
    "ach.kicker": "Ricompense progresso",
    "ach.title": "Obiettivi",
    "ach.intro": "Sblocca badge con costanza reale: attività, streak, self-care, progresso sociale e disciplina.",
    "ach.filter.status": "Stato",
    "ach.filter.category": "Categoria",
    "ach.filter.all": "Tutti",
    "ach.filter.unlocked": "Sbloccati",
    "ach.filter.locked": "Bloccati",
    "ach.filter.allCategories": "Tutte le categorie",
    "ach.summary.unlocked": "{n} sbloccati",
    "ach.summary.total": "{n} totali",
    "ach.summary.progress": "{n}% completato",
    "ach.status.unlocked": "Sbloccato",
    "ach.status.locked": "Bloccato",
    "ach.achievedOn": "Raggiunto il {date}",
    "ach.progress": "Progresso {done}/{target}",
    "ach.empty": "Nessun obiettivo per questo filtro.",
    "ach.toastUnlocked": "Obiettivo sbloccato: {name}",
    "ach.category.productivity": "Produttività",
    "ach.category.discipline": "Disciplina",
    "ach.category.streaks": "Streak",
    "ach.category.selfcare": "Self-Care",
    "ach.category.social": "Sociale",
    "ach.category.progress": "Progresso",
    "ach.name.task_done_50": "Completatore attività I",
    "ach.desc.task_done_50": "Completa 50 attività.",
    "ach.name.task_done_100": "Completatore attività II",
    "ach.desc.task_done_100": "Completa 100 attività.",
    "ach.name.timed_events_10": "Puntuale",
    "ach.desc.timed_events_10": "Segna come completati 10 eventi con orario.",
    "ach.name.streak_7": "Streak di 7 giorni",
    "ach.desc.streak_7": "Raggiungi una streak di 7 giorni.",
    "ach.name.streak_30": "Streak di 30 giorni",
    "ach.desc.streak_30": "Raggiungi una streak di 30 giorni.",
    "ach.name.perfect_days_5": "Inizio perfetto",
    "ach.desc.perfect_days_5": "Raggiungi 5 giorni-obiettivo riusciti.",
    "ach.name.perfect_days_10": "Dieci perfetti",
    "ach.desc.perfect_days_10": "Raggiungi 10 giorni-obiettivo riusciti.",
    "ach.name.selfcare_first": "Prima riflessione",
    "ach.desc.selfcare_first": "Salva la tua prima voce self-care.",
    "ach.name.selfcare_streak_3": "Tris consapevole",
    "ach.desc.selfcare_streak_3": "Scrivi il journal per 3 giorni consecutivi.",
    "ach.name.selfcare_days_7": "Riflessione settimanale",
    "ach.desc.selfcare_days_7": "Salva voci in 7 giorni diversi.",
    "ach.name.group_created": "Fondatore",
    "ach.desc.group_created": "Crea il tuo primo gruppo.",
    "ach.name.group_member_2": "Primo invito",
    "ach.desc.group_member_2": "Arriva ad almeno 2 membri in un tuo gruppo.",
    "ach.name.group_rank_1": "Primo in classifica",
    "ach.desc.group_rank_1": "Raggiungi la posizione #1 nel ranking del gruppo.",
    "ach.name.active_days_30": "30 giorni attivi",
    "ach.desc.active_days_30": "Sii attivo in 30 giorni diversi.",
    "ach.name.achievements_3": "Collezionista I",
    "ach.desc.achievements_3": "Sblocca 3 obiettivi.",
    "ach.name.achievements_10": "Collezionista II",
    "ach.desc.achievements_10": "Sblocca 10 obiettivi.",
  });

  Object.assign(T.tr, {
    "nav.achievements": "Başarılar",
    "page.achievements.title": "Başarılar",
    "page.achievements.subtitle": "İstikrarla kilometre taşlarını aç",
    "ach.kicker": "İlerleme ödülleri",
    "ach.title": "Başarılar",
    "ach.intro": "Gerçek istikrarla rozet aç: görevler, seriler, öz bakım, sosyal ilerleme ve disiplin.",
    "ach.filter.status": "Durum",
    "ach.filter.category": "Kategori",
    "ach.filter.all": "Tümü",
    "ach.filter.unlocked": "Açık",
    "ach.filter.locked": "Kilitli",
    "ach.filter.allCategories": "Tüm kategoriler",
    "ach.summary.unlocked": "{n} açıldı",
    "ach.summary.total": "{n} toplam",
    "ach.summary.progress": "%{n} tamamlandı",
    "ach.status.unlocked": "Açık",
    "ach.status.locked": "Kilitli",
    "ach.achievedOn": "Tarih: {date}",
    "ach.progress": "İlerleme {done}/{target}",
    "ach.empty": "Bu filtre için başarı yok.",
    "ach.toastUnlocked": "Başarı açıldı: {name}",
    "ach.category.productivity": "Üretkenlik",
    "ach.category.discipline": "Disiplin",
    "ach.category.streaks": "Seriler",
    "ach.category.selfcare": "Öz Bakım",
    "ach.category.social": "Sosyal",
    "ach.category.progress": "İlerleme",
    "ach.name.task_done_50": "Görev Ustası I",
    "ach.desc.task_done_50": "50 görev tamamla.",
    "ach.name.task_done_100": "Görev Ustası II",
    "ach.desc.task_done_100": "100 görev tamamla.",
    "ach.name.timed_events_10": "Tam Zamanında",
    "ach.desc.timed_events_10": "Zamanlı 10 etkinliği tamamlandı olarak işaretle.",
    "ach.name.streak_7": "7 Gün Seri",
    "ach.desc.streak_7": "7 günlük seri yakala.",
    "ach.name.streak_30": "30 Gün Seri",
    "ach.desc.streak_30": "30 günlük seri yakala.",
    "ach.name.perfect_days_5": "Mükemmel Başlangıç",
    "ach.desc.perfect_days_5": "5 başarılı hedef günü elde et.",
    "ach.name.perfect_days_10": "Mükemmel Onlu",
    "ach.desc.perfect_days_10": "10 başarılı hedef günü elde et.",
    "ach.name.selfcare_first": "İlk Yansıma",
    "ach.desc.selfcare_first": "İlk öz bakım günlüğünü kaydet.",
    "ach.name.selfcare_streak_3": "Farkındalık Üçlüsü",
    "ach.desc.selfcare_streak_3": "3 gün üst üste günlük yaz.",
    "ach.name.selfcare_days_7": "Haftalık Yansıma",
    "ach.desc.selfcare_days_7": "7 farklı günde günlük kaydet.",
    "ach.name.group_created": "Kurucu",
    "ach.desc.group_created": "İlk grubunu oluştur.",
    "ach.name.group_member_2": "İlk Davet",
    "ach.desc.group_member_2": "Gruplarından birinde en az 2 üyeye ulaş.",
    "ach.name.group_rank_1": "Grup Lideri",
    "ach.desc.group_rank_1": "Grup sıralamasında 1. sıraya çık.",
    "ach.name.active_days_30": "30 Aktif Gün",
    "ach.desc.active_days_30": "30 farklı günde aktif ol.",
    "ach.name.achievements_3": "Koleksiyoncu I",
    "ach.desc.achievements_3": "3 başarı aç.",
    "ach.name.achievements_10": "Koleksiyoncu II",
    "ach.desc.achievements_10": "10 başarı aç.",
  });

  Object.assign(T.ar, {
    "nav.achievements": "الإنجازات",
    "page.achievements.title": "الإنجازات",
    "page.achievements.subtitle": "افتح مراحل التقدم بالاستمرارية",
    "ach.kicker": "مكافآت التقدم",
    "ach.title": "الإنجازات",
    "ach.intro": "افتح الأوسمة عبر الاستمرارية الحقيقية: المهام والسلاسل والعناية الذاتية والتقدم الاجتماعي والانضباط.",
    "ach.filter.status": "الحالة",
    "ach.filter.category": "الفئة",
    "ach.filter.all": "الكل",
    "ach.filter.unlocked": "مفتوح",
    "ach.filter.locked": "مقفل",
    "ach.filter.allCategories": "كل الفئات",
    "ach.summary.unlocked": "{n} مفتوح",
    "ach.summary.total": "{n} إجمالي",
    "ach.summary.progress": "{n}% مكتمل",
    "ach.status.unlocked": "مفتوح",
    "ach.status.locked": "مقفل",
    "ach.achievedOn": "تم الإنجاز في {date}",
    "ach.progress": "التقدم {done}/{target}",
    "ach.empty": "لا توجد إنجازات لهذا الفلتر.",
    "ach.toastUnlocked": "تم فتح إنجاز: {name}",
    "ach.category.productivity": "الإنتاجية",
    "ach.category.discipline": "الانضباط",
    "ach.category.streaks": "السلاسل",
    "ach.category.selfcare": "العناية الذاتية",
    "ach.category.social": "اجتماعي",
    "ach.category.progress": "التقدم",
    "ach.name.task_done_50": "منجز المهام I",
    "ach.desc.task_done_50": "أكمل 50 مهمة.",
    "ach.name.task_done_100": "منجز المهام II",
    "ach.desc.task_done_100": "أكمل 100 مهمة.",
    "ach.name.timed_events_10": "في الموعد",
    "ach.desc.timed_events_10": "ضع علامة الإكمال على 10 مواعيد زمنية.",
    "ach.name.streak_7": "سلسلة 7 أيام",
    "ach.desc.streak_7": "حقق سلسلة لمدة 7 أيام.",
    "ach.name.streak_30": "سلسلة 30 يومًا",
    "ach.desc.streak_30": "حقق سلسلة لمدة 30 يومًا.",
    "ach.name.perfect_days_5": "بداية مثالية",
    "ach.desc.perfect_days_5": "حقق 5 أيام أهداف ناجحة.",
    "ach.name.perfect_days_10": "عشرة مثالية",
    "ach.desc.perfect_days_10": "حقق 10 أيام أهداف ناجحة.",
    "ach.name.selfcare_first": "أول انعكاس",
    "ach.desc.selfcare_first": "احفظ أول إدخال عناية ذاتية.",
    "ach.name.selfcare_streak_3": "ثلاثية الوعي",
    "ach.desc.selfcare_streak_3": "اكتب في اليوميات 3 أيام متتالية.",
    "ach.name.selfcare_days_7": "تأمل أسبوعي",
    "ach.desc.selfcare_days_7": "احفظ يوميات في 7 أيام مختلفة.",
    "ach.name.group_created": "المؤسس",
    "ach.desc.group_created": "أنشئ مجموعتك الأولى.",
    "ach.name.group_member_2": "أول دعوة",
    "ach.desc.group_member_2": "اجعل إحدى مجموعاتك تحتوي على عضوين على الأقل.",
    "ach.name.group_rank_1": "الأول في المجموعة",
    "ach.desc.group_rank_1": "احصل على المركز الأول في ترتيب المجموعة.",
    "ach.name.active_days_30": "30 يومًا نشطًا",
    "ach.desc.active_days_30": "كن نشطًا في 30 يومًا مختلفًا.",
    "ach.name.achievements_3": "جامع I",
    "ach.desc.achievements_3": "افتح 3 إنجازات.",
    "ach.name.achievements_10": "جامع II",
    "ach.desc.achievements_10": "افتح 10 إنجازات.",
  });

  Object.assign(T.en, {
    "nav.focus": "Focus",
    "page.focus.title": "Focus Mode",
    "page.focus.subtitle": "Deep work with one task and a premium timer",
    "focus.kicker": "Deep Focus",
    "focus.title": "Focus Mode",
    "focus.intro": "Work deeply on one task, reduce noise, and finish intentional sessions.",
    "focus.taskLabel": "Task to focus on",
    "focus.durationLabel": "Duration (minutes)",
    "focus.flightTitle": "Flight Focus Planner",
    "focus.searchStart": "Search start city",
    "focus.searchEnd": "Search destination city",
    "focus.searchPlaceholder": "Type city name...",
    "focus.noCityMatch": "No city match",
    "focus.startCity": "Start",
    "focus.endCity": "Destination",
    "focus.flightHint": "Route: {from} to {to}. During focus, your flight progresses with your timer.",
    "focus.routeClassic": "Flight progress linked to your focus session",
    "focus.currentTask": "Current focus task",
    "focus.start": "Start",
    "focus.pause": "Pause",
    "focus.resume": "Resume",
    "focus.end": "End",
    "focus.fullscreen": "Fullscreen",
    "focus.reduceTitle": "Reduce distractions",
    "focus.reduceHint": "Web apps cannot block other system apps directly. Use this list as your intentional lock-in checklist.",
    "focus.extensionHint": "Future-ready: this setup can be connected to a browser extension for real website blocking.",
    "focus.logTitle": "Recent focus sessions",
    "focus.logEmpty": "No sessions yet.",
    "focus.needTask": "Choose one open task before starting focus mode.",
    "focus.noOpenTasks": "No open tasks available",
    "focus.noTaskSelected": "No task selected",
    "focus.noTaskNotes": "No additional notes for this task.",
    "focus.guidance.one": "Now only this one task. Give it your full attention for the next {m} minutes.",
    "focus.guidance.two": "Deep focus activated: protect this block and finish one meaningful step.",
    "focus.guidance.three": "You are in deep focus. Ignore noise, stay with the current task.",
    "focus.almostDone": "One minute left. Finish strong.",
    "focus.completedTitle": "Focus session complete",
    "focus.completedBody": "Great work on: {task}",
    "focus.completedToast": "Focus session finished: {task}",
    "focus.breakKicker": "Recovery break",
    "focus.breakHint": "Stand up, breathe, and reset your attention.",
    "focus.breakStart": "Start break",
    "focus.breakSkip": "Skip",
  });

  Object.assign(T.de, {
    "nav.focus": "Fokus",
    "page.focus.title": "Fokus-Modus",
    "page.focus.subtitle": "Deep Work mit einer Aufgabe und Premium-Timer",
    "focus.kicker": "Deep Focus",
    "focus.title": "Fokus-Modus",
    "focus.intro": "Arbeite tief an einer Aufgabe, reduziere Ablenkung und beende bewusste Sessions.",
    "focus.taskLabel": "Aufgabe für den Fokus",
    "focus.durationLabel": "Dauer (Minuten)",
    "focus.flightTitle": "Flight-Fokus-Planer",
    "focus.searchStart": "Startstadt suchen",
    "focus.searchEnd": "Zielstadt suchen",
    "focus.searchPlaceholder": "Stadtname eingeben...",
    "focus.noCityMatch": "Keine passende Stadt",
    "focus.startCity": "Start",
    "focus.endCity": "Ziel",
    "focus.flightHint": "Route: {from} nach {to}. Während der Session fliegt dein Flugzeug mit dem Timer-Fortschritt.",
    "focus.routeClassic": "Flugfortschritt synchron zur Fokus-Session",
    "focus.currentTask": "Aktuelle Fokus-Aufgabe",
    "focus.start": "Start",
    "focus.pause": "Pause",
    "focus.resume": "Fortsetzen",
    "focus.end": "Beenden",
    "focus.fullscreen": "Vollbild",
    "focus.reduceTitle": "Ablenkung reduzieren",
    "focus.reduceHint": "Web-Apps können andere System-Apps nicht direkt blockieren. Nutze diese Liste als bewusste Lock-in-Checkliste.",
    "focus.extensionHint": "Zukunftsfähig: Diese Struktur kann mit einer Browser-Extension für echtes Website-Blocking verbunden werden.",
    "focus.logTitle": "Letzte Fokus-Sessions",
    "focus.logEmpty": "Noch keine Sessions.",
    "focus.needTask": "Wähle zuerst eine offene Aufgabe.",
    "focus.noOpenTasks": "Keine offenen Aufgaben vorhanden",
    "focus.noTaskSelected": "Keine Aufgabe ausgewählt",
    "focus.noTaskNotes": "Keine zusätzlichen Notizen für diese Aufgabe.",
    "focus.guidance.one": "Jetzt nur diese eine Aufgabe. Gib ihr die nächsten {m} Minuten deine volle Aufmerksamkeit.",
    "focus.guidance.two": "Deep Focus aktiv: Schütze diesen Block und erledige einen wichtigen Schritt.",
    "focus.guidance.three": "Du bist gerade im Deep Focus. Blende alles andere aus.",
    "focus.almostDone": "Noch eine Minute. Stark bleiben.",
    "focus.completedTitle": "Fokus-Session abgeschlossen",
    "focus.completedBody": "Starke Arbeit an: {task}",
    "focus.completedToast": "Fokus-Session beendet: {task}",
    "focus.breakKicker": "Erholungspause",
    "focus.breakHint": "Kurz aufstehen, atmen, Fokus resetten.",
    "focus.breakStart": "Pause starten",
    "focus.breakSkip": "Überspringen",
  });

  Object.assign(T.es, {
    "nav.focus": "Enfoque",
    "page.focus.title": "Modo Enfoque",
    "page.focus.subtitle": "Trabajo profundo con una sola tarea",
    "focus.flightTitle": "Planificador de vuelo",
    "focus.startCity": "Origen",
    "focus.endCity": "Destino",
    "focus.flightHint": "Ruta: {from} a {to}. Durante el enfoque, el vuelo avanza con tu temporizador.",
    "focus.routeClassic": "Progreso del vuelo sincronizado con la sesión",
    "focus.start": "Iniciar",
    "focus.pause": "Pausar",
    "focus.resume": "Continuar",
    "focus.end": "Finalizar",
    "focus.fullscreen": "Pantalla completa",
    "focus.breakKicker": "Pausa",
    "focus.breakHint": "Levántate, respira y reinicia tu atención.",
    "focus.breakStart": "Iniciar pausa",
    "focus.breakSkip": "Saltar",
  });
  Object.assign(T.it, {
    "nav.focus": "Focus",
    "page.focus.title": "Modalità Focus",
    "page.focus.subtitle": "Deep work su una sola attività",
    "focus.flightTitle": "Pianificatore volo",
    "focus.startCity": "Partenza",
    "focus.endCity": "Destinazione",
    "focus.flightHint": "Rotta: da {from} a {to}. Durante il focus il volo avanza con il timer.",
    "focus.routeClassic": "Progresso volo sincronizzato con la sessione",
    "focus.start": "Avvia",
    "focus.pause": "Pausa",
    "focus.resume": "Riprendi",
    "focus.end": "Termina",
    "focus.fullscreen": "Schermo intero",
    "focus.breakKicker": "Pausa",
    "focus.breakHint": "Alzati, respira e resetta l’attenzione.",
    "focus.breakStart": "Avvia pausa",
    "focus.breakSkip": "Salta",
  });
  Object.assign(T.tr, {
    "nav.focus": "Odak",
    "page.focus.title": "Odak Modu",
    "page.focus.subtitle": "Tek görevle derin çalışma",
    "focus.flightTitle": "Ucus odak planlayici",
    "focus.startCity": "Baslangic",
    "focus.endCity": "Varis",
    "focus.flightHint": "Rota: {from} -> {to}. Odak sirasinda ucus zamanlayiciyla ilerler.",
    "focus.routeClassic": "Ucus ilerlemesi odak oturumuyla senkron",
    "focus.start": "Başlat",
    "focus.pause": "Duraklat",
    "focus.resume": "Devam",
    "focus.end": "Bitir",
    "focus.fullscreen": "Tam ekran",
    "focus.breakKicker": "Mola",
    "focus.breakHint": "Kalk, nefes al ve odağını tazele.",
    "focus.breakStart": "Molayı başlat",
    "focus.breakSkip": "Atla",
  });
  Object.assign(T.ar, {
    "nav.focus": "التركيز",
    "page.focus.title": "وضع التركيز",
    "page.focus.subtitle": "عمل عميق على مهمة واحدة",
    "focus.flightTitle": "مخطط رحلة التركيز",
    "focus.startCity": "الانطلاق",
    "focus.endCity": "الوجهة",
    "focus.flightHint": "المسار: {from} إلى {to}. أثناء الجلسة تتقدم الرحلة مع المؤقت.",
    "focus.routeClassic": "تقدم الرحلة متزامن مع جلسة التركيز",
    "focus.start": "ابدأ",
    "focus.pause": "إيقاف مؤقت",
    "focus.resume": "متابعة",
    "focus.end": "إنهاء",
    "focus.fullscreen": "ملء الشاشة",
    "focus.breakKicker": "استراحة",
    "focus.breakHint": "قف قليلاً، تنفّس، وأعد ضبط تركيزك.",
    "focus.breakStart": "ابدأ الاستراحة",
    "focus.breakSkip": "تخطي",
  });

  Object.assign(T.en, {
    "auth.subtitle": "Sign in to sync tasks & calendar",
    "auth.secureNote": "Your connection uses HTTPS in production. Passwords are hashed (SHA-256) before storage on this device.",
    "auth.google": "Continue with Google",
    "auth.apple": "Continue with Apple",
    "auth.orEmail": "or with email",
    "auth.emailSignIn": "Sign in with email",
    "auth.register": "Create account",
    "auth.returningQ": "Already registered?",
    "auth.signInShort": "Sign in",
    "auth.loginTitle": "Sign in",
    "auth.email": "Email",
    "auth.emailPlaceholder": "you@example.com",
    "auth.password": "Password",
    "auth.showPassword": "Show",
    "auth.hidePassword": "Hide",
    "auth.signIn": "Sign in",
    "auth.back": "Back",
    "auth.registerTitle": "Create account",
    "auth.passwordRules": "At least 8 characters, including letters and numbers.",
    "auth.fullName": "Full name",
    "auth.fullNamePlaceholder": "Your name",
    "auth.username": "Username",
    "auth.optional": "optional",
    "auth.usernamePlaceholder": "flow_user",
    "auth.passwordConfirm": "Confirm password",
    "auth.createAccount": "Create account",
    "auth.legalAgree": "By continuing you agree to our",
    "auth.terms": "Terms",
    "auth.and": "and",
    "auth.privacy": "Privacy",
    "auth.oauthDevHint": "Google & Apple: set AUTH_CONFIG.googleClientId / appleClientId in script.js for production OAuth.",
    "auth.errInvalidEmail": "Please enter a valid email address.",
    "auth.errWrongPassword": "Incorrect email or password.",
    "auth.errEmailTaken": "This email is already registered.",
    "auth.errPasswordMatch": "Passwords do not match.",
    "auth.errPasswordWeak": "Password must be at least 8 characters with letters and numbers.",
    "auth.configureOAuth": "Configure OAuth client IDs in AUTH_CONFIG to enable.",
    "cookie.title": "Cookies & privacy",
    "cookie.description": "We use necessary cookies for the app to work. Optional analytics and marketing cookies are only used with your consent.",
    "cookie.acceptAll": "Accept all",
    "cookie.necessaryOnly": "Necessary only",
    "cookie.settings": "Settings",
    "cookie.settingsTitle": "Cookie preferences",
    "cookie.settingsIntro": "Necessary cookies are always active. You can opt in to optional categories below.",
    "cookie.catNecessary": "Necessary",
    "cookie.catNecessaryDesc": "Session, language, theme, and app preferences. Required.",
    "cookie.alwaysOn": "Always on",
    "cookie.catAnalytics": "Analytics",
    "cookie.catAnalyticsDesc": "Anonymous usage statistics to improve Flow.",
    "cookie.catMarketing": "Marketing",
    "cookie.catMarketingDesc": "Personalized offers (only when you opt in).",
    "cookie.savePrefs": "Save preferences",
    "cookie.openSettings": "Cookie preferences",
    "account.title": "Account",
    "account.signedInHint": "Signed in. Your productivity data is synced securely via Supabase.",
    "account.logout": "Log out",
    "account.deleteAccount": "Delete account…",
    "account.deleteConfirm": "Delete your account and sign-in data on this device? Cloud data remains until you use “Clear app data” while signed in.",
    "account.deleted": "Account removed from this device.",
    "account.loggedOut": "Logged out",
    "account.welcome": "Welcome back",
    "legal.privacyTitle": "Privacy policy",
    "legal.termsTitle": "Terms of use",
    "legal.privacyBody":
      "<h3>Data we process</h3><p>Flow syncs tasks, events, groups, self-care, focus sessions, achievements, buddy state, and gamification points through Supabase. Theme, language, and UI preferences may be stored locally in your browser.</p><h3>Your rights</h3><p>You can delete cloud data in Settings while signed in, or remove your account from this device.</p>",
    "legal.termsBody": "<h3>Use of Flow</h3><p>Flow is provided as-is for personal productivity. Do not use it for unlawful purposes.</p><h3>Accounts</h3><p>You are responsible for your credentials. In production, connect a backend for recovery and security.</p>",
  });

  Object.assign(T.de, {
    "auth.subtitle": "Anmelden für Aufgaben & Kalender",
    "auth.secureNote": "In Produktion mit HTTPS. Passwörter werden als Hash (SHA-256) gespeichert.",
    "auth.google": "Mit Google fortfahren",
    "auth.apple": "Mit Apple fortfahren",
    "auth.orEmail": "oder mit E-Mail",
    "auth.emailSignIn": "Mit E-Mail anmelden",
    "auth.register": "Konto erstellen",
    "auth.returningQ": "Schon registriert?",
    "auth.signInShort": "Anmelden",
    "auth.loginTitle": "Anmelden",
    "auth.email": "E-Mail",
    "auth.emailPlaceholder": "du@beispiel.de",
    "auth.password": "Passwort",
    "auth.showPassword": "Anzeigen",
    "auth.hidePassword": "Ausblenden",
    "auth.signIn": "Anmelden",
    "auth.back": "Zurück",
    "auth.registerTitle": "Konto erstellen",
    "auth.passwordRules": "Mind. 8 Zeichen, Buchstaben und Zahlen.",
    "auth.fullName": "Name",
    "auth.fullNamePlaceholder": "Dein Name",
    "auth.username": "Benutzername",
    "auth.optional": "optional",
    "auth.usernamePlaceholder": "flow_user",
    "auth.passwordConfirm": "Passwort bestätigen",
    "auth.createAccount": "Konto erstellen",
    "auth.legalAgree": "Mit Fortfahren akzeptierst du unsere",
    "auth.terms": "Nutzungsbedingungen",
    "auth.and": "und",
    "auth.privacy": "Datenschutzerklärung",
    "auth.oauthDevHint": "Google & Apple: setze AUTH_CONFIG in script.js für echtes OAuth.",
    "auth.errInvalidEmail": "Bitte eine gültige E-Mail eingeben.",
    "auth.errWrongPassword": "E-Mail oder Passwort falsch.",
    "auth.errEmailTaken": "Diese E-Mail ist bereits registriert.",
    "auth.errPasswordMatch": "Passwörter stimmen nicht überein.",
    "auth.errPasswordWeak": "Passwort: mind. 8 Zeichen, Buchstaben und Zahlen.",
    "auth.configureOAuth": "OAuth-Client-IDs in AUTH_CONFIG hinterlegen.",
    "cookie.title": "Cookies & Datenschutz",
    "cookie.description": "Notwendige Cookies für den Betrieb. Analyse-/Marketing-Cookies nur mit Einwilligung.",
    "cookie.acceptAll": "Alle akzeptieren",
    "cookie.necessaryOnly": "Nur notwendige",
    "cookie.settings": "Einstellungen",
    "cookie.settingsTitle": "Cookie-Einstellungen",
    "cookie.settingsIntro": "Notwendige Cookies sind immer aktiv. Weitere Kategorien optional.",
    "cookie.catNecessary": "Notwendig",
    "cookie.catNecessaryDesc": "Sitzung, Sprache, Theme und App-Einstellungen. Erforderlich.",
    "cookie.alwaysOn": "Immer aktiv",
    "cookie.catAnalytics": "Statistik",
    "cookie.catAnalyticsDesc": "Anonyme Nutzungsdaten zur Verbesserung.",
    "cookie.catMarketing": "Marketing",
    "cookie.catMarketingDesc": "Personalisierung (nur bei Zustimmung).",
    "cookie.savePrefs": "Speichern",
    "cookie.openSettings": "Cookie-Einstellungen",
    "account.title": "Konto",
    "account.signedInHint": "Angemeldet. Nutzdaten werden sicher über Supabase synchronisiert.",
    "account.logout": "Abmelden",
    "account.deleteAccount": "Konto löschen…",
    "account.deleteConfirm": "Konto und Anmeldedaten auf diesem Gerät löschen? Cloud-Daten bleiben, bis du eingeloggt „App-Daten löschen“ nutzt.",
    "account.deleted": "Konto auf diesem Gerät entfernt.",
    "account.loggedOut": "Abgemeldet",
    "account.welcome": "Willkommen zurück",
    "legal.privacyTitle": "Datenschutzerklärung",
    "legal.termsTitle": "Nutzungsbedingungen",
    "legal.privacyBody":
      "<h3>Verarbeitete Daten</h3><p>Flow synchronisiert Aufgaben, Termine, Gruppen, Self-Care, Fokus, Erfolge, Buddy und Punkte über Supabase. Theme, Sprache und UI-Einstellungen können lokal im Browser gespeichert werden.</p><h3>Rechte</h3><p>Cloud-Daten kannst du in den Einstellungen löschen, solange du angemeldet bist, oder das Konto von diesem Gerät entfernen.</p>",
    "legal.termsBody": "<h3>Nutzung</h3><p>Flow wird „wie besehen“ für persönliche Produktivität bereitgestellt.</p><h3>Konten</h3><p>Du bist für Zugangsdaten verantwortlich. Für Produktion ein Backend anbinden.</p>",
  });

  function t(key) {
    const pack = T[currentLang] || T.en;
    const s = pack[key];
    if (typeof s === "string") return s;
    return T.en[key] || key;
  }

  function getLocaleTag() {
    return LOCALE_MAP[currentLang] || "en-US";
  }

  function applyDomI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key && "placeholder" in el) el.placeholder = t(key);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", t(key));
    });
    document.title = t("meta.title");
    const langSel = document.getElementById("languageSelect");
    if (langSel) langSel.value = currentLang;
  }

  function translatePriority(p) {
    return t("priority." + p) || p;
  }

  function setLanguage(code) {
    if (!LOCALE_MAP[code]) return;
    currentLang = code;
    localStorage.setItem(STORAGE_LANG, code);
    document.documentElement.lang = code;
    document.documentElement.dir = code === "ar" ? "rtl" : "ltr";
    applyDomI18n();
    initAvatarPicker();
    updateSidebarUserName();
    refreshCoachBanner();
    refreshAllViews();
  }

  function initLanguage() {
    const stored = localStorage.getItem(STORAGE_LANG);
    if (stored && LOCALE_MAP[stored]) {
      currentLang = stored;
    } else {
      const nav = (navigator.language || "en").slice(0, 2);
      if (LOCALE_MAP[nav]) currentLang = nav;
    }
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    applyDomI18n();
  }

  function refreshAllViews() {
    setView(currentView);
  }

  async function clearLocalAppData() {
    if (!confirm(t("settings.clearDataConfirm"))) return;
    const userId = await getCurrentUserId();
    if (!userId) {
      showToast(t("settings.clearDataNeedAuth"));
      return;
    }
    try {
      const ops = await Promise.all([
        supabase.from("tasks").delete().eq("user_id", userId),
        supabase.from("events").delete().eq("user_id", userId),
        supabase.from("selfcare_entries").delete().eq("user_id", userId),
        supabase.from("focus_sessions").delete().eq("user_id", userId),
        supabase.from("focus_state").delete().eq("user_id", userId),
        supabase.from("achievements").delete().eq("user_id", userId),
        supabase.from("buddy_state").delete().eq("user_id", userId),
        supabase.from("points_log").delete().eq("user_id", userId),
        supabase.from("group_members").delete().eq("user_id", userId),
      ]);
      ops.forEach((r, i) => {
        if (r.error) console.error(`clearLocalAppData op ${i}:`, r.error.message);
      });
    } catch (e) {
      console.error("clearLocalAppData:", e);
    }
    activeGroupId = null;
    buddy = {
      partnerName: "",
      partnerActiveDates: [],
      buddyLongest: 0,
      lastPartnerYmd: null,
      lastMeYmd: null,
    };
    void persistBuddyStateToSupabase();
    pointsLogCache = [];
    try {
      await loadState();
    } catch (e) {
      console.error("clearLocalAppData reload:", e);
      tasks = [];
      events = [];
      groups = [];
      selfcareJournal = {};
      achievementsState = { unlocked: {} };
      achievementRowIds = {};
      focusHistory = [];
      pointsLogCache = [];
    }
    closeSettingsModal();
    renderTasks();
    renderDashboard();
    renderMotivation();
    renderSelfcare();
    renderAchievements();
    renderCalendar();
    renderDayDetail();
    if (currentView === "groups") await renderGroups();
    refreshCoachBanner();
    showToast(t("settings.clearDataDone"));
  }

  function renderSettingsGroupSection() {
    const g = activeGroupId ? findGroupInState(activeGroupId) : null;
    if (els.settingsGroupEmpty) els.settingsGroupEmpty.hidden = !!g;
    if (els.settingsGroupBody) els.settingsGroupBody.hidden = !g;
    if (!g) return;
    const sgCode = g.code || g.inviteCode || "";
    if (els.settingsGroupName) els.settingsGroupName.textContent = g.name || "";
    if (els.settingsGroupCode) els.settingsGroupCode.textContent = sgCode;
    if (els.settingsGroupLink) els.settingsGroupLink.value = getInviteUrl(sgCode);
    if (els.settingsGroupMembers) {
      els.settingsGroupMembers.innerHTML = "";
      g.members.forEach((m) => {
        const li = document.createElement("li");
        li.className = "settings-member-row";
        const span = document.createElement("span");
        span.textContent = m.name || m.id;
        li.appendChild(span);
        if (m.id !== profile.id) {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "btn-text btn-text--small muted";
          rm.setAttribute("data-i18n", "settings.removeFriendSoon");
          rm.textContent = t("settings.removeFriendSoon");
          rm.disabled = true;
          rm.title = t("settings.removeFriendSoonHint");
          li.appendChild(rm);
        }
        els.settingsGroupMembers.appendChild(li);
      });
    }
  }

  function updateSettingsStreakRuleText() {
    if (!els.settingsStreakRuleText) return;
    const n = Math.max(1, Math.min(20, Number(appPrefs.streakMinTasksPerDay) || 1));
    els.settingsStreakRuleText.textContent =
      n <= 1 ? t("streak.ruleHint") : t("streak.ruleHintMin").replace("{n}", String(n));
  }

  function syncSettingsThemeControls() {
    const mode = appPrefs.themeMode;
    document.querySelectorAll('input[name="settingsThemeMode"]').forEach((r) => {
      if (r instanceof HTMLInputElement) r.checked = r.value === mode;
    });
  }

  function syncSettingsFormFromPrefs() {
    const chk = (id, key) => {
      const el = document.getElementById(id);
      if (el && el instanceof HTMLInputElement && el.type === "checkbox") el.checked = !!appPrefs[key];
    };
    chk("prefNotifMaster", "notificationsEnabled");
    chk("prefRemindEvents", "remindEvents");
    chk("prefRemindTasks", "remindTasks");
    chk("prefDailyOpenTasks", "dailyOpenTasksReminder");
    chk("prefSounds", "soundsEnabled");
    chk("prefAnimations", "animationsEnabled");
    chk("prefReduceMotion", "reduceMotion");
    chk("prefWelcome", "welcomeMessageEnabled");
    chk("prefCoach", "coachCharacterEnabled");
    chk("prefRecapWeek", "recapWeekEnabled");
    chk("prefRecapMonth", "recapMonthEnabled");
    chk("prefStreakNudge", "streakEveningNudge");
    chk("prefBuddyCard", "buddyCardVisible");
    const lead = document.getElementById("prefReminderLead");
    if (lead && lead instanceof HTMLSelectElement) lead.value = String(appPrefs.reminderLeadMinutes);
    const th = document.getElementById("prefDailyHour");
    const tm = document.getElementById("prefDailyMinute");
    if (th && th instanceof HTMLInputElement) th.value = String(appPrefs.dailyReminderHour);
    if (tm && tm instanceof HTMLInputElement) tm.value = String(appPrefs.dailyReminderMinute);
    const tf = document.getElementById("prefTimeFormat");
    if (tf && tf instanceof HTMLSelectElement) tf.value = appPrefs.timeFormat === "12" ? "12" : "24";
    const ds = document.getElementById("prefDateStyle");
    if (ds && ds instanceof HTMLSelectElement) ds.value = appPrefs.dateStyle || "locale";
    const ac = document.getElementById("prefAccent");
    if (ac && ac instanceof HTMLSelectElement) ac.value = appPrefs.accent || "default";
    const dv = document.getElementById("prefDefaultView");
    if (dv && dv instanceof HTMLSelectElement) dv.value = appPrefs.defaultView || "dashboard";
    const sm = document.getElementById("prefStreakMin");
    if (sm && sm instanceof HTMLSelectElement) sm.value = String(appPrefs.streakMinTasksPerDay);
    syncSettingsThemeControls();
    applyRecapSegmentVisibility();
  }

  function applyRecapSegmentVisibility() {
    if (els.recapSegWeek) els.recapSegWeek.hidden = !appPrefs.recapWeekEnabled;
    if (els.recapSegMonth) els.recapSegMonth.hidden = !appPrefs.recapMonthEnabled;
  }

  /**
   * Show exactly one settings panel; highlight nav. Persists last category.
   */
  function setSettingsActiveCategory(sectionId) {
    const scroll = document.getElementById("settingsContentScroll");
    const panels = scroll?.querySelectorAll(".settings-panel");
    if (!panels || !panels.length) return;
    let resolved = sectionId;
    const valid = resolved && [...panels].some((p) => p.id === resolved);
    if (!valid) resolved = DEFAULT_SETTINGS_PANEL_ID;
    panels.forEach((panel) => {
      const on = panel.id === resolved;
      panel.hidden = !on;
    });
    document.querySelectorAll("#settingsNav [data-settings-jump]").forEach((btn) => {
      const jump = btn.getAttribute("data-settings-jump");
      const active = jump === resolved;
      btn.classList.toggle("settings-nav-btn--active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (scroll) scroll.scrollTop = 0;
    try {
      localStorage.setItem(STORAGE_SETTINGS_ACTIVE_PANEL, resolved);
    } catch (_) {}
  }

  let settingsBindingsInitialized = false;
  function initSettingsPreferenceBindings() {
    if (settingsBindingsInitialized) return;
    settingsBindingsInitialized = true;
    const root = els.settingsModal;
    if (!root) return;

    root.querySelectorAll("[data-settings-jump]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.getAttribute("data-settings-jump");
        if (!id) return;
        setSettingsActiveCategory(id);
      });
    });

    const wireChk = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        if (el instanceof HTMLInputElement) appPrefs[key] = el.checked;
        saveAppPrefs();
        updateNotificationStatusText();
        applyRecapSegmentVisibility();
        renderMotivation();
      });
    };
    wireChk("prefNotifMaster", "notificationsEnabled");
    wireChk("prefRemindEvents", "remindEvents");
    wireChk("prefRemindTasks", "remindTasks");
    wireChk("prefDailyOpenTasks", "dailyOpenTasksReminder");
    wireChk("prefSounds", "soundsEnabled");
    wireChk("prefAnimations", "animationsEnabled");
    wireChk("prefReduceMotion", "reduceMotion");
    wireChk("prefWelcome", "welcomeMessageEnabled");
    wireChk("prefCoach", "coachCharacterEnabled");
    wireChk("prefRecapWeek", "recapWeekEnabled");
    wireChk("prefRecapMonth", "recapMonthEnabled");
    wireChk("prefStreakNudge", "streakEveningNudge");
    wireChk("prefBuddyCard", "buddyCardVisible");

    const lead = document.getElementById("prefReminderLead");
    lead?.addEventListener("change", () => {
      if (lead instanceof HTMLSelectElement) appPrefs.reminderLeadMinutes = Number(lead.value) || 30;
      saveAppPrefs();
    });

    const onDailyTimeChange = () => {
      const th = document.getElementById("prefDailyHour");
      const tm = document.getElementById("prefDailyMinute");
      if (th instanceof HTMLInputElement) appPrefs.dailyReminderHour = Math.max(0, Math.min(23, Number(th.value) || 0));
      if (tm instanceof HTMLInputElement) appPrefs.dailyReminderMinute = Math.max(0, Math.min(59, Number(tm.value) || 0));
      saveAppPrefs();
    };
    document.getElementById("prefDailyHour")?.addEventListener("change", onDailyTimeChange);
    document.getElementById("prefDailyMinute")?.addEventListener("change", onDailyTimeChange);

    document.getElementById("prefTimeFormat")?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) appPrefs.timeFormat = t.value === "12" ? "12" : "24";
      saveAppPrefs();
      refreshAllViews();
    });
    document.getElementById("prefDateStyle")?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) {
        appPrefs.dateStyle = t.value === "iso" || t.value === "dmy" ? t.value : "locale";
        saveAppPrefs();
        refreshAllViews();
      }
    });
    document.getElementById("prefAccent")?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) {
        appPrefs.accent = t.value || "default";
        saveAppPrefs();
      }
    });
    document.getElementById("prefDefaultView")?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) {
        const v = t.value;
        const ok = ["dashboard", "tasks", "calendar", "selfcare", "focus", "achievements", "groups", "motivation"];
        if (ok.includes(v)) appPrefs.defaultView = v;
        saveAppPrefs();
      }
    });
    document.getElementById("prefStreakMin")?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) {
        appPrefs.streakMinTasksPerDay = Math.max(1, Math.min(20, Number(t.value) || 1));
        saveAppPrefs();
        updateSettingsStreakRuleText();
        renderMotivation();
        renderCalendar();
      }
    });

    document.querySelectorAll('input[name="settingsThemeMode"]').forEach((r) => {
      r.addEventListener("change", () => {
        if (r instanceof HTMLInputElement && r.checked) {
          const v = r.value;
          if (v === "light" || v === "dark" || v === "system") {
            appPrefs.themeMode = v;
            saveAppPrefs();
          }
        }
      });
    });

    document.getElementById("btnSettingsChangePassword")?.addEventListener("click", () => {
      showToast(t("settings.passwordSoon"));
    });
    document.getElementById("btnSettingsClearData")?.addEventListener("click", () => void clearLocalAppData());
    document.getElementById("btnSettingsResetGeneral")?.addEventListener("click", () => void clearLocalAppData());
    document.getElementById("btnSettingsLeaveGroup")?.addEventListener("click", async () => {
      if (!confirm(t("groups.leave") + "?")) return;
      await leaveGroup();
      renderSettingsGroupSection();
    });
    document.getElementById("btnSettingsManageGroup")?.addEventListener("click", () => {
      closeSettingsModal();
      setView("groups");
    });
    document.getElementById("btnSettingsCopyCode")?.addEventListener("click", async () => {
      const g = activeGroupId ? findGroupInState(activeGroupId) : null;
      if (!g || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(g.code || g.inviteCode || "");
        showToast(t("groups.copied"));
      } catch (_) {}
    });
    document.getElementById("btnSettingsCopyLink")?.addEventListener("click", async () => {
      const inp = document.getElementById("settingsGroupLink");
      if (!inp || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(inp.value);
        showToast(t("groups.copied"));
      } catch (_) {}
    });
  }

  function openSettingsModal() {
    if (els.profileDisplayName) els.profileDisplayName.value = profile.displayName;
    applyProfileAvatars();
    updateAccountSettingsLabel();
    updateNotificationStatusText();
    initSettingsPreferenceBindings();
    syncSettingsFormFromPrefs();
    renderSettingsGroupSection();
    updateSettingsStreakRuleText();
    let savedPanel = DEFAULT_SETTINGS_PANEL_ID;
    try {
      const s = localStorage.getItem(STORAGE_SETTINGS_ACTIVE_PANEL);
      if (s && document.getElementById(s)?.classList.contains("settings-panel")) savedPanel = s;
    } catch (_) {}
    setSettingsActiveCategory(savedPanel);
    showModal(els.settingsModal, els.settingsModalBackdrop);
    applyDomI18n();
    requestAnimationFrame(() => {
      try {
        document.querySelector("#settingsNav .settings-nav-btn--active")?.focus({ preventScroll: true });
      } catch (_) {}
    });
  }

  function closeSettingsModal() {
    hideModal(els.settingsModal, els.settingsModalBackdrop);
  }

  /** Event accent colors for calendar / day panel */
  const EVENT_COLORS = {
    rose: "#fb7185",
    violet: "#a78bfa",
    sky: "#38bdf8",
    mint: "#34d399",
    amber: "#fbbf24",
  };

  // ——— State ———
  let tasks = [];
  let events = [];
  /** @type {Array<{id:string,name:string,code:string,members:Array<{id:string,name:string}>,createdAt:number}>} */
  let groups = [];
  /** @type {string|null} */
  let activeGroupId = null;

  /** Resolve a group by id with stable string comparison (Supabase UUID vs in-memory string). */
  function findGroupInState(groupId) {
    if (groupId == null || groupId === "") return null;
    const sid = String(groupId);
    return groups.find((g) => String(g.id) === sid) || null;
  }

  /** @type {{partnerName:string,partnerActiveDates:string[],buddyLongest:number,lastPartnerYmd:string|null,lastMeYmd:string|null}} */
  let buddy = {
    partnerName: "",
    partnerActiveDates: [],
    buddyLongest: 0,
    lastPartnerYmd: null,
    lastMeYmd: null,
  };
  /** @type {{id:string,displayName:string,avatarId:string,avatarCustom:string|null,avatarUrl:string}} */
  let profile = { id: "", displayName: "You", avatarId: "p1", avatarCustom: null, avatarUrl: "" };
  /** @type {Record<string, {grateful:string,smile:string,well:string,proud:string,self:string,surprise:string,updatedAt:number}>} */
  let selfcareJournal = {};
  let selfcareDirty = false;
  let selfcareActivePreviewYmd = "";
  /** @type {{ unlocked: Record<string,string> }} */
  let achievementsState = { unlocked: {} };
  /** Maps achievement definition id → Supabase `achievements.id` (for deleteAchievement). */
  let achievementRowIds = {};
  /** @type {Array<{id:string,taskId:string|null,taskTitle:string,durationMin:number,completed:boolean,startedAt:number,endedAt:number,mode:string,route:string}>} */
  let focusHistory = [];
  /** Cached rows from `points_log` for group ranking / month totals (includes `id` for deletePointEntry). */
  let pointsLogCache = [];
  const focusTimer = {
    selectedTaskId: "",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    paused: false,
    startedAtMs: 0,
    endAtMs: 0,
    tickId: 0,
    mode: "classic",
    distractionSelections: [],
    preEndNotified: false,
    activeSessionId: "",
    activeTaskTitle: "",
    breakDurationSec: 5 * 60,
    breakRemainingSec: 5 * 60,
    breakRunning: false,
    breakTickId: 0,
    lastFocusStatePersistAt: 0,
  };
  const focusStateDbSupport = {
    checked: false,
    hasPauseColumns: true,
  };


  const DEFAULT_APP_PREFS = {
    notificationsEnabled: true,
    remindEvents: true,
    remindTasks: true,
    reminderLeadMinutes: 30,
    dailyOpenTasksReminder: false,
    dailyReminderHour: 9,
    dailyReminderMinute: 0,
    timeFormat: "24",
    dateStyle: "locale",
    themeMode: "light",
    accent: "default",
    animationsEnabled: true,
    reduceMotion: false,
    soundsEnabled: false,
    defaultView: "dashboard",
    welcomeMessageEnabled: true,
    coachCharacterEnabled: true,
    streakMinTasksPerDay: 1,
    streakEveningNudge: false,
    buddyCardVisible: true,
    recapWeekEnabled: true,
    recapMonthEnabled: true,
    /** Last selected group (Supabase); persisted in app prefs only. */
    activeGroupId: "",
  };
  /** @type {typeof DEFAULT_APP_PREFS} */
  let appPrefs = { ...DEFAULT_APP_PREFS };
  /** @type {'dashboard'|'tasks'|'calendar'|'motivation'|'selfcare'|'focus'|'achievements'|'groups'} */
  let currentView = "dashboard";
  /** @type {'month'|'week'} */
  let calMode = "month";
  /** @type {'week'|'month'} */
  let recapViewMode = "week";

  const ACHIEVEMENT_DEFS = [
    { id: "task_done_50", category: "productivity", icon: "✓", target: 50 },
    { id: "task_done_100", category: "productivity", icon: "★", target: 100 },
    { id: "timed_events_10", category: "discipline", icon: "◷", target: 10 },
    { id: "streak_7", category: "streaks", icon: "7", target: 7 },
    { id: "streak_30", category: "streaks", icon: "30", target: 30 },
    { id: "perfect_days_5", category: "discipline", icon: "◆", target: 5 },
    { id: "perfect_days_10", category: "discipline", icon: "◈", target: 10 },
    { id: "selfcare_first", category: "selfcare", icon: "❤", target: 1 },
    { id: "selfcare_streak_3", category: "selfcare", icon: "☼", target: 3 },
    { id: "selfcare_days_7", category: "selfcare", icon: "✦", target: 7 },
    { id: "group_created", category: "social", icon: "⌂", target: 1 },
    { id: "group_member_2", category: "social", icon: "⇄", target: 2 },
    { id: "group_rank_1", category: "social", icon: "№1", target: 1 },
    { id: "active_days_30", category: "progress", icon: "◉", target: 30 },
    { id: "achievements_3", category: "progress", icon: "III", target: 3 },
    { id: "achievements_10", category: "progress", icon: "X", target: 10 },
  ];
  /** Anchor for calendar navigation (any day in the visible month/week) */
  let calAnchor;
  /** Selected day in calendar detail panel (YYYY-MM-DD) */
  let selectedDateStr;

  // ——— DOM refs ———
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    app: $("#app"),
    authGate: $("#authGate"),
    authPanelWelcome: $("#authPanelWelcome"),
    authPanelLogin: $("#authPanelLogin"),
    authPanelRegister: $("#authPanelRegister"),
    authBtnGoogle: $("#authBtnGoogle"),
    authBtnApple: $("#authBtnApple"),
    authBtnShowEmailLogin: $("#authBtnShowEmailLogin"),
    authBtnShowRegister: $("#authBtnShowRegister"),
    authBtnQuickLogin: $("#authBtnQuickLogin"),
    authFormLogin: $("#authFormLogin"),
    authLoginEmail: $("#authLoginEmail"),
    authLoginPassword: $("#authLoginPassword"),
    authToggleLoginPw: $("#authToggleLoginPw"),
    authLoginError: $("#authLoginError"),
    authBackFromLogin: $("#authBackFromLogin"),
    authFormRegister: $("#authFormRegister"),
    authRegName: $("#authRegName"),
    authRegEmail: $("#authRegEmail"),
    authRegUsername: $("#authRegUsername"),
    authRegPassword: $("#authRegPassword"),
    authRegPassword2: $("#authRegPassword2"),
    authToggleRegPw: $("#authToggleRegPw"),
    authRegisterError: $("#authRegisterError"),
    authBackFromRegister: $("#authBackFromRegister"),
    authLinkTerms: $("#authLinkTerms"),
    authLinkPrivacyFromGate: $("#authLinkPrivacyFromGate"),
    cookieBar: $("#cookieBar"),
    cookieAcceptAll: $("#cookieAcceptAll"),
    cookieNecessaryOnly: $("#cookieNecessaryOnly"),
    cookieOpenSettings: $("#cookieOpenSettings"),
    cookieSettingsModal: $("#cookieSettingsModal"),
    cookieSettingsBackdrop: $("#cookieSettingsBackdrop"),
    cookieSettingsClose: $("#cookieSettingsClose"),
    cookieSettingsSave: $("#cookieSettingsSave"),
    cookieToggleAnalytics: $("#cookieToggleAnalytics"),
    cookieToggleMarketing: $("#cookieToggleMarketing"),
    legalModal: $("#legalModal"),
    legalModalBackdrop: $("#legalModalBackdrop"),
    legalModalClose: $("#legalModalClose"),
    legalModalBody: $("#legalModalBody"),
    legalModalTitle: $("#legalModalTitle"),
    accountSignedInLabel: $("#accountSignedInLabel"),
    btnLogout: $("#btnLogout"),
    btnDeleteAccount: $("#btnDeleteAccount"),
    btnCookiePrefs: $("#btnCookiePrefs"),
    btnOpenPrivacyFromSettings: $("#btnOpenPrivacyFromSettings"),
    btnOpenTermsFromSettings: $("#btnOpenTermsFromSettings"),
    navItems: $$(".nav-item"),
    navToggle: $("#navToggle"),
    sidebar: $("#sidebar"),
    sidebarUserName: $("#sidebarUserName"),
    sidebarAvatarHost: $("#sidebarAvatarHost"),
    sidebarBackdrop: $("#sidebarBackdrop"),
    pageTitle: $("#pageTitle"),
    pageSubtitle: $("#pageSubtitle"),
    views: {
      dashboard: $("#viewDashboard"),
      tasks: $("#viewTasks"),
      calendar: $("#viewCalendar"),
      motivation: $("#viewMotivation"),
      selfcare: $("#viewSelfcare"),
      focus: $("#viewFocus"),
      achievements: $("#viewAchievements"),
      groups: $("#viewGroups"),
    },
    statOpenTasks: $("#statOpenTasks"),
    statWeekEvents: $("#statWeekEvents"),
    statDueSoon: $("#statDueSoon"),
    dashStreakMini: $("#dashStreakMini"),
    dashBuddyMini: $("#dashBuddyMini"),
    dashboardTasks: $("#dashboardTasks"),
    dashboardEvents: $("#dashboardEvents"),
    selfcareDate: $("#selfcareDate"),
    selfcareStatus: $("#selfcareStatus"),
    selfcareQuestions: $("#selfcareQuestions"),
    selfcareEntriesList: $("#selfcareEntriesList"),
    selfcareEntriesEmpty: $("#selfcareEntriesEmpty"),
    selfcarePreview: $("#selfcarePreview"),
    selfcarePreviewDate: $("#selfcarePreviewDate"),
    selfcarePreviewText: $("#selfcarePreviewText"),
    focusTaskSelect: $("#focusTaskSelect"),
    focusCustomMinutes: $("#focusCustomMinutes"),
    focusTaskTitle: $("#focusTaskTitle"),
    focusTaskNotes: $("#focusTaskNotes"),
    focusGuidanceText: $("#focusGuidanceText"),
    focusTimerDisplay: $("#focusTimerDisplay"),
    focusProgressFill: $("#focusProgressFill"),
    focusRouteProgress: $("#focusRouteProgress"),
    focusBreakPanel: $("#focusBreakPanel"),
    focusBreakDisplay: $("#focusBreakDisplay"),
    btnBreakStart: $("#btnBreakStart"),
    btnBreakSkip: $("#btnBreakSkip"),
    focusSessionList: $("#focusSessionList"),
    focusSessionEmpty: $("#focusSessionEmpty"),
    focusPresetButtons: $("#focusPresetButtons"),
    btnFocusStart: $("#btnFocusStart"),
    btnFocusPause: $("#btnFocusPause"),
    btnFocusResume: $("#btnFocusResume"),
    btnFocusEnd: $("#btnFocusEnd"),
    btnFocusFullscreen: $("#btnFocusFullscreen"),
    achievementsSummary: $("#achievementsSummary"),
    achFilterStatus: $("#achFilterStatus"),
    achFilterCategory: $("#achFilterCategory"),
    achievementsGrid: $("#achievementsGrid"),
    achievementsEmpty: $("#achievementsEmpty"),
    btnSaveSelfcare: $("#btnSaveSelfcare"),
    btnSelfcareClear: $("#btnSelfcareClear"),
    btnSelfcareLoadDate: $("#btnSelfcareLoadDate"),
    btnSelfcareEditPreview: $("#btnSelfcareEditPreview"),
    selfcareQGrateful: $("#selfcareQGrateful"),
    selfcareQSmile: $("#selfcareQSmile"),
    selfcareQWentWell: $("#selfcareQWentWell"),
    selfcareQProud: $("#selfcareQProud"),
    selfcareQSelf: $("#selfcareQSelf"),
    selfcareQSurprise: $("#selfcareQSurprise"),
    taskList: $("#taskList"),
    tasksEmpty: $("#tasksEmpty"),
    taskFilter: $("#taskFilter"),
    taskSort: $("#taskSort"),
    btnAddTask: $("#btnAddTask"),
    calTitle: $("#calTitle"),
    calPrev: $("#calPrev"),
    calNext: $("#calNext"),
    calToday: $("#calToday"),
    calWeekdayLabels: $("#calWeekdayLabels"),
    calGrid: $("#calGrid"),
    selectedDayLabel: $("#selectedDayLabel"),
    selectedDayDate: $("#selectedDayDate"),
    dayTasksList: $("#dayTasksList"),
    dayEventsList: $("#dayEventsList"),
    dayTasksEmpty: $("#dayTasksEmpty"),
    dayEventsEmpty: $("#dayEventsEmpty"),
    btnAddEvent: $("#btnAddEvent"),
    segments: $$(".segment"),
    themeToggle: $("#themeToggle"),
    taskModal: $("#taskModal"),
    taskModalBackdrop: $("#taskModalBackdrop"),
    taskForm: $("#taskForm"),
    taskModalTitle: $("#taskModalTitle"),
    taskId: $("#taskId"),
    taskTitle: $("#taskTitle"),
    taskNotes: $("#taskNotes"),
    taskPriority: $("#taskPriority"),
    taskDue: $("#taskDue"),
    taskShareScope: $("#taskShareScope"),
    taskCompleted: $("#taskCompleted"),
    taskDelete: $("#taskDelete"),
    taskModalClose: $("#taskModalClose"),
    taskCancel: $("#taskCancel"),
    eventModal: $("#eventModal"),
    eventModalBackdrop: $("#eventModalBackdrop"),
    eventForm: $("#eventForm"),
    eventModalTitle: $("#eventModalTitle"),
    eventId: $("#eventId"),
    eventTitle: $("#eventTitle"),
    eventNotes: $("#eventNotes"),
    eventDate: $("#eventDate"),
    eventColor: $("#eventColor"),
    eventAllDay: $("#eventAllDay"),
    eventStartHour: $("#eventStartHour"),
    eventStartMin: $("#eventStartMin"),
    eventEndHour: $("#eventEndHour"),
    eventEndMin: $("#eventEndMin"),
    eventTimeRow: $("#eventTimeRow"),
    eventTimePanel: $("#eventTimePanel"),
    eventDelete: $("#eventDelete"),
    eventModalClose: $("#eventModalClose"),
    eventCancel: $("#eventCancel"),
    settingsModal: $("#settingsModal"),
    settingsModalBackdrop: $("#settingsModalBackdrop"),
    settingsModalClose: $("#settingsModalClose"),
    btnSettings: $("#btnSettings"),
    btnSidebarSettings: $("#btnSidebarSettings"),
    languageSelect: $("#languageSelect"),
    profileDisplayName: $("#profileDisplayName"),
    btnRequestNotifications: $("#btnRequestNotifications"),
    notificationStatus: $("#notificationStatus"),
    toastStack: $("#toastStack"),
    streakCurrent: $("#streakCurrent"),
    streakLongest: $("#streakLongest"),
    streakTodayText: $("#streakTodayText"),
    streakWeekDots: $("#streakWeekDots"),
    buddyNameInput: $("#buddyNameInput"),
    buddyStreakCurrent: $("#buddyStreakCurrent"),
    buddyStreakLongest: $("#buddyStreakLongest"),
    buddyMeStatus: $("#buddyMeStatus"),
    buddyPartnerStatus: $("#buddyPartnerStatus"),
    buddyPartnerActiveToday: $("#buddyPartnerActiveToday"),
    btnOpenGroupCreateModal: $("#btnOpenGroupCreateModal"),
    groupCreateModal: $("#groupCreateModal"),
    groupCreateModalBackdrop: $("#groupCreateModalBackdrop"),
    groupCreateModalClose: $("#groupCreateModalClose"),
    groupCreateModalCancel: $("#groupCreateModalCancel"),
    groupCreateForm: $("#groupCreateForm"),
    groupModalName: $("#groupModalName"),
    groupCreateStepForm: $("#groupCreateStepForm"),
    groupCreateStepSuccess: $("#groupCreateStepSuccess"),
    groupModalSuccessCode: $("#groupModalSuccessCode"),
    groupModalSuccessLink: $("#groupModalSuccessLink"),
    groupModalCopyCode: $("#groupModalCopyCode"),
    groupCreateDoneBtn: $("#groupCreateDoneBtn"),
    shareFallbackHint: $("#shareFallbackHint"),
    sidebarAvatarHost: $("#sidebarAvatarHost"),
    
    coachBanner: $("#coachBanner"),
    coachBannerText: $("#coachBannerText"),
    coachBannerClose: $("#coachBannerClose"),
    coachAvatarHost: $("#coachAvatarHost"),
    welcomeOverlay: $("#welcomeOverlay"),
    welcomeOverlayBackdrop: $("#welcomeOverlayBackdrop"),
    welcomeCard: $("#welcomeCard"),
    welcomeClose: $("#welcomeClose"),
    welcomeContinue: $("#welcomeContinue"),
    welcomeMessage: $("#welcomeMessage"),
    settingsAvatarPreview: $("#settingsAvatarPreview"),
    avatarPicker: $("#avatarPicker"),
    avatarFileInput: $("#avatarFileInput"),
    btnAvatarUpload: $("#btnAvatarUpload"),
    groupJoinCode: $("#groupJoinCode"),
    btnJoinGroup: $("#btnJoinGroup"),
    groupDetailEmpty: $("#groupDetailEmpty"),
    groupDetailBody: $("#groupDetailBody"),
    groupDetailName: $("#groupDetailName"),
    groupDetailCode: $("#groupDetailCode"),
    groupInviteLink: $("#groupInviteLink"),
    groupRankingList: $("#groupRankingList"),
    groupRankingMonth: $("#groupRankingMonth"),
    groupRankingYou: $("#groupRankingYou"),
    btnCopyGroupCode: $("#btnCopyGroupCode"),
    btnCopyInviteLink: $("#btnCopyInviteLink"),
    btnLeaveGroup: $("#btnLeaveGroup"),
    eventStreakRow: $("#eventStreakRow"),
    eventStreakDone: $("#eventStreakDone"),
    eventShareScope: $("#eventShareScope"),
    btnCalendarRecap: $("#btnCalendarRecap"),
    calendarRecapModal: $("#calendarRecapModal"),
    calendarRecapBackdrop: $("#calendarRecapBackdrop"),
    calendarRecapClose: $("#calendarRecapClose"),
    recapSegWeek: $("#recapSegWeek"),
    recapSegMonth: $("#recapSegMonth"),
    recapPeriodLabel: $("#recapPeriodLabel"),
    recapValSuccess: $("#recapValSuccess"),
    recapValFail: $("#recapValFail"),
    recapValRate: $("#recapValRate"),
    recapBarSuccess: $("#recapBarSuccess"),
    recapBarFail: $("#recapBarFail"),
    buddyCard: $("#buddyCard"),
    settingsGroupEmpty: $("#settingsGroupEmpty"),
    settingsGroupBody: $("#settingsGroupBody"),
    settingsGroupName: $("#settingsGroupName"),
    settingsGroupCode: $("#settingsGroupCode"),
    settingsGroupLink: $("#settingsGroupLink"),
    settingsGroupMembers: $("#settingsGroupMembers"),
    settingsStreakRuleText: $("#settingsStreakRuleText"),
  };

  // ——— Utilities ———

  function formatYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseYMD(str) {
    const [y, m, day] = str.split("-").map(Number);
    return new Date(y, m - 1, day);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function addMonths(d, n) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  /** Log + stringify PostgREST / Supabase errors (full fields for Dashboard debugging). */
  function logSupabasePostgrestError(context, error) {
    if (error == null) {
      console.error(context, "(error is null/undefined)");
      return;
    }
    console.error(context, "raw error object:", error);
    const code = error.code;
    const message = error.message;
    const details = error.details;
    const hint = error.hint;
    console.error(context, "error.code:", code);
    console.error(context, "error.message:", message);
    console.error(context, "error.details:", details);
    console.error(context, "error.hint:", hint);
    try {
      const plain = { code, message, details, hint };
      console.error(context, "error (JSON):", JSON.stringify(plain));
    } catch (_) {}
  }

  function formatPostgrestErrorForUi(error, prefix) {
    if (!error || typeof error !== "object") return prefix + String(error);
    const parts = [prefix];
    if (error.code != null) parts.push(`code=${error.code}`);
    if (error.message) parts.push(error.message);
    if (error.details) parts.push(`details: ${error.details}`);
    if (error.hint) parts.push(`hint: ${error.hint}`);
    return parts.join(" — ");
  }

  async function insertTaskToSupabase(task) {
    const userId = await getCurrentUserId();
    console.log("insertTaskToSupabase: current userId:", userId);
    if (!userId) {
      const msg = "Task insert: no authenticated user (userId is null — session missing?)";
      console.error(msg);
      throw new Error(msg);
    }

    const row = mapTaskToSupabase(task, userId);
    console.log("insertTaskToSupabase: insert row (object):", row);
    try {
      console.log("insertTaskToSupabase: insert row (JSON):", JSON.stringify(row));
    } catch (e) {
      console.warn("insertTaskToSupabase: row JSON.stringify failed:", e);
    }
    console.log("insertTaskToSupabase: user_id on row matches session:", row.user_id === userId);

    const result = await supabase.from("tasks").insert([row]).select("*").single();
    console.log("insertTaskToSupabase: full Supabase client result:", result);
    console.log("insertTaskToSupabase: result.data:", result.data);
    console.log("insertTaskToSupabase: result.error:", result.error);
    if (result.count != null) console.log("insertTaskToSupabase: result.count:", result.count);
    if (result.status != null) console.log("insertTaskToSupabase: result.status:", result.status);

    const { data, error } = result;
    if (error) {
      logSupabasePostgrestError("insertTaskToSupabase: PostgREST error", error);
      throw new Error(formatPostgrestErrorForUi(error, "Task insert failed."));
    }
    if (!data) {
      const msg =
        "Task insert: success but no row in response (often RLS blocking SELECT on RETURNING, or .single() got 0 rows). Check flow_tasks_select policy.";
      console.error(msg, { result });
      throw new Error(msg);
    }
    console.log("insertTaskToSupabase: inserted row from DB:", data);
    return mapTaskFromSupabase(data);
  }

  async function updateTaskToSupabase(task) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("Kein eingeloggter User für Task-Update gefunden");
      return null;
    }
    const patch = mapTaskToSupabaseUpdate(task);
    console.log("Task Supabase update", { id: task.id, patch });
    try {
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", task.id).select("*").single();
      if (error) {
        console.error("Task update failed:", error);
        return null;
      }
      if (!data) {
        console.error("Task update failed: no row returned (wrong id or RLS)");
        return null;
      }
      console.log("Task update Supabase response row:", data);
      return mapTaskFromSupabase(data);
    } catch (e) {
      console.error("updateTaskToSupabase:", e);
      return null;
    }
  }

  async function deleteTaskFromSupabase(taskId) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("Kein eingeloggter User für Task-Löschung gefunden");
      return false;
    }
    try {
      const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("id").single();
      if (error) {
        console.error("Task delete failed:", error);
        return false;
      }
      if (!data) {
        console.error("Task delete failed: no row removed (wrong id or RLS)");
        return false;
      }
      return true;
    } catch (e) {
      console.error("deleteTaskFromSupabase:", e);
      return false;
    }
  }

  /** Reload tasks from Supabase (same scope as loadState), reconcile points, refresh task UI. */
  async function reloadTasksAndRender() {
    tasks = await loadTasksFromSupabase(groups.map((g) => g.id));
    await reconcilePointsLogWithSources();
    refreshUiAfterTasksChange();
  }

  async function insertEventToSupabase(ev) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("Kein eingeloggter User für Event-Insert gefunden");
      return false;
    }
    const row = mapEventToSupabase(ev, userId);
    const { error } = await supabase.from("events").insert([row]);
    if (error) {
      console.error("Fehler beim Anlegen des Events:", error.message);
      return false;
    }
    return true;
  }

  async function updateEventToSupabase(ev) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("Kein eingeloggter User für Event-Update gefunden");
      return false;
    }
    const patch = mapEventToSupabaseUpdate(ev);
    const { error } = await supabase.from("events").update(patch).eq("id", ev.id);
    if (error) {
      console.error("Fehler beim Aktualisieren des Events:", error.message);
      return false;
    }
    return true;
  }

  async function deleteEventFromSupabase(eventId) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("Kein eingeloggter User für Event-Löschung gefunden");
      return false;
    }
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      console.error("Fehler beim Löschen des Events:", error.message);
      return false;
    }
    return true;
  }

  async function loadSelfcareEntriesFromSupabase() {
    selfcareJournal = {};
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("selfcare_entries")
        .select("day,body,updated_at")
        .eq("user_id", userId)
        .order("day", { ascending: false });
      if (error) throw error;
      (data || []).forEach((row) => {
        const ymd = typeof row.day === "string" ? row.day : String(row.day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
        try {
          const parsed = JSON.parse(row.body || "{}");
          selfcareJournal[ymd] = sanitizeSelfcareEntry(parsed);
        } catch (_) {
          selfcareJournal[ymd] = sanitizeSelfcareEntry({});
        }
      });
    } catch (e) {
      logSupabasePostgrestError("loadSelfcareEntriesFromSupabase", e);
      console.error(e);
    }
  }

  async function upsertSelfcareEntryToSupabase(ymd, payload) {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    const bodyStr = JSON.stringify(payload);
    const row = {
      user_id: userId,
      day: ymd,
      body: bodyStr,
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase
        .from("selfcare_entries")
        .upsert(row, { onConflict: "user_id,day" })
        .select("day");
      if (error) throw error;
      return true;
    } catch (e) {
      logSupabasePostgrestError("upsertSelfcareEntryToSupabase", e);
      console.error(e);
      return false;
    }
  }

  async function deleteSelfcareEntryFromSupabase(ymd) {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    try {
      const { error } = await supabase.from("selfcare_entries").delete().eq("user_id", userId).eq("day", ymd);
      if (error) throw error;
      return true;
    } catch (e) {
      logSupabasePostgrestError("deleteSelfcareEntryFromSupabase", e);
      console.error(e);
      return false;
    }
  }

  // Compatibility aliases (Supabase-only paths)
  async function loadSelfcareFromSupabase() {
    await loadSelfcareEntriesFromSupabase();
    return selfcareJournal;
  }
  async function insertSelfcareToSupabase(ymd, payload) {
    return upsertSelfcareEntryToSupabase(ymd, payload);
  }
  async function deleteSelfcareFromSupabase(ymd) {
    return deleteSelfcareEntryFromSupabase(ymd);
  }

  /** Map one `focus_sessions` row to the in-memory session shape used by the Focus UI. */
  function mapFocusSessionRow(row) {
    let rawMeta = row.meta;
    if (typeof rawMeta === "string") {
      try {
        rawMeta = JSON.parse(rawMeta);
      } catch (_) {
        rawMeta = {};
      }
    }
    const m = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
    const dayRaw = row.day != null ? row.day : row.date != null ? row.date : null;
    const date =
      typeof dayRaw === "string"
        ? dayRaw.slice(0, 10)
        : dayRaw != null
          ? String(dayRaw).slice(0, 10)
          : row.created_at
            ? String(row.created_at).slice(0, 10)
            : formatYMD(new Date(createdAt));
    const startedRaw = m.startedAt;
    const endedRaw = m.endedAt;
    const startedAt =
      typeof startedRaw === "number" && Number.isFinite(startedRaw)
        ? startedRaw
        : typeof startedRaw === "string"
          ? Number(startedRaw)
          : NaN;
    const endedAt =
      typeof endedRaw === "number" && Number.isFinite(endedRaw)
        ? endedRaw
        : typeof endedRaw === "string"
          ? Number(endedRaw)
          : NaN;
    const fallbackTime = createdAt;
    return {
      id: row.id,
      taskId: m.taskId != null ? String(m.taskId) : null,
      taskTitle: String(m.taskTitle || ""),
      durationMin: Math.max(0, Number(row.duration) || 0),
      completed: Boolean(m.completed),
      startedAt: Number.isFinite(startedAt) ? startedAt : fallbackTime,
      endedAt: Number.isFinite(endedAt) ? endedAt : fallbackTime,
      mode: String(m.mode || "classic"),
      route: String(m.route || ""),
      date,
      createdAt,
      meta: m,
    };
  }

  async function loadFocusSessionsFromSupabase() {
    console.log("[focus] load sessions start");
    let userId = await getCurrentUserId();
    if (!userId) {
      try {
        const s = readSessionRaw();
        if (s?.userId) userId = s.userId;
      } catch (_) {}
    }
    if (!userId) {
      try {
        const { data } = await supabase.auth.getSession();
        userId = data?.session?.user?.id || null;
      } catch (_) {}
    }
    if (!userId) {
      try {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      } catch (_) {}
    }
    if (!userId) {
      console.log("[focus] raw focus_sessions:", []);
      console.log("[focus] mapped focus sessions:", []);
      focusHistory = [];
      renderFocusHistory();
      return;
    }
    try {
      const { data: rows, error } = await supabase
        .from("focus_sessions")
        .select("id,duration,day,meta,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      console.log("[focus] raw focus_sessions:", rows);
      const mapped = (rows || []).map(mapFocusSessionRow);
      console.log("[focus] mapped focus sessions:", mapped);
      focusHistory = mapped;
      renderFocusHistory();
    } catch (e) {
      console.error("loadFocusSessionsFromSupabase:", e);
      focusHistory = [];
      renderFocusHistory();
    }
  }

  async function insertFocusSessionToSupabase(session) {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("[focus] insert focus session error:", new Error("no authenticated user"));
      return false;
    }
    const durationMin = Math.max(1, Math.round(Number(session.durationMin) || 1));
    const day = formatYMD(new Date(session.endedAt || session.startedAt || Date.now()));
    const meta = {
      taskId: session.taskId,
      taskTitle: session.taskTitle,
      completed: session.completed,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      mode: session.mode,
      route: session.route,
    };
    const rowId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : session.id;
    const payload = {
      id: rowId,
      user_id: userId,
      duration: durationMin,
      day,
      meta,
      created_at: new Date(session.endedAt || Date.now()).toISOString(),
    };
    try {
      console.log("[focus] inserting focus session:", payload);
      const { data, error } = await supabase.from("focus_sessions").insert(payload).select().maybeSingle();
      if (error) {
        console.error("[focus] insert focus session error:", error);
        return false;
      }
      session.id = rowId;
      console.log("[focus] inserted focus session:", data);
      return true;
    } catch (e) {
      console.error("[focus] insert focus session error:", e);
      return false;
    }
  }

  function isMissingColumnError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return msg.includes("column") && (msg.includes("does not exist") || msg.includes("unknown"));
  }

  async function upsertFocusStatePayload(payload) {
    const { error } = await supabase.from("focus_state").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function persistFocusStateRunning() {
    const userId = await getCurrentUserId();
    if (!userId || !focusTimer.running) return;
    const startedAtMs = focusTimer.startedAtMs || Date.now();
    const durationMin = Math.max(1, Math.round(focusTimer.remainingSec / 60));
    const payload = {
      user_id: userId,
      task_id: focusTimer.selectedTaskId ? focusTimer.selectedTaskId : null,
      started_at: new Date(startedAtMs).toISOString(),
      duration_minutes: durationMin,
      remaining_seconds: Math.max(0, Math.round(focusTimer.remainingSec)),
      is_running: true,
      is_paused: false,
      paused_at: null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (focusStateDbSupport.hasPauseColumns) {
        await upsertFocusStatePayload(payload);
      } else {
        await upsertFocusStatePayload({
          user_id: payload.user_id,
          task_id: payload.task_id,
          started_at: payload.started_at,
          duration_minutes: payload.duration_minutes,
          is_running: payload.is_running,
          updated_at: payload.updated_at,
        });
      }
    } catch (e) {
      if (focusStateDbSupport.hasPauseColumns && isMissingColumnError(e)) {
        focusStateDbSupport.hasPauseColumns = false;
        await upsertFocusStatePayload({
          user_id: payload.user_id,
          task_id: payload.task_id,
          started_at: payload.started_at,
          duration_minutes: payload.duration_minutes,
          is_running: payload.is_running,
          updated_at: payload.updated_at,
        });
        return;
      }
      console.error(e);
    }
  }

  async function persistFocusStatePaused() {
    const userId = await getCurrentUserId();
    if (!userId || !focusTimer.running || !focusTimer.paused) return;
    const payload = {
      user_id: userId,
      task_id: focusTimer.selectedTaskId ? focusTimer.selectedTaskId : null,
      started_at: new Date(Date.now()).toISOString(),
      duration_minutes: Math.max(1, Math.round(focusTimer.remainingSec / 60)),
      remaining_seconds: Math.max(0, Math.round(focusTimer.remainingSec)),
      is_running: false,
      is_paused: true,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      console.log("[focus] saved paused state:", payload);
      if (focusStateDbSupport.hasPauseColumns) {
        await upsertFocusStatePayload(payload);
      } else {
        await upsertFocusStatePayload({
          user_id: payload.user_id,
          task_id: payload.task_id,
          started_at: payload.started_at,
          duration_minutes: payload.duration_minutes,
          is_running: payload.is_running,
          updated_at: payload.updated_at,
        });
      }
    } catch (e) {
      if (focusStateDbSupport.hasPauseColumns && isMissingColumnError(e)) {
        focusStateDbSupport.hasPauseColumns = false;
        await upsertFocusStatePayload({
          user_id: payload.user_id,
          task_id: payload.task_id,
          started_at: payload.started_at,
          duration_minutes: payload.duration_minutes,
          is_running: payload.is_running,
          updated_at: payload.updated_at,
        });
        return;
      }
      console.error(e);
    }
  }

  async function clearFocusStateInSupabase() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { error } = await supabase.from("focus_state").delete().eq("user_id", userId);
      if (error) throw error;
    } catch (e) {
      console.error(e);
    }
  }

  async function completeExpiredFocusSessionFromRow(row) {
    const durationMin = Math.max(1, Number(row.duration_minutes) || 1);
    const startedAt = row.started_at ? new Date(row.started_at).getTime() : Date.now() - durationMin * 60 * 1000;
    const endedAt = startedAt + durationMin * 60 * 1000;
    const tid = row.task_id != null ? String(row.task_id) : null;
    const tk = tid ? tasks.find((t) => String(t.id) === tid) : null;
    const session = {
      id: uid(),
      taskId: tid,
      taskTitle: tk ? String(tk.title || "") : "",
      durationMin,
      completed: true,
      startedAt,
      endedAt,
      mode: focusTimer.mode,
      route: "",
    };
    focusHistory.unshift(session);
    focusHistory = focusHistory.slice(0, 120);
    await insertFocusSessionToSupabase(session);
    await clearFocusStateInSupabase();
    notifyFocusCompleted(session);
    renderFocusHistory();
    await refreshAchievements(true);
  }

  async function loadAchievementsFromSupabase() {
    achievementsState = { unlocked: {} };
    achievementRowIds = {};
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("achievements").select("id,key,unlocked_at").eq("user_id", userId);
      if (error) throw error;
      (data || []).forEach((row) => {
        const k = String(row.key || "");
        if (!k) return;
        const at = row.unlocked_at ? String(row.unlocked_at).slice(0, 10) : formatYMD(new Date());
        achievementsState.unlocked[k] = at;
        if (row.id) achievementRowIds[k] = String(row.id);
      });
    } catch (e) {
      console.error("loadAchievementsFromSupabase:", e);
    }
  }

  async function unlockAchievementToSupabase(achKey, unlockedAtYmd) {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    try {
      const { error } = await supabase.from("achievements").upsert(
        {
          user_id: userId,
          key: achKey,
          unlocked_at: `${unlockedAtYmd}T12:00:00.000Z`,
        },
        { onConflict: "user_id,key" }
      );
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("unlockAchievementToSupabase:", e);
      return false;
    }
  }

  async function loadBuddyStateFromSupabase() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("buddy_state").select("mood,last_interaction").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (data && data.mood) {
        try {
          const o = JSON.parse(data.mood);
          if (o && typeof o === "object") {
            buddy = {
              partnerName: String(o.partnerName || ""),
              partnerActiveDates: Array.isArray(o.partnerActiveDates) ? o.partnerActiveDates : [],
              buddyLongest: Number(o.buddyLongest) || 0,
              lastPartnerYmd: o.lastPartnerYmd || null,
              lastMeYmd: o.lastMeYmd || null,
            };
            return;
          }
        } catch (_) {}
      }
    } catch (e) {
      console.error("loadBuddyStateFromSupabase:", e);
    }
  }

  async function persistBuddyStateToSupabase() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const mood = JSON.stringify({
      partnerName: buddy.partnerName,
      partnerActiveDates: buddy.partnerActiveDates,
      buddyLongest: buddy.buddyLongest,
      lastPartnerYmd: buddy.lastPartnerYmd,
      lastMeYmd: buddy.lastMeYmd,
    });
    const lastTs =
      buddy.lastMeYmd || buddy.lastPartnerYmd
        ? new Date(`${buddy.lastMeYmd || buddy.lastPartnerYmd}T12:00:00`).toISOString()
        : new Date().toISOString();
    try {
      const { error } = await supabase.from("buddy_state").upsert(
        {
          user_id: userId,
          mood,
          last_interaction: lastTs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    } catch (e) {
      console.error("persistBuddyStateToSupabase:", e);
    }
  }

  async function loadPointsLogFromSupabase() {
    pointsLogCache = [];
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("points_log").select("id,points,source,day,ref_key").eq("user_id", userId);
      if (error) throw error;
      pointsLogCache = (data || []).map((r) => ({
        id: r.id ? String(r.id) : "",
        points: Number(r.points) || 0,
        source: String(r.source || ""),
        day: typeof r.day === "string" ? r.day : String(r.day || "").slice(0, 10),
        ref_key: String(r.ref_key || ""),
      }));
    } catch (e) {
      console.error("loadPointsLogFromSupabase:", e);
    }
  }

  async function insertPointsLog(payload) {
    return insertPointEntry(payload);
  }
  async function loadPoints() {
    await loadPointsLogFromSupabase();
    return pointsLogCache;
  }

  async function addPoints(points, source, dayYmd, refKey) {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    const p = Math.round(Number(points) || 0);
    const rk = String(refKey || "").trim();
    if (!p || !rk) return false;
    const day = String(dayYmd || "").slice(0, 10);
    try {
      const { error } = await supabase.from("points_log").upsert(
        {
          user_id: userId,
          points: p,
          source: String(source || "manual"),
          day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : formatYMD(new Date()),
          ref_key: rk,
        },
        { onConflict: "user_id,ref_key" }
      );
      if (error) throw error;
      await loadPointsLogFromSupabase();
      return true;
    } catch (e) {
      console.error("addPoints:", e);
      return false;
    }
  }

  async function deleteFocusSession(id) {
    const userId = await getCurrentUserId();
    if (!userId || !id) return false;
    try {
      const { error } = await supabase.from("focus_sessions").delete().eq("user_id", userId).eq("id", id);
      if (error) throw error;
      await loadFocusSessionsFromSupabase();
      return true;
    } catch (e) {
      console.error("deleteFocusSession:", e);
      return false;
    }
  }

  async function deleteAchievement(id) {
    const userId = await getCurrentUserId();
    if (!userId || !id) return false;
    try {
      const { error } = await supabase.from("achievements").delete().eq("user_id", userId).eq("id", id);
      if (error) throw error;
      await loadAchievementsFromSupabase();
      return true;
    } catch (e) {
      console.error("deleteAchievement:", e);
      return false;
    }
  }

  async function resetAchievements() {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    try {
      const { error } = await supabase.from("achievements").delete().eq("user_id", userId);
      if (error) throw error;
      achievementsState = { unlocked: {} };
      achievementRowIds = {};
      return true;
    } catch (e) {
      console.error("resetAchievements:", e);
      return false;
    }
  }

  async function resetBuddyState() {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    try {
      const { error } = await supabase.from("buddy_state").delete().eq("user_id", userId);
      if (error) throw error;
      buddy = {
        partnerName: "",
        partnerActiveDates: [],
        buddyLongest: 0,
        lastPartnerYmd: null,
        lastMeYmd: null,
      };
      await persistBuddyStateToSupabase();
      return true;
    } catch (e) {
      console.error("resetBuddyState:", e);
      return false;
    }
  }

  async function deletePointEntry(id) {
    const userId = await getCurrentUserId();
    if (!userId || !id) return false;
    try {
      const { error } = await supabase.from("points_log").delete().eq("user_id", userId).eq("id", id);
      if (error) throw error;
      await loadPointsLogFromSupabase();
      return true;
    } catch (e) {
      console.error("deletePointEntry:", e);
      return false;
    }
  }

  async function resetPoints() {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    try {
      const { error } = await supabase.from("points_log").delete().eq("user_id", userId);
      if (error) throw error;
      pointsLogCache = [];
      return true;
    } catch (e) {
      console.error("resetPoints:", e);
      return false;
    }
  }

  function sanitizeSelfcareEntry(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      grateful: String(src.grateful || ""),
      smile: String(src.smile || ""),
      well: String(src.well || ""),
      proud: String(src.proud || ""),
      self: String(src.self || ""),
      surprise: String(src.surprise || ""),
      updatedAt: Number(src.updatedAt) || Date.now(),
    };
  }

  /** Map Supabase `groups` row + joined members to the shape the UI expects (camelCase + aliases). */
  function normalizeGroupFromSupabase(row, allMem, userId) {
    const gid = row?.id != null ? String(row.id) : "";
    const inviteRaw = row?.invite_code != null ? row.invite_code : row?.code;
    const code = String(inviteRaw ?? "").trim();
    const oid = row?.owner_id != null ? String(row.owner_id) : "";
    const uidStr = userId != null ? String(userId) : "";
    const role = uidStr && oid === uidStr ? "owner" : "member";
    const members = (allMem || [])
      .filter((m) => String(m.group_id) === gid)
      .map((m) => {
        const p = m.profiles;
        const pr = Array.isArray(p) ? p[0] : p;
        const mid = m.user_id != null ? String(m.user_id) : "";
        return {
          id: mid,
          name: (pr && (pr.full_name || pr.email)) || (mid ? mid.slice(0, 8) : "?"),
        };
      });
    return {
      id: gid,
      name: String(row?.name ?? "").trim() || "Group",
      inviteCode: code,
      code,
      ownerId: oid,
      owner_id: row?.owner_id,
      role,
      members,
      createdAt: row?.created_at ? new Date(row.created_at).getTime() : Date.now(),
    };
  }

  async function loadGroupsFromSupabase() {
    console.log("[groups] loadGroupsFromSupabase start");
    let userId = await getCurrentUserId();
    if (!userId) {
      try {
        const s = readSessionRaw();
        if (s?.userId) userId = s.userId;
      } catch (_) {}
    }
    if (!userId) {
      try {
        const { data } = await supabase.auth.getSession();
        userId = data?.session?.user?.id || null;
      } catch (_) {}
    }
    if (!userId) {
      try {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      } catch (_) {}
    }
    console.log("[groups] currentUserId:", userId);
    if (!userId) {
      console.log("[groups] group_members:", []);
      console.log("[groups] groupIds:", []);
      console.log("[groups] loaded groups:", []);
      return [];
    }
    try {
      const { data: myRows, error: e1 } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
      const memberships = myRows || [];
      console.log("[groups] group_members:", memberships);
      if (e1) {
        logSupabasePostgrestError("loadGroupsFromSupabase membership", e1);
        console.error(e1);
        console.log("[groups] groupIds:", []);
        console.log("[groups] loaded groups:", []);
        return [];
      }
      const groupIds = [...new Set(memberships.map((r) => r.group_id).filter(Boolean))];
      console.log("[groups] groupIds:", groupIds);
      if (!groupIds.length) {
        console.log("[groups] loaded groups:", []);
        return [];
      }
      const { data: grps, error: e2 } = await supabase.from("groups").select("*").in("id", groupIds);
      if (e2) {
        logSupabasePostgrestError("loadGroupsFromSupabase groups", e2);
        console.error(e2);
        console.log("[groups] loaded groups:", []);
        return [];
      }
      if (!grps) {
        console.log("[groups] loaded groups:", []);
        return [];
      }
      let allMem = [];
      const { data: memRows, error: e3 } = await supabase
        .from("group_members")
        .select("user_id, group_id, profiles(full_name, email)")
        .in("group_id", groupIds);
      if (!e3 && memRows) {
        allMem = memRows;
      } else {
        if (e3) {
          logSupabasePostgrestError("loadGroupsFromSupabase members join", e3);
          console.warn("group_members+profiles join failed, using ids only:", e3.message);
        }
        const { data: fallback } = await supabase.from("group_members").select("user_id, group_id").in("group_id", groupIds);
        allMem = (fallback || []).map((r) => ({ ...r, profiles: null }));
      }

      const mapped = grps.map((row) => normalizeGroupFromSupabase(row, allMem, userId));
      console.log("[groups] loaded groups:", mapped);
      return mapped;
    } catch (e) {
      logSupabasePostgrestError("loadGroupsFromSupabase", e);
      console.error(e);
      console.log("[groups] loaded groups:", []);
      return [];
    }
  }
  async function loadGroups() {
    return loadGroupsFromSupabase();
  }

  async function loadState() {
    groups = await loadGroupsFromSupabase();
    if (!Array.isArray(groups)) groups = [];
    const myGroupIds = groups.map((g) => g.id);
    tasks = await loadTasksFromSupabase(myGroupIds);
    events = await loadEventsFromSupabase(myGroupIds);
    if (!Array.isArray(tasks)) tasks = [];
    if (!Array.isArray(events)) events = [];
    await loadSelfcareEntriesFromSupabase();
    await loadFocusSessionsFromSupabase();
    await loadFocusStateFromSupabaseAndRestore();
    await loadAchievementsFromSupabase();
    await loadBuddyStateFromSupabase();
    await loadPointsLogFromSupabase();
    activeGroupId = String(activeGroupId || "").trim() || null;
    if (activeGroupId && !groups.some((g) => String(g.id) === String(activeGroupId))) {
      activeGroupId = null;
    }
    if (!activeGroupId && groups.length > 0) {
      activeGroupId = String(groups[0].id);
      saveGroupsState();
    }
    const rawProfile = loadJSON(STORAGE_PROFILE, null);
    if (rawProfile && typeof rawProfile === "object") {
      profile = {
        id: String(rawProfile.id || ""),
        displayName: String(rawProfile.displayName || "You"),
        avatarId: String(rawProfile.avatarId || "p1"),
        avatarCustom: typeof rawProfile.avatarCustom === "string" ? rawProfile.avatarCustom : null,
        avatarUrl: typeof rawProfile.avatarUrl === "string" ? rawProfile.avatarUrl : "",
      };
    }
    const sessionUid = await getCurrentUserId();
    if (sessionUid) profile.id = sessionUid;
    if (!profile.id) {
      profile.id = uid();
      saveProfile();
    }
    await mergeProfileFromSupabase();
    await reconcilePointsLogWithSources();
    console.log("[groups] normalized groups:", groups);
    void renderGroups();
  }

  function loadAppPrefs() {
    const raw = loadJSON(STORAGE_APP_PREFS, null);
    appPrefs = { ...DEFAULT_APP_PREFS };
    if (raw && typeof raw === "object") {
      Object.keys(DEFAULT_APP_PREFS).forEach((k) => {
        if (k in raw) appPrefs[k] = raw[k];
      });
    } else {
      const legacy = localStorage.getItem(STORAGE_THEME);
      if (legacy === "dark" || legacy === "light") appPrefs.themeMode = legacy;
    }
    appPrefs.reminderLeadMinutes = Number(appPrefs.reminderLeadMinutes) || 30;
    appPrefs.streakMinTasksPerDay = Math.max(1, Math.min(20, Number(appPrefs.streakMinTasksPerDay) || 1));
    appPrefs.dailyReminderHour = Math.max(0, Math.min(23, Number(appPrefs.dailyReminderHour) || 9));
    appPrefs.dailyReminderMinute = Math.max(0, Math.min(59, Number(appPrefs.dailyReminderMinute) || 0));
    const allowedViews = ["dashboard", "tasks", "calendar", "selfcare", "focus", "achievements", "groups", "motivation"];
    if (!allowedViews.includes(appPrefs.defaultView)) appPrefs.defaultView = "dashboard";
    if (!["light", "dark", "system"].includes(appPrefs.themeMode)) appPrefs.themeMode = "light";
    const okAcc = ["default", "ocean", "rose", "mint", "amber"];
    if (!okAcc.includes(appPrefs.accent)) appPrefs.accent = "default";
    appPrefs.activeGroupId = typeof appPrefs.activeGroupId === "string" ? appPrefs.activeGroupId : "";
    applyPrefsSideEffects();
  }

  function saveAppPrefs() {
    try {
      localStorage.setItem(STORAGE_APP_PREFS, JSON.stringify(appPrefs));
    } catch (_) {}
    applyPrefsSideEffects();
  }

  function getResolvedTheme() {
    if (appPrefs.themeMode === "system") {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      return "light";
    }
    return appPrefs.themeMode === "dark" ? "dark" : "light";
  }

  function applyEffectiveThemeFromPrefs() {
    const eff = getResolvedTheme();
    document.documentElement.setAttribute("data-theme", eff);
    try {
      localStorage.setItem(STORAGE_THEME, eff);
    } catch (_) {}
  }

  function applyAccentFromPrefs() {
    const a = appPrefs.accent || "default";
    if (a && a !== "default") document.documentElement.setAttribute("data-accent", a);
    else document.documentElement.removeAttribute("data-accent");
  }

  function applyMotionFromPrefs() {
    const prm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reduce = !!appPrefs.reduceMotion || prm;
    document.documentElement.toggleAttribute("data-reduce-motion", reduce);
    document.documentElement.toggleAttribute("data-animations-off", !appPrefs.animationsEnabled);
  }

  function updateRecapButtonVisibility() {
    const on = !!(appPrefs.recapWeekEnabled || appPrefs.recapMonthEnabled);
    if (els.btnCalendarRecap) els.btnCalendarRecap.hidden = !on;
  }

  function updateBuddyCardVisibility() {
    if (els.buddyCard) els.buddyCard.hidden = !appPrefs.buddyCardVisible;
  }

  function applyPrefsSideEffects() {
    applyEffectiveThemeFromPrefs();
    applyAccentFromPrefs();
    applyMotionFromPrefs();
    updateRecapButtonVisibility();
    updateBuddyCardVisibility();
  }

  let systemThemeListenerAttached = false;
  function attachSystemThemeListener() {
    if (systemThemeListenerAttached || !window.matchMedia) return;
    systemThemeListenerAttached = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (appPrefs.themeMode === "system") applyEffectiveThemeFromPrefs();
    });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => applyMotionFromPrefs());
  }

  function saveGroupsState() {
    try {
      // Group selection is in-memory only; group data persists in Supabase.
      activeGroupId = activeGroupId ? String(activeGroupId) : null;
    } catch (e) {
      console.error("saveGroupsState:", e);
    }
  }

  function saveProfile() {
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  }

  async function persistProfileToSupabase() {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("[profile] persistProfileToSupabase: no authenticated user");
      return false;
    }
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      console.error("[profile] persistProfileToSupabase:", authErr || new Error("no auth user"));
      return false;
    }
    const email = userData.user.email || "";
    let avatar_url = "";
    if (profile.avatarCustom && String(profile.avatarCustom).startsWith("data:image")) {
      if (String(profile.avatarCustom).length > 450000) {
        console.error("[profile] persistProfileToSupabase: avatar image too large for profiles.avatar_url");
      } else {
        avatar_url = profile.avatarCustom;
      }
    } else if (profile.avatarUrl && /^https?:\/\//i.test(profile.avatarUrl)) {
      avatar_url = profile.avatarUrl;
    } else if (!profile.avatarCustom && profile.avatarId) {
      avatar_url = `flow://avatar/${profile.avatarId}`;
    }
    const payload = {
      id: userId,
      email,
      full_name: (profile.displayName || "").trim() || "You",
      avatar_url,
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error("[profile] persistProfileToSupabase Supabase error:", error);
      return false;
    }
    return true;
  }

  async function mergeProfileFromSupabase() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) {
        console.error("[profile] mergeProfileFromSupabase:", error);
        return;
      }
      profile.id = userId;
      if (!data) {
        try {
          const { data: userData, error: authErr } = await supabase.auth.getUser();
          if (!authErr && userData?.user) {
            const u = userData.user;
            const metaName =
              (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "";
            const emailLocal = (u.email || "").split("@")[0] || "";
            if (!(profile.displayName || "").trim() || profile.displayName === "You") {
              profile.displayName = (metaName || emailLocal || "You").trim() || "You";
            }
            const pic = (u.user_metadata && (u.user_metadata.avatar_url || u.user_metadata.picture)) || "";
            if (pic && /^https?:\/\//i.test(pic) && !profile.avatarCustom) {
              profile.avatarUrl = pic;
            }
          }
        } catch (authEx) {
          console.error("[profile] mergeProfileFromSupabase OAuth enrich:", authEx);
        }
        saveProfile();
        await persistProfileToSupabase();
        return;
      }
      applyProfileRowFromSupabasePayload(data);
    } catch (e) {
      console.error("[profile] mergeProfileFromSupabase:", e);
    }
  }

  function getRemindedKeys() {
    return new Set(loadJSON(STORAGE_REMINDED, []));
  }

  function addRemindedKey(key) {
    const arr = [...getRemindedKeys(), key];
    localStorage.setItem(STORAGE_REMINDED, JSON.stringify(arr.slice(-500)));
  }

  function randomGroupCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function collectActivityDays() {
    const days = new Set();
    const min = Math.max(1, Math.min(20, Number(appPrefs.streakMinTasksPerDay) || 1));
    const byDay = {};
    tasks.forEach((t) => {
      if (t.completed && t.completedAt) {
        const d = String(t.completedAt).slice(0, 10);
        byDay[d] = (byDay[d] || 0) + 1;
      }
    });
    Object.entries(byDay).forEach(([d, n]) => {
      if (n >= min) days.add(d);
    });
    events.forEach((ev) => {
      if (!ev.allDay && ev.startTime && ev.streakDone) days.add(ev.date);
    });
    return days;
  }

  function currentStreakFromActivitySet(activityDays) {
    const today = formatYMD(new Date());
    let start = new Date();
    if (!activityDays.has(today)) start = addDays(start, -1);
    let count = 0;
    let d = new Date(start);
    while (activityDays.has(formatYMD(d))) {
      count++;
      d = addDays(d, -1);
    }
    return count;
  }

  function longestConsecutiveInSet(daySet) {
    if (daySet.size === 0) return 0;
    const sorted = [...daySet].sort();
    let best = 0;
    let cur = 0;
    let prev = /** @type {Date|null} */ (null);
    for (const ymd of sorted) {
      const d = parseYMD(ymd);
      if (prev && addDays(prev, 1).getTime() === d.getTime()) cur++;
      else cur = 1;
      prev = d;
      if (cur > best) best = cur;
    }
    return best;
  }

  function getBuddyActivityDays() {
    const me = collectActivityDays();
    const out = new Set();
    buddy.partnerActiveDates.forEach((ymd) => {
      if (me.has(ymd)) out.add(ymd);
    });
    return out;
  }

  function maybeUpdateBuddyRecord() {
    const b = getBuddyActivityDays();
    const lh = longestConsecutiveInSet(b);
    if (lh > buddy.buddyLongest) {
      buddy.buddyLongest = lh;
      void persistBuddyStateToSupabase();
    }
  }

  function streakSnapshot() {
    const activityDays = collectActivityDays();
    const current = currentStreakFromActivitySet(activityDays);
    const longest = longestConsecutiveInSet(activityDays);
    const b = getBuddyActivityDays();
    const buddyCurrent = currentStreakFromActivitySet(b);
    return {
      activityDays,
      current,
      longest,
      buddyCurrent,
      buddyLongest: buddy.buddyLongest,
    };
  }

  function todayHasActivity() {
    const today = formatYMD(new Date());
    return collectActivityDays().has(today);
  }

  function playToastChime() {
    if (!appPrefs.soundsEnabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 784;
      g.gain.value = 0.035;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.07);
    } catch (_) {}
  }

  function showToast(message, opts) {
    const stack = els.toastStack;
    if (!stack) return;
    playToastChime();
    const el = document.createElement("div");
    el.className = "toast" + (opts && opts.type === "accent" ? " toast--accent" : "");
    el.setAttribute("role", "status");
    el.textContent = message;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add("toast--in"));
    setTimeout(() => {
      el.classList.remove("toast--in");
      el.classList.add("toast--out");
      setTimeout(() => el.remove(), 280);
    }, 4200);
  }

  function updateNotificationStatusText() {
    if (!els.notificationStatus) return;
    if (typeof Notification === "undefined") {
      els.notificationStatus.textContent = t("settings.notifDenied");
      return;
    }
    if (Notification.permission === "granted") els.notificationStatus.textContent = t("settings.notifGranted");
    else if (Notification.permission === "denied") els.notificationStatus.textContent = t("settings.notifDenied");
    else els.notificationStatus.textContent = t("settings.notifDefault");
  }

  /** Browser Notification API — respects master toggle; uses stable `tag` to limit duplicates at OS level. */
  function sendBrowserNotification(title, body, tag) {
    if (!appPrefs.notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, tag: tag || "flow-generic" });
    } catch (_) {}
  }

  function maybeNotifyEvent(ev) {
    if (!appPrefs.notificationsEnabled) return;
    const toastTitle = t("toast.reminderTitle");
    const timeShown = formatTimeForDisplay(ev.startTime || "");
    showToast(`${toastTitle}: ${ev.title} · ${timeShown}`, { type: "accent" });
    const lead = Number(appPrefs.reminderLeadMinutes) || 30;
    sendBrowserNotification(ev.title, t("notif.eventBodySoon"), `flow-event-${ev.id}-${ev.date}-lead${lead}`);
  }

  function getReminderLeadMs() {
    const m = Number(appPrefs.reminderLeadMinutes);
    const ok = [5, 10, 15, 30, 60];
    if (ok.includes(m)) return m * 60 * 1000;
    return 30 * 60 * 1000;
  }

  function checkEventReminders() {
    if (!appPrefs.notificationsEnabled || !appPrefs.remindEvents) return;
    const now = Date.now();
    const reminded = getRemindedKeys();
    const lead = getReminderLeadMs();
    events.forEach((ev) => {
      if (ev.allDay || !ev.startTime || !ev.date) return;
      const start = new Date(`${ev.date}T${ev.startTime}:00`).getTime();
      if (Number.isNaN(start)) return;
      const fireAt = start - lead;
      const key = `${ev.id}__${ev.date}`;
      /* Wider window so a 60s tick still catches the reminder slot */
      if (now < fireAt || now > fireAt + 180000) return;
      if (reminded.has(key)) return;
      reminded.add(key);
      addRemindedKey(key);
      maybeNotifyEvent(ev);
    });
  }

  function checkTaskDueReminders() {
    if (!appPrefs.notificationsEnabled || !appPrefs.remindTasks) return;
    const today = formatYMD(new Date());
    const key = `flow_task_due_toast_${today}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch (_) {
      return;
    }
    const dueToday = tasks.filter((tk) => !tk.completed && tk.dueDate === today);
    if (dueToday.length === 0) return;
    try {
      localStorage.setItem(key, "1");
    } catch (_) {}
    const msg = t("settings.taskDueTodayToast").replace("{n}", String(dueToday.length));
    showToast(msg, { type: "accent" });
    sendBrowserNotification(
      t("notif.tasksDueTitle"),
      t("notif.tasksDueBody").replace("{n}", String(dueToday.length)),
      `flow-tasks-due-${today}`
    );
  }

  function checkDailyOpenTasksReminder() {
    if (!appPrefs.notificationsEnabled || !appPrefs.dailyOpenTasksReminder) return;
    const now = new Date();
    if (now.getHours() !== appPrefs.dailyReminderHour || now.getMinutes() !== appPrefs.dailyReminderMinute) return;
    const today = formatYMD(now);
    const sk = `flow_open_tasks_daily_${today}`;
    if (sessionStorage.getItem(sk)) return;
    const n = openTasksCount();
    if (n === 0) return;
    sessionStorage.setItem(sk, "1");
    showToast(t("settings.dailyOpenTasksToast").replace("{n}", String(n)), { type: "accent" });
  }

  function maybeEveningStreakNudge() {
    if (!appPrefs.notificationsEnabled || !appPrefs.streakEveningNudge) return;
    if (new Date().getHours() < 18) return;
    if (todayHasActivity()) return;
    const today = formatYMD(new Date());
    const sk = `flow_streak_nudge_${today}`;
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, "1");
    showToast(t("settings.streakNudgeToast"), { type: "accent" });
  }

  function runReminderTick() {
    checkEventReminders();
    checkTaskDueReminders();
    checkDailyOpenTasksReminder();
    maybeEveningStreakNudge();
  }

  function syncBuddyPartnerCheckbox() {
    const today = formatYMD(new Date());
    if (els.buddyPartnerActiveToday) {
      els.buddyPartnerActiveToday.checked = buddy.partnerActiveDates.includes(today);
    }
  }

  function touchMeActivityYmd(ymd) {
    buddy.lastMeYmd = ymd;
    void persistBuddyStateToSupabase();
  }

  function renderMotivation() {
    maybeUpdateBuddyRecord();
    const snap = streakSnapshot();
    if (els.streakCurrent) els.streakCurrent.textContent = String(snap.current);
    if (els.streakLongest) els.streakLongest.textContent = String(snap.longest);
    if (els.streakTodayText) {
      els.streakTodayText.textContent = todayHasActivity() ? t("streak.todayYes") : t("streak.todayNo");
      els.streakTodayText.classList.toggle("badge--success", todayHasActivity());
      els.streakTodayText.classList.toggle("badge--warn", !todayHasActivity());
    }
    if (els.streakWeekDots) {
      els.streakWeekDots.innerHTML = "";
      const label = document.createElement("span");
      label.className = "streak-week-label muted small";
      label.textContent = t("streak.weekProgress");
      els.streakWeekDots.appendChild(label);
      const row = document.createElement("div");
      row.className = "streak-dots";
      for (let i = 6; i >= 0; i--) {
        const d = addDays(new Date(), -i);
        const ymd = formatYMD(d);
        const dot = document.createElement("span");
        dot.className = "streak-dot" + (snap.activityDays.has(ymd) ? " streak-dot--on" : "");
        dot.title = ymd;
        row.appendChild(dot);
      }
      els.streakWeekDots.appendChild(row);
    }
    if (els.buddyNameInput) els.buddyNameInput.value = buddy.partnerName;
    if (els.buddyStreakCurrent) els.buddyStreakCurrent.textContent = String(snap.buddyCurrent);
    if (els.buddyStreakLongest) els.buddyStreakLongest.textContent = String(snap.buddyLongest);
    const today = formatYMD(new Date());
    const meToday = todayHasActivity();
    if (els.buddyMeStatus) {
      els.buddyMeStatus.textContent = `${t("buddy.me")}: ${meToday ? "✓" : "—"}`;
    }
    if (els.buddyPartnerStatus) {
      const pToday = buddy.partnerActiveDates.includes(today);
      els.buddyPartnerStatus.textContent = `${buddy.partnerName || t("buddy.partner")}: ${pToday ? "✓" : "—"}`;
    }
    syncBuddyPartnerCheckbox();
  }

  function getInviteUrl(code) {
    const u = new URL(window.location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("join", code);
    return u.toString();
  }

  async function renderGroups() {
    console.log("[groups] renderGroups called with:", groups);
    let g = activeGroupId ? findGroupInState(activeGroupId) : null;
    if (!g && groups.length > 0) {
      activeGroupId = String(groups[0].id);
      saveGroupsState();
      g = groups[0];
    }
    const emptyEl = els.groupDetailEmpty || document.getElementById("groupDetailEmpty");
    const bodyEl = els.groupDetailBody || document.getElementById("groupDetailBody");
    if (!emptyEl || !bodyEl) return;
    if (!g) {
      emptyEl.hidden = false;
      bodyEl.hidden = true;
      if (els.settingsModal && !els.settingsModal.hidden) renderSettingsGroupSection();
      return;
    }
    emptyEl.hidden = true;
    bodyEl.hidden = false;
    const displayCode = g.code || g.inviteCode || "";
    if (els.groupDetailName) els.groupDetailName.textContent = g.name || "";
    if (els.groupDetailCode) els.groupDetailCode.textContent = displayCode;
    if (els.groupInviteLink) els.groupInviteLink.value = getInviteUrl(displayCode);
    try {
      await renderGroupRanking(g);
    } catch (err) {
      console.error("[groups] renderGroupRanking:", err);
    }
    if (els.settingsModal && !els.settingsModal.hidden) renderSettingsGroupSection();
  }

  async function joinGroupByCode(code) {
    const raw = String(code || "").trim();
    if (!raw) return false;
    const { data, error } = await supabase.rpc("join_group_by_code", { p_code: raw });
    if (error) {
      logSupabasePostgrestError("joinGroupByCode rpc", error);
      console.error(error);
      return false;
    }
    if (!data || !data.length) return false;
    groups = await loadGroupsFromSupabase();
    const gid = data[0].gid;
    const g = findGroupInState(gid);
    if (g) {
      activeGroupId = String(g.id);
      saveGroupsState();
    }
    await refreshAchievements(true);
    await renderGroups();
    showToast(t("groups.joined"));
    void startSupabaseRealtime();
    return true;
  }
  async function joinGroup(code) {
    return joinGroupByCode(code);
  }

  async function leaveGroup() {
    if (!activeGroupId) return;
    const userId = await getCurrentUserId();
    if (!userId) return;
    const gid = activeGroupId;
    const { error } = await supabase.from("group_members").delete().eq("group_id", gid).eq("user_id", userId);
    if (error) {
      logSupabasePostgrestError("leaveGroup", error);
      console.error(error);
    }
    activeGroupId = null;
    groups = await loadGroupsFromSupabase();
    saveGroupsState();
    await renderGroups();
    showToast(t("settings.leftGroup"));
    void startSupabaseRealtime();
  }

  async function createGroup(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const userId = await getCurrentUserId();
    if (!userId) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const inviteCode = randomGroupCode();
      const gid = crypto.randomUUID();
      const { error: insErr } = await supabase.from("groups").insert({
        id: gid,
        name: trimmed,
        owner_id: userId,
        invite_code: inviteCode,
      });
      if (insErr) {
        const msg = String(insErr.message || "");
        if (msg.includes("invite") || insErr.code === "23505") continue;
        logSupabasePostgrestError("createGroup groups.insert", insErr);
        console.error(insErr);
        return null;
      }
      const { error: memErr } = await supabase.from("group_members").insert({ group_id: gid, user_id: userId });
      if (memErr) {
        logSupabasePostgrestError("createGroup group_members.insert", memErr);
        console.error(memErr);
        await supabase.from("groups").delete().eq("id", gid);
        return null;
      }
      return { id: gid, invite_code: inviteCode };
    }
    return null;
  }

  async function parseJoinFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search);
      const join = params.get("join");
      if (!join) return false;
      if (els.groupJoinCode) els.groupJoinCode.value = join.trim();
      const clean = new URL(window.location.href);
      clean.searchParams.delete("join");
      window.history.replaceState({}, "", clean.pathname + clean.search);
      setView("groups");
      const ok = await joinGroupByCode(join);
      if (!ok) showToast(t("groups.invalidCode"));
      return true;
    } catch (_) {}
    return false;
  }

  async function requestNotificationPermission() {
    if (typeof Notification === "undefined") {
      updateNotificationStatusText();
      return;
    }
    try {
      await Notification.requestPermission();
    } catch (_) {}
    updateNotificationStatusText();
  }

  /** One-time permission prompt shortly after first app load (master notifications must be on). */
  function scheduleFirstRunNotificationPermission() {
    if (typeof Notification === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_NOTIF_FIRST_LAUNCH_ASKED)) return;
    } catch (_) {
      return;
    }
    setTimeout(() => {
      if (!appPrefs.notificationsEnabled) return;
      if (Notification.permission !== "default") return;
      try {
        localStorage.setItem(STORAGE_NOTIF_FIRST_LAUNCH_ASKED, "1");
      } catch (_) {}
      void Notification.requestPermission()
        .then(() => updateNotificationStatusText())
        .catch(() => updateNotificationStatusText());
    }, 2800);
  }

  // Week starts Sunday (0) — matches typical month grid
  function startOfWeek(d) {
    const x = startOfDay(d);
    const day = x.getDay();
    return addDays(x, -day);
  }

  function endOfWeek(d) {
    return addDays(startOfWeek(d), 6);
  }

  function isSameYMD(a, b) {
    return formatYMD(a) === formatYMD(b);
  }

  function longDateLabel(ymd) {
    const d = parseYMD(ymd);
    const st = appPrefs.dateStyle || "locale";
    if (st === "iso") return ymd;
    if (st === "dmy")
      return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    return d.toLocaleDateString(getLocaleTag(), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function shortDateLabel(ymd) {
    const d = parseYMD(ymd);
    const st = appPrefs.dateStyle || "locale";
    if (st === "iso") return ymd;
    if (st === "dmy")
      return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    return d.toLocaleDateString(getLocaleTag(), { month: "short", day: "numeric" });
  }

  function formatDayHeading(ymd) {
    const d = parseYMD(ymd);
    return d.toLocaleDateString(getLocaleTag(), { weekday: "long" });
  }

  // ——— Task helpers ———

  function openTasksCount() {
    return tasks.filter((t) => !t.completed).length;
  }

  function dueSoonCount() {
    const today = startOfDay(new Date());
    const limit = addDays(today, 7);
    return tasks.filter((t) => {
      if (t.completed || !t.dueDate) return false;
      const due = parseYMD(t.dueDate);
      return due >= today && due <= limit;
    }).length;
  }

  function eventsInCurrentWeekCount() {
    const ws = startOfWeek(new Date());
    const we = endOfWeek(new Date());
    return events.filter((ev) => {
      const ed = parseYMD(ev.date);
      return ed >= ws && ed <= we;
    }).length;
  }

  function sortTasksForDisplay(list, sortKey) {
    const copy = [...list];
    if (sortKey === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      copy.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
    } else if (sortKey === "created") {
      copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      // due: tasks with due date first, soonest first; nulls last
      copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return (b.createdAt || 0) - (a.createdAt || 0);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    }
    return copy;
  }

  function filteredTasks() {
    const f = els.taskFilter.value;
    let list = tasks;
    if (f === "open") list = tasks.filter((t) => !t.completed);
    else if (f === "done") list = tasks.filter((t) => t.completed);
    return sortTasksForDisplay(list, els.taskSort.value);
  }

  function upcomingTasks(limit = 5) {
    const open = tasks.filter((t) => !t.completed);
    return sortTasksForDisplay(open, "due").slice(0, limit);
  }

  function upcomingEvents(limit = 6) {
    const today = startOfDay(new Date());
    const inSeven = addDays(today, 14);
    return events
      .filter((ev) => {
        const ed = parseYMD(ev.date);
        return ed >= today && ed <= inSeven;
      })
      .sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        return compareEventsChronological(a, b);
      })
      .slice(0, limit);
  }

  function tasksForDay(ymd) {
    return tasks.filter((t) => t.dueDate === ymd);
  }

  /**
   * Daily goal status from tasks due that day (tasks loaded from Supabase).
   * neutral: no tasks due, future day, or today with open tasks
   * success: all due tasks completed (today or past)
   * fail: past day with at least one incomplete task
   */
  function getDayGoalStatus(ymd, todayStr) {
    const list = tasksForDay(ymd);
    if (list.length === 0) return "neutral";
    const allDone = list.every((t) => t.completed);
    if (ymd > todayStr) return "neutral";
    if (ymd === todayStr) return allDone ? "success" : "neutral";
    return allDone ? "success" : "fail";
  }

  function getMonthYmds(anchor) {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let d = 1; d <= last; d++) {
      out.push(formatYMD(new Date(y, m, d)));
    }
    return out;
  }

  function aggregateRecapForYmds(ymds, todayStr) {
    let success = 0;
    let fail = 0;
    let neutral = 0;
    ymds.forEach((ymd) => {
      const st = getDayGoalStatus(ymd, todayStr);
      if (st === "success") success += 1;
      else if (st === "fail") fail += 1;
      else neutral += 1;
    });
    return { success, fail, neutral, total: ymds.length };
  }

  function monthKeyFromYmd(ymd) {
    return ymd.slice(0, 7);
  }

  function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function collectMonthKeysForPoints() {
    const set = new Set();
    set.add(currentMonthKey());
    tasks.forEach((t) => {
      if (t.dueDate) set.add(monthKeyFromYmd(t.dueDate));
    });
    events.forEach((e) => {
      if (e.date) set.add(monthKeyFromYmd(e.date));
    });
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return [...set];
  }

  /**
   * Writes derived task/event/goal points into Supabase `points_log` only (no local store).
   * Idempotent via `ref_key`; refreshes `pointsLogCache` from the server.
   */
  async function reconcilePointsLogWithSources() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const todayStr = formatYMD(startOfDay(new Date()));
    /** @type {{ref_key:string,points:number,source:string,day:string}[]} */
    const desired = [];
    collectMonthKeysForPoints().forEach((monthKey) => {
      const parts = monthKey.split("-");
      const y = Number(parts[0]);
      const mo = Number(parts[1]);
      if (!y || !mo) return;
      tasks.forEach((t) => {
        if (!t.completed || !t.dueDate) return;
        if (monthKeyFromYmd(t.dueDate) !== monthKey) return;
        desired.push({
          ref_key: `task:${t.id}`,
          points: POINTS_PER_TASK_DONE,
          source: "task",
          day: String(t.dueDate).slice(0, 10),
        });
      });
      events.forEach((e) => {
        if (e.allDay || !e.streakDone || !e.date) return;
        if (monthKeyFromYmd(e.date) !== monthKey) return;
        desired.push({
          ref_key: `event:${e.id}`,
          points: POINTS_PER_EVENT_STREAK,
          source: "event",
          day: String(e.date).slice(0, 10),
        });
      });
      const lastDay = new Date(y, mo, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const ymd = formatYMD(new Date(y, mo - 1, day));
        if (ymd > todayStr) continue;
        if (getDayGoalStatus(ymd, todayStr) === "success") {
          desired.push({
            ref_key: `goal:${ymd}`,
            points: POINTS_PER_GOAL_DAY,
            source: "goal",
            day: ymd,
          });
        }
      }
    });
    const wantKeys = new Set(desired.map((d) => d.ref_key));
    try {
      const { data: existing, error: e1 } = await supabase.from("points_log").select("ref_key").eq("user_id", userId);
      if (e1) throw e1;
      const have = new Set((existing || []).map((r) => r.ref_key));
      const toInsert = desired
        .filter((d) => !have.has(d.ref_key))
        .map((d) => ({
          user_id: userId,
          points: d.points,
          source: d.source,
          day: d.day,
          ref_key: d.ref_key,
          created_at: new Date().toISOString(),
        }));
      if (toInsert.length) {
        const { error: e2 } = await supabase.from("points_log").insert(toInsert);
        if (e2) throw e2;
      }
      const stale = [...have].filter((k) => !wantKeys.has(k));
      for (const ref_key of stale) {
        await supabase.from("points_log").delete().eq("user_id", userId).eq("ref_key", ref_key);
      }
      await loadPointsLogFromSupabase();
    } catch (e) {
      console.error("reconcilePointsLogWithSources:", e);
    }
  }

  function getMonthPointsTotal(monthKey) {
    return pointsLogCache
      .filter((r) => (r.day || "").slice(0, 7) === monthKey)
      .reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  }

  /** Points for a member this month (current user: sum from `pointsLogCache` / Supabase `points_log`). */
  function getMemberMonthPoints(memberId, monthKey) {
    if (memberId !== profile.id) return 0;
    return getMonthPointsTotal(monthKey);
  }

  function memberInitials(name) {
    const s = String(name || "").trim();
    if (!s) return "?";
    const p = s.split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }

  function fillRankingAvatar(host, memberId, displayName) {
    if (!host) return;
    host.innerHTML = "";
    host.className = "avatar avatar--rank";
    if (memberId === profile.id) {
      fillAvatarHost(host);
      return;
    }
    host.textContent = memberInitials(displayName);
    host.classList.add("avatar--initials");
  }

  async function renderGroupRanking(g) {
    await reconcilePointsLogWithSources();
    const monthKey = currentMonthKey();
    if (els.groupRankingMonth) {
      els.groupRankingMonth.textContent = new Date().toLocaleDateString(getLocaleTag(), {
        month: "long",
        year: "numeric",
      });
    }

    const rows = (Array.isArray(g.members) ? g.members : [])
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        points: getMemberMonthPoints(m.id, monthKey),
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const leaderPts = rows.length ? rows[0].points : 0;
    const myRow = rows.find((r) => r.id === profile.id);

    if (els.groupRankingYou) {
      if (myRow) {
        const rank = rows.indexOf(myRow) + 1;
        const gap = leaderPts - myRow.points;
        els.groupRankingYou.hidden = false;
        if (rank === 1) {
          els.groupRankingYou.textContent = t("groups.rankingYouLead").replace("{pts}", String(myRow.points));
        } else {
          els.groupRankingYou.textContent = t("groups.rankingYou")
            .replace("{rank}", String(rank))
            .replace("{pts}", String(myRow.points))
            .replace("{gap}", String(gap));
        }
      } else {
        els.groupRankingYou.hidden = true;
      }
    }

    if (!els.groupRankingList) return;
    els.groupRankingList.innerHTML = "";
    rows.forEach((row, i) => {
      const rank = i + 1;
      const li = document.createElement("li");
      li.className = "group-rank-row";
      if (rank <= 3) li.classList.add(`group-rank-row--top${rank}`);

      const pos = document.createElement("span");
      pos.className = "group-rank-pos";
      pos.textContent = String(rank);

      const avWrap = document.createElement("span");
      avWrap.className = "group-rank-avatar-wrap";
      fillRankingAvatar(avWrap, row.id, row.name);

      const meta = document.createElement("div");
      meta.className = "group-rank-meta";
      const nm = document.createElement("span");
      nm.className = "group-rank-name";
      nm.textContent = row.name;
      meta.appendChild(nm);
      if (rank > 1 && leaderPts > 0) {
        const gapEl = document.createElement("span");
        gapEl.className = "group-rank-gap muted small";
        gapEl.textContent = t("groups.rankingBehind").replace("{n}", String(leaderPts - row.points));
        meta.appendChild(gapEl);
      }

      const pts = document.createElement("span");
      pts.className = "group-rank-pts";
      pts.textContent = `${row.points} ${t("groups.rankingPtsShort")}`;

      li.appendChild(pos);
      li.appendChild(avWrap);
      li.appendChild(meta);
      li.appendChild(pts);
      els.groupRankingList.appendChild(li);
    });
  }

  function compareEventsChronological(a, b) {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const ta = a.allDay ? "00:00" : a.startTime || "99:99";
    const tb = b.allDay ? "00:00" : b.startTime || "99:99";
    const timeCmp = ta.localeCompare(tb);
    if (timeCmp !== 0) return timeCmp;
    const titleCmp = (a.title || "").localeCompare(b.title || "");
    if (titleCmp !== 0) return titleCmp;
    return (a.id || "").localeCompare(b.id || "");
  }

  function eventsForDay(ymd) {
    return events.filter((ev) => ev.date === ymd).sort(compareEventsChronological);
  }

  function calendarDotsForDay(ymd) {
    const openTasks = tasksForDay(ymd).filter((t) => !t.completed).length;
    const evs = eventsForDay(ymd);
    const dots = [];
    evs.slice(0, 4).forEach((ev) => dots.push(`dot-${ev.color}`));
    if (openTasks > 0 && dots.length < 5) dots.push("dot-sky");
    const extra = evs.length + (openTasks > 0 ? 1 : 0) - dots.length;
    return { dots, more: extra > 0 ? extra : 0 };
  }

  function fillAvatarHost(host) {
    if (!host) return;
    host.innerHTML = "";
  
    // zuerst echtes Profilbild aus Supabase / Google
    if (profile.avatarUrl) {
      const img = document.createElement("img");
      img.className = "avatar-img";
      img.src = profile.avatarUrl;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "50%";
      host.appendChild(img);
      return;
    }
  
    // dann lokal hochgeladenes Bild
    if (profile.avatarCustom) {
      const img = document.createElement("img");
      img.className = "avatar-img";
      img.src = profile.avatarCustom;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "50%";
      host.appendChild(img);
      return;
    }
  
    // ganz am Ende nur noch der alte App-Fallback
    const id = AVATAR_PRESETS[profile.avatarId] ? profile.avatarId : "p1";
    host.innerHTML = AVATAR_PRESETS[id];
  }

  function applyProfileAvatars() {
    fillAvatarHost(els.sidebarAvatarHost);
    fillAvatarHost(els.settingsAvatarPreview);
    fillAvatarHost(els.coachAvatarHost);
    updateSidebarUserName();
  }

  function getDisplayNameForUi() {
    const n = (profile.displayName || "").trim();
    if (n) return n;
    return t("profile.defaultName");
  }

  function updateSidebarUserName() {
    if (!els.sidebarUserName) return;
    const name = getDisplayNameForUi();
    els.sidebarUserName.textContent = name;
    els.sidebarUserName.setAttribute("title", name);
  }

  function syncAvatarPickerActive() {
    if (!els.avatarPicker) return;
    els.avatarPicker.querySelectorAll(".avatar-pick").forEach((b) => {
      if (b.dataset.avatarUpload === "1") {
        b.classList.toggle("is-active", Boolean(profile.avatarCustom));
        b.setAttribute("aria-pressed", profile.avatarCustom ? "true" : "false");
        return;
      }
      const id = b.dataset.avatarId;
      const active = Boolean(!profile.avatarCustom && profile.avatarId === id);
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function initAvatarPicker() {
    if (!els.avatarPicker) return;
    els.avatarPicker.innerHTML = "";
    const ids = Object.keys(AVATAR_PRESETS);
    ids.forEach((id, index) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-pick";
      b.dataset.avatarId = id;
      b.setAttribute("aria-label", `${t("settings.avatarOptionPrefix")} ${index + 1}`);
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = AVATAR_PRESETS[id];
      b.addEventListener("click", () => {
        profile.avatarCustom = null;
        profile.avatarId = id;
        profile.avatarUrl = "";
        saveProfile();
        syncAvatarPickerActive();
        applyProfileAvatars();
        void persistProfileToSupabase();
      });
      els.avatarPicker.appendChild(b);
    });

    const uploadTile = document.createElement("button");
    uploadTile.type = "button";
    uploadTile.className = "avatar-pick avatar-pick--upload";
    uploadTile.dataset.avatarUpload = "1";
    uploadTile.setAttribute("aria-label", t("settings.avatarUpload"));
    uploadTile.setAttribute("aria-pressed", "false");
    uploadTile.innerHTML =
      '<svg class="avatar-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v12M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<span class="avatar-upload-label" data-i18n="settings.avatarUploadShort"></span>';
    uploadTile.addEventListener("click", () => {
      els.avatarFileInput?.click();
    });
    els.avatarPicker.appendChild(uploadTile);

    applyDomI18n();
    syncAvatarPickerActive();
  }

  function processAvatarFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const s = 128;
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.min(s / img.width, s / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        let q = 0.82;
        let dataUrl = canvas.toDataURL("image/jpeg", q);
        while (dataUrl.length > 380000 && q > 0.45) {
          q -= 0.07;
          dataUrl = canvas.toDataURL("image/jpeg", q);
        }
        profile.avatarCustom = dataUrl;
        profile.avatarUrl = "";
        saveProfile();
        syncAvatarPickerActive();
        applyProfileAvatars();
        void persistProfileToSupabase();
      };
      img.onerror = () => showToast(t("settings.avatarError"));
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  function resetGroupCreateModal() {
    lastGroupShareContext = null;
    if (els.groupCreateStepForm) els.groupCreateStepForm.hidden = false;
    if (els.groupCreateStepSuccess) els.groupCreateStepSuccess.hidden = true;
    if (els.shareFallbackHint) els.shareFallbackHint.hidden = true;
    if (els.groupModalName) els.groupModalName.value = "";
  }

  function openGroupCreateModal() {
    applyDomI18n();
    resetGroupCreateModal();
    showModal(els.groupCreateModal, els.groupCreateModalBackdrop);
    setTimeout(() => {
      try {
        els.groupModalName?.focus();
      } catch (_) {}
    }, 80);
  }

  function closeGroupCreateModal() {
    hideModal(els.groupCreateModal, els.groupCreateModalBackdrop);
    resetGroupCreateModal();
  }

  function copyTextToClipboard(text) {
    return new Promise((resolve) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => resolve(true))
          .catch(() => resolve(fallbackCopy(text)));
        return;
      }
      resolve(fallbackCopy(text));
    });
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function runShareAction(kind) {
    const ctx = lastGroupShareContext;
    if (!ctx) return;
    const text = t("share.message")
      .replace("{name}", ctx.name)
      .replace("{code}", ctx.code)
      .replace("{link}", ctx.link);
    if (kind === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (kind === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ctx.link)}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    if (kind === "sms") {
      window.location.href = `sms:?body=${encodeURIComponent(text)}`;
      return;
    }
    if (kind === "instagram") {
      copyTextToClipboard(ctx.link).then((ok) => {
        if (ok) showToast(t("share.instagramHint"));
        if (els.shareFallbackHint) els.shareFallbackHint.hidden = false;
      });
      return;
    }
    if (kind === "native") {
      if (navigator.share) {
        navigator
          .share({ title: ctx.name, text, url: ctx.link })
          .catch(() => copyTextToClipboard(`${ctx.code}\n${ctx.link}`).then((ok) => ok && showToast(t("groups.copied"))));
        return;
      }
      copyTextToClipboard(`${ctx.code}\n${ctx.link}`).then((ok) => ok && showToast(t("groups.copied")));
      return;
    }
    if (kind === "copy") {
      copyTextToClipboard(`${ctx.code}\n${ctx.link}`).then((ok) => ok && showToast(t("groups.copied")));
    }
  }

  async function handleGroupCreateSubmit(e) {
    e.preventDefault();
    const name = (els.groupModalName && els.groupModalName.value ? els.groupModalName.value : "").trim();
    if (!name) {
      showToast(t("groups.nameRequired"));
      els.groupModalName?.focus();
      return;
    }
    const created = await createGroup(name);
    if (!created) {
      showToast(t("groups.createFailed"));
      return;
    }
    groups = await loadGroupsFromSupabase();
    activeGroupId = String(created.id);
    saveGroupsState();
    const g = findGroupInState(created.id);
    const displayCode = g ? g.code || g.inviteCode : created.invite_code;
    const link = getInviteUrl(displayCode);
    lastGroupShareContext = { name, code: displayCode, link };
    if (els.groupCreateStepForm) els.groupCreateStepForm.hidden = true;
    if (els.groupCreateStepSuccess) els.groupCreateStepSuccess.hidden = false;
    if (els.groupModalSuccessCode) els.groupModalSuccessCode.textContent = displayCode;
    if (els.groupModalSuccessLink) els.groupModalSuccessLink.value = link;
    if (els.shareFallbackHint) els.shareFallbackHint.hidden = true;
    showToast(t("groups.created"));
    await refreshAchievements(true);
    await renderGroups();
    void startSupabaseRealtime();
  }

  function getCoachCounts() {
    const today = formatYMD(new Date());
    const openTasks = tasksForDay(today).filter((t) => !t.completed).length;
    const evCount = eventsForDay(today).length;
    return { openTasks, events: evCount };
  }

  function refreshCoachBanner() {
    if (!els.coachBanner || !els.coachBannerText) return;
    if (!appPrefs.coachCharacterEnabled) {
      els.coachBanner.hidden = true;
      return;
    }
    const dismissed = localStorage.getItem(STORAGE_COACH_DISMISS);
    const today = formatYMD(new Date());
    if (dismissed === today) {
      els.coachBanner.hidden = true;
      return;
    }
    const { openTasks, events } = getCoachCounts();
    els.coachBannerText.textContent = t("coach.message")
      .replace("{tasks}", String(openTasks))
      .replace("{events}", String(events));
    fillAvatarHost(els.coachAvatarHost);
    els.coachBanner.hidden = false;
  }

  function dismissCoachBanner() {
    localStorage.setItem(STORAGE_COACH_DISMISS, formatYMD(new Date()));
    if (els.coachBanner) els.coachBanner.hidden = true;
  }

  let welcomeEventsBound = false;

  function fillWelcomeModal() {
    if (!els.welcomeMessage) return;
    const { openTasks, events } = getCoachCounts();
    const name = getDisplayNameForUi();
    els.welcomeMessage.textContent = t("welcome.message")
      .replace("{name}", name)
      .replace("{tasks}", String(openTasks))
      .replace("{events}", String(events));
  }

  function dismissWelcomeModal() {
    if (!els.welcomeOverlay) return;
    sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    els.welcomeOverlay.classList.remove("welcome-overlay--visible");
    document.body.classList.remove("welcome-modal-open");
    window.setTimeout(() => {
      if (!els.welcomeOverlay) return;
      els.welcomeOverlay.hidden = true;
      els.welcomeOverlay.setAttribute("aria-hidden", "true");
    }, 400);
  }

  function maybeShowWelcomeModal() {
    if (!els.welcomeOverlay) return;
    if (!appPrefs.welcomeMessageEnabled) return;
    if (!isSessionValid()) return;
    const c = loadCookieConsent();
    if (!c || !c.savedAt) return;
    if (sessionStorage.getItem(WELCOME_SESSION_KEY)) return;
    fillWelcomeModal();
    applyDomI18n();
    els.welcomeOverlay.hidden = false;
    els.welcomeOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("welcome-modal-open");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.welcomeOverlay?.classList.add("welcome-overlay--visible");
      });
    });
    try {
      els.welcomeContinue?.focus();
    } catch (_) {}
  }

  function bindWelcomeModalEvents() {
    if (welcomeEventsBound) return;
    welcomeEventsBound = true;
    const close = () => dismissWelcomeModal();
    els.welcomeClose?.addEventListener("click", close);
    els.welcomeContinue?.addEventListener("click", close);
    els.welcomeOverlayBackdrop?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!els.welcomeOverlay || els.welcomeOverlay.hidden) return;
      close();
    });
  }

  function queueWelcomeModalAfterConsent() {
    if (!isSessionValid()) return;
    setTimeout(() => maybeShowWelcomeModal(), 220);
  }

  // ——— Render ———

  function getSelfcareSelectedDate() {
    const today = formatYMD(new Date());
    const val = (els.selfcareDate?.value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : today;
  }

  function setSelfcareStatus(text) {
    if (!els.selfcareStatus) return;
    els.selfcareStatus.textContent = text;
  }

  function selfcareEntryHasContent(entry) {
    const e = sanitizeSelfcareEntry(entry);
    return Boolean((e.grateful || e.smile || e.well || e.proud || e.self || e.surprise || "").trim());
  }

  function getSelfcareFormEntry() {
    return {
      grateful: els.selfcareQGrateful?.value || "",
      smile: els.selfcareQSmile?.value || "",
      well: els.selfcareQWentWell?.value || "",
      proud: els.selfcareQProud?.value || "",
      self: els.selfcareQSelf?.value || "",
      surprise: els.selfcareQSurprise?.value || "",
      updatedAt: Date.now(),
    };
  }

  function fillSelfcareForm(entry) {
    const e = sanitizeSelfcareEntry(entry);
    if (els.selfcareQGrateful) els.selfcareQGrateful.value = e.grateful;
    if (els.selfcareQSmile) els.selfcareQSmile.value = e.smile;
    if (els.selfcareQWentWell) els.selfcareQWentWell.value = e.well;
    if (els.selfcareQProud) els.selfcareQProud.value = e.proud;
    if (els.selfcareQSelf) els.selfcareQSelf.value = e.self;
    if (els.selfcareQSurprise) els.selfcareQSurprise.value = e.surprise;
  }

  function clearSelfcareForm() {
    fillSelfcareForm({});
    selfcareDirty = false;
  }

  function selfcarePreviewSnippet(entry) {
    const e = sanitizeSelfcareEntry(entry);
    const text =
      e.grateful.trim() ||
      e.smile.trim() ||
      e.well.trim() ||
      e.proud.trim() ||
      e.self.trim() ||
      e.surprise.trim() ||
      "";
    if (!text) return "—";
    return text.length > 90 ? `${text.slice(0, 90).trim()}...` : text;
  }

  function selfcarePreviewFullText(entry) {
    const e = sanitizeSelfcareEntry(entry);
    const lines = [];
    if (e.grateful.trim()) lines.push(`• ${t("selfcare.q.grateful")} ${e.grateful.trim()}`);
    if (e.smile.trim()) lines.push(`• ${t("selfcare.q.smile")} ${e.smile.trim()}`);
    if (e.well.trim()) lines.push(`• ${t("selfcare.q.well")} ${e.well.trim()}`);
    if (e.proud.trim()) lines.push(`• ${t("selfcare.q.proud")} ${e.proud.trim()}`);
    if (e.self.trim()) lines.push(`• ${t("selfcare.q.self")} ${e.self.trim()}`);
    if (e.surprise.trim()) lines.push(`• ${t("selfcare.q.surprise")} ${e.surprise.trim()}`);
    return lines.length ? lines.join("\n\n") : "—";
  }

  function renderSelfcarePreview(ymd) {
    if (!els.selfcarePreview || !els.selfcarePreviewDate || !els.selfcarePreviewText) return;
    const entry = selfcareJournal[ymd];
    if (!entry) {
      els.selfcarePreview.hidden = true;
      selfcareActivePreviewYmd = "";
      return;
    }
    els.selfcarePreview.hidden = false;
    els.selfcarePreviewDate.textContent = longDateLabel(ymd);
    els.selfcarePreviewText.textContent = selfcarePreviewFullText(entry);
    selfcareActivePreviewYmd = ymd;
  }

  function renderSelfcareEntriesList() {
    if (!els.selfcareEntriesList) return;
    const sorted = Object.entries(selfcareJournal)
      .filter(([, entry]) => selfcareEntryHasContent(entry))
      .sort((a, b) => b[0].localeCompare(a[0]));
    els.selfcareEntriesList.innerHTML = "";
    if (els.selfcareEntriesEmpty) els.selfcareEntriesEmpty.hidden = sorted.length > 0;

    sorted.forEach(([ymd, entry]) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "selfcare-entry-btn";
      if (ymd === selfcareActivePreviewYmd) btn.classList.add("is-active");
      btn.innerHTML = `<span class="selfcare-entry-date"></span><span class="selfcare-entry-snippet"></span>`;
      btn.querySelector(".selfcare-entry-date").textContent = longDateLabel(ymd);
      btn.querySelector(".selfcare-entry-snippet").textContent = selfcarePreviewSnippet(entry);
      btn.addEventListener("click", () => {
        if (selfcareDirty) void saveSelfcareEntry(false);
        renderSelfcarePreview(ymd);
        renderSelfcareEntriesList();
      });
      li.appendChild(btn);
      els.selfcareEntriesList.appendChild(li);
    });
  }

  async function saveSelfcareEntry(showToastMsg) {
    const ymd = getSelfcareSelectedDate();
    const payload = sanitizeSelfcareEntry(getSelfcareFormEntry());
    if (!selfcareEntryHasContent(payload)) {
      const okDel = await deleteSelfcareEntryFromSupabase(ymd);
      if (!okDel) {
        setSelfcareStatus(t("selfcare.statusDraft"));
        return;
      }
      delete selfcareJournal[ymd];
      await loadSelfcareEntriesFromSupabase();
      setSelfcareStatus(t("selfcare.statusIdle"));
      clearSelfcareForm();
      selfcareDirty = false;
      renderSelfcarePreview(selfcareActivePreviewYmd);
      renderSelfcareEntriesList();
      void refreshAchievements(Boolean(showToastMsg));
      return;
    }
    const ok = await upsertSelfcareEntryToSupabase(ymd, payload);
    if (!ok) {
      setSelfcareStatus(t("selfcare.statusDraft"));
      return;
    }
    await loadSelfcareEntriesFromSupabase();
    selfcareDirty = false;
    renderSelfcarePreview(ymd);
    renderSelfcareEntriesList();
    clearSelfcareForm();
    if (els.selfcareDate) els.selfcareDate.value = ymd;
    void refreshAchievements(Boolean(showToastMsg));
    setSelfcareStatus(t("selfcare.statusSaved"));
    if (showToastMsg) showToast(t("selfcare.statusSaved"), { type: "accent" });
  }

  function loadSelfcareDateIntoForm(ymd) {
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(ymd || "") ? ymd : formatYMD(new Date());
    if (els.selfcareDate) els.selfcareDate.value = dateStr;
    fillSelfcareForm(selfcareJournal[dateStr] || {});
    selfcareDirty = false;
    setSelfcareStatus(selfcareJournal[dateStr] ? t("selfcare.statusLoaded") : t("selfcare.statusIdle"));
  }

  function markSelfcareDirty() {
    selfcareDirty = true;
    setSelfcareStatus(t("selfcare.statusDraft"));
  }

  function renderSelfcare() {
    if (!els.selfcareDate) return;
    if (!els.selfcareDate.value) els.selfcareDate.value = formatYMD(new Date());
    if (!selfcareActivePreviewYmd) {
      const latest = Object.keys(selfcareJournal).sort((a, b) => b.localeCompare(a))[0];
      if (latest) selfcareActivePreviewYmd = latest;
    }
    renderSelfcarePreview(selfcareActivePreviewYmd);
    renderSelfcareEntriesList();
    loadSelfcareDateIntoForm(getSelfcareSelectedDate());
  }

  function getOpenTasksForFocus() {
    return tasks.filter((tk) => !tk.completed);
  }

  /** Open task for focus, or any task by id (e.g. restored session). */
  function focusTaskForUi(id) {
    if (!id) return null;
    const open = getOpenTasksForFocus();
    const o = open.find((tk) => String(tk.id) === String(id));
    if (o) return o;
    return tasks.find((tk) => String(tk.id) === String(id)) || null;
  }

  function formatFocusClock(sec) {
    const safe = Math.max(0, Math.floor(sec));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatFocusMinutesLabel(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    return `${min}m`;
  }

  function getFocusTaskById(id) {
    const open = getOpenTasksForFocus();
    return open.find((tk) => tk.id === id) || null;
  }

  function syncFocusTaskOptions() {
    if (!els.focusTaskSelect) return;
    const open = getOpenTasksForFocus();
    const prev = focusTimer.selectedTaskId;
    els.focusTaskSelect.innerHTML = "";
    if (!open.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("focus.noOpenTasks");
      els.focusTaskSelect.appendChild(opt);
      focusTimer.selectedTaskId = "";
    } else {
      open.forEach((tk) => {
        const opt = document.createElement("option");
        opt.value = tk.id;
        opt.textContent = tk.title;
        els.focusTaskSelect.appendChild(opt);
      });
      let sel = open[0].id;
      if (prev && open.some((tk) => tk.id === prev)) sel = prev;
      else if (focusTimer.running && prev) {
        sel = prev;
        const ghost = document.createElement("option");
        ghost.value = prev;
        ghost.textContent = focusTaskForUi(prev)?.title || String(prev).slice(0, 8);
        els.focusTaskSelect.appendChild(ghost);
      }
      focusTimer.selectedTaskId = sel;
      els.focusTaskSelect.value = focusTimer.selectedTaskId;
    }
  }

  function refreshFocusActiveTaskCard() {
    const tk = focusTaskForUi(focusTimer.selectedTaskId);
    if (els.focusTaskTitle) els.focusTaskTitle.textContent = tk ? tk.title : t("focus.noTaskSelected");
    if (els.focusTaskNotes) {
      const notes = tk && tk.notes ? tk.notes.trim() : "";
      els.focusTaskNotes.textContent = notes || t("focus.noTaskNotes");
    }
  }

  function refreshFocusGuidance() {
    if (!els.focusGuidanceText) return;
    const tk = focusTaskForUi(focusTimer.selectedTaskId);
    const min = Math.max(1, Math.round(focusTimer.durationSec / 60));
    const picks = [
      t("focus.guidance.one").replace("{m}", String(min)),
      t("focus.guidance.two").replace("{m}", String(min)),
      t("focus.guidance.three"),
    ];
    const msg = picks[Math.floor(Math.random() * picks.length)];
    els.focusGuidanceText.textContent = tk ? msg.replace("{task}", tk.title) : t("focus.noTaskSelected");
  }

  function renderFocusHistory() {
    console.log("[focus] renderFocusHistory called");
    if (!els.focusSessionList || !els.focusSessionEmpty) return;
    els.focusSessionList.innerHTML = "";
    const last = focusHistory.slice(0, 6);
    els.focusSessionEmpty.hidden = last.length > 0;
    last.forEach((s) => {
      const li = document.createElement("li");
      li.className = "focus-session-item";
      const title = s.taskTitle || t("focus.noTaskSelected");
      const dur = formatFocusMinutesLabel(s.durationMin || 0);
      const endMs = s.endedAt || s.createdAt || s.startedAt || Date.now();
      const when = shortDateLabel(
        s.date ? s.date : formatYMD(new Date(typeof endMs === "number" ? endMs : Date.now()))
      );
      li.innerHTML = `<span>${title} · ${dur}</span><time>${when}</time>`;
      els.focusSessionList.appendChild(li);
    });
  }

  function updateFocusTimerUi() {
    if (els.focusTimerDisplay) els.focusTimerDisplay.textContent = formatFocusClock(focusTimer.remainingSec);
    const pct = focusTimer.durationSec > 0 ? Math.min(100, Math.max(0, ((focusTimer.durationSec - focusTimer.remainingSec) / focusTimer.durationSec) * 100)) : 0;
    if (els.focusProgressFill) els.focusProgressFill.style.width = `${pct}%`;
    if (els.focusRouteProgress) els.focusRouteProgress.textContent = `${Math.round(pct)}%`;
    if (els.btnFocusStart) els.btnFocusStart.hidden = focusTimer.running;
    if (els.btnFocusPause) els.btnFocusPause.hidden = !focusTimer.running || focusTimer.paused;
    if (els.btnFocusResume) els.btnFocusResume.hidden = !focusTimer.running || !focusTimer.paused;
    if (els.btnFocusEnd) els.btnFocusEnd.hidden = !focusTimer.running;
  }

  function stopBreakTick() {
    if (focusTimer.breakTickId) {
      clearInterval(focusTimer.breakTickId);
      focusTimer.breakTickId = 0;
    }
  }

  function updateBreakUi() {
    if (els.focusBreakDisplay) els.focusBreakDisplay.textContent = formatFocusClock(focusTimer.breakRemainingSec);
  }

  function showBreakPanel(show) {
    if (!els.focusBreakPanel) return;
    els.focusBreakPanel.hidden = !show;
  }

  function startBreak(auto) {
    focusTimer.breakDurationSec = 5 * 60;
    focusTimer.breakRemainingSec = focusTimer.breakDurationSec;
    focusTimer.breakRunning = true;
    showBreakPanel(true);
    updateBreakUi();
    stopBreakTick();
    if (auto) {
      // keep it calm: no extra toasts here
    }
    const endAt = Date.now() + focusTimer.breakRemainingSec * 1000;
    focusTimer.breakTickId = setInterval(() => {
      if (!focusTimer.breakRunning) return;
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      focusTimer.breakRemainingSec = left;
      updateBreakUi();
      if (left <= 0) {
        focusTimer.breakRunning = false;
        stopBreakTick();
        showBreakPanel(false);
        showToast(t("focus.breakKicker"), { type: "accent" });
      }
    }, 1000);
  }

  function skipBreak() {
    focusTimer.breakRunning = false;
    stopBreakTick();
    showBreakPanel(false);
  }

  function stopFocusTick() {
    if (focusTimer.tickId) {
      clearInterval(focusTimer.tickId);
      focusTimer.tickId = 0;
    }
  }

  function notifyFocusCompleted(session) {
    showToast(t("focus.completedToast").replace("{task}", session.taskTitle || t("focus.noTaskSelected")), { type: "accent" });
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(t("focus.completedTitle"), {
          body: t("focus.completedBody").replace("{task}", session.taskTitle || t("focus.noTaskSelected")),
          tag: `flow-focus-${session.id}`,
        });
      } catch (_) {}
    }
  }

  async function finishFocusSession(completed) {
    stopFocusTick();
    document.body.classList.remove("focus-session-active");
    if (!focusTimer.activeSessionId) {
      focusTimer.running = false;
      focusTimer.paused = false;
      focusTimer.preEndNotified = false;
      updateFocusTimerUi();
      await clearFocusStateInSupabase();
      return;
    }
    const endedAt = Date.now();
    const min = Math.max(1, Math.round(focusTimer.durationSec / 60));
    const session = {
      id: focusTimer.activeSessionId,
      taskId: focusTimer.selectedTaskId || null,
      taskTitle:
        focusTimer.activeTaskTitle ||
        (focusTaskForUi(focusTimer.selectedTaskId)?.title || ""),
      durationMin: min,
      completed: Boolean(completed),
      startedAt: focusTimer.startedAtMs || endedAt,
      endedAt,
      mode: focusTimer.mode,
    };
    if (completed) console.log("[focus] timer completed");
    const persisted = await insertFocusSessionToSupabase(session);
    if (!persisted) {
      focusTimer.running = false;
      focusTimer.paused = false;
      focusTimer.activeSessionId = "";
      focusTimer.preEndNotified = false;
      focusTimer.remainingSec = focusTimer.durationSec;
      focusTimer.lastFocusStatePersistAt = 0;
      updateFocusTimerUi();
      refreshFocusGuidance();
      return;
    }
    focusHistory.unshift(session);
    focusHistory = focusHistory.slice(0, 120);
    await clearFocusStateInSupabase();
    if (completed) notifyFocusCompleted(session);
    focusTimer.running = false;
    focusTimer.paused = false;
    focusTimer.activeSessionId = "";
    focusTimer.preEndNotified = false;
    focusTimer.remainingSec = focusTimer.durationSec;
    focusTimer.lastFocusStatePersistAt = 0;
    updateFocusTimerUi();
    renderFocusHistory();
    await refreshAchievements(Boolean(completed));
    refreshFocusGuidance();
    if (completed) startBreak(true);
  }

  function scheduleFocusTick() {
    stopFocusTick();
    focusTimer.tickId = setInterval(() => {
      if (!focusTimer.running || focusTimer.paused) return;
      const left = Math.max(0, Math.round((focusTimer.endAtMs - Date.now()) / 1000));
      focusTimer.remainingSec = left;
      const now = Date.now();
      if (now - (focusTimer.lastFocusStatePersistAt || 0) > 45000) {
        focusTimer.lastFocusStatePersistAt = now;
        void persistFocusStateRunning();
      }
      if (!focusTimer.preEndNotified && left > 0 && left <= 60) {
        focusTimer.preEndNotified = true;
        showToast(t("focus.almostDone"), { type: "accent" });
      }
      updateFocusTimerUi();
      if (left <= 0) void finishFocusSession(true);
    }, 1000);
  }

  async function loadFocusStateFromSupabaseAndRestore() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("focus_state").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      console.log("[focus] loaded focus_state:", data);
      if (!data) {
        return;
      }
      if (!focusStateDbSupport.checked) {
        focusStateDbSupport.checked = true;
        focusStateDbSupport.hasPauseColumns = "is_paused" in data || "remaining_seconds" in data || "paused_at" in data;
      }
      const isPaused = Boolean(data.is_paused);
      const isRunning = Boolean(data.is_running);
      if (!isPaused && !isRunning) return;
      const baseDurationSec = Math.max(60, (Number(data.duration_minutes) || 25) * 60);
      const explicitRemaining = Number(data.remaining_seconds);
      const baseRemainingSec = Number.isFinite(explicitRemaining) && explicitRemaining > 0 ? explicitRemaining : baseDurationSec;
      if (isPaused) {
        focusTimer.durationSec = Math.max(60, baseRemainingSec);
        focusTimer.remainingSec = Math.max(0, Math.round(baseRemainingSec));
        focusTimer.startedAtMs = 0;
        focusTimer.endAtMs = Date.now() + focusTimer.remainingSec * 1000;
        focusTimer.running = true;
        focusTimer.paused = true;
        focusTimer.preEndNotified = false;
        focusTimer.activeSessionId = uid();
        focusTimer.selectedTaskId = data.task_id ? String(data.task_id) : "";
        const pausedTask = focusTaskForUi(focusTimer.selectedTaskId);
        focusTimer.activeTaskTitle = pausedTask ? String(pausedTask.title || "") : "";
        focusTimer.lastFocusStatePersistAt = Date.now();
        stopFocusTick();
        stopBreakTick();
        focusTimer.breakRunning = false;
        showBreakPanel(false);
        document.body.classList.add("focus-session-active");
        updateFocusTimerUi();
        refreshFocusActiveTaskCard();
        refreshFocusGuidance();
        console.log("[focus] restored paused state:", data);
        return;
      }
      const startMs = data.started_at ? new Date(data.started_at).getTime() : NaN;
      if (!Number.isFinite(startMs)) {
        await clearFocusStateInSupabase();
        return;
      }
      const elapsedSec = Math.max(0, Math.round((Date.now() - startMs) / 1000));
      const remainingSec = Math.max(0, Math.round(baseRemainingSec - elapsedSec));
      if (remainingSec <= 0) {
        await completeExpiredFocusSessionFromRow(data);
        return;
      }
      focusTimer.durationSec = Math.max(60, baseRemainingSec);
      focusTimer.remainingSec = remainingSec;
      focusTimer.startedAtMs = startMs;
      focusTimer.endAtMs = Date.now() + remainingSec * 1000;
      focusTimer.running = true;
      focusTimer.paused = false;
      focusTimer.preEndNotified = remainingSec <= 60;
      focusTimer.activeSessionId = uid();
      focusTimer.selectedTaskId = data.task_id ? String(data.task_id) : "";
      const tk = focusTaskForUi(focusTimer.selectedTaskId);
      focusTimer.activeTaskTitle = tk ? String(tk.title || "") : "";
      focusTimer.lastFocusStatePersistAt = Date.now();
      stopFocusTick();
      stopBreakTick();
      focusTimer.breakRunning = false;
      showBreakPanel(false);
      document.body.classList.add("focus-session-active");
      scheduleFocusTick();
      updateFocusTimerUi();
      refreshFocusActiveTaskCard();
      refreshFocusGuidance();
      void persistFocusStateRunning();
      console.log("[focus] restored running state:", data);
    } catch (e) {
      console.error(e);
    }
  }

  function startFocusSession() {
    if (focusTimer.running) return;
    const tk = getFocusTaskById(focusTimer.selectedTaskId);
    if (!tk) {
      showToast(t("focus.needTask"));
      return;
    }
    const customMin = Math.max(1, Math.min(240, Number(els.focusCustomMinutes?.value || 25)));
    focusTimer.durationSec = customMin * 60;
    focusTimer.remainingSec = focusTimer.durationSec;
    focusTimer.startedAtMs = Date.now();
    focusTimer.endAtMs = focusTimer.startedAtMs + focusTimer.durationSec * 1000;
    focusTimer.running = true;
    focusTimer.paused = false;
    focusTimer.preEndNotified = false;
    focusTimer.activeSessionId = uid();
    focusTimer.activeTaskTitle = tk.title || "";
    focusTimer.distractionSelections = $$(".focus-distraction:checked").map((x) => x.value);
    focusTimer.lastFocusStatePersistAt = Date.now();
    stopFocusTick();
    document.body.classList.add("focus-session-active");
    updateFocusTimerUi();
    refreshFocusGuidance();
    void persistFocusStateRunning();
    scheduleFocusTick();
  }

  function pauseFocusSession() {
    if (!focusTimer.running || focusTimer.paused) return;
    console.log("[focus] pause");
    focusTimer.paused = true;
    focusTimer.remainingSec = Math.max(0, Math.round((focusTimer.endAtMs - Date.now()) / 1000));
    stopFocusTick();
    updateFocusTimerUi();
    void persistFocusStatePaused();
  }

  function resumeFocusSession() {
    if (!focusTimer.running || !focusTimer.paused) return;
    console.log("[focus] resume");
    focusTimer.paused = false;
    focusTimer.startedAtMs = Date.now();
    focusTimer.endAtMs = focusTimer.startedAtMs + focusTimer.remainingSec * 1000;
    focusTimer.lastFocusStatePersistAt = Date.now();
    updateFocusTimerUi();
    void persistFocusStateRunning();
    scheduleFocusTick();
  }

  function endFocusSessionEarly() {
    stopFocusTick();
    stopBreakTick();
    focusTimer.breakRunning = false;
    showBreakPanel(false);
    focusTimer.running = false;
    focusTimer.paused = false;
    focusTimer.activeSessionId = "";
    focusTimer.preEndNotified = false;
    focusTimer.remainingSec = focusTimer.durationSec;
    focusTimer.lastFocusStatePersistAt = 0;
    document.body.classList.remove("focus-session-active");
    updateFocusTimerUi();
    refreshFocusGuidance();
    void clearFocusStateInSupabase();
  }

  async function toggleFocusFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  }

  function renderFocus() {
    syncFocusTaskOptions();
    refreshFocusActiveTaskCard();
    updateFocusTimerUi();
    updateBreakUi();
    renderFocusHistory();
    if (!focusTimer.running) refreshFocusGuidance();
  }

  function getSelfcareDayKeys() {
    return Object.entries(selfcareJournal)
      .filter(([, entry]) => selfcareEntryHasContent(entry))
      .map(([ymd]) => ymd);
  }

  function countSuccessfulGoalDays() {
    const todayStr = formatYMD(startOfDay(new Date()));
    const unique = new Set();
    collectMonthKeysForPoints().forEach((monthKey) => {
      const parts = monthKey.split("-");
      const y = Number(parts[0]);
      const mo = Number(parts[1]);
      if (!y || !mo) return;
      const lastDay = new Date(y, mo, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const ymd = formatYMD(new Date(y, mo - 1, day));
        if (ymd > todayStr) continue;
        if (getDayGoalStatus(ymd, todayStr) === "success") unique.add(ymd);
      }
    });
    return unique.size;
  }

  function isRankOneInAnyGroup() {
    const monthKey = currentMonthKey();
    return groups.some((g) => {
      if (!Array.isArray(g.members) || !g.members.some((m) => m.id === profile.id) || g.members.length < 2) return false;
      const rows = g.members
        .map((m) => ({ id: m.id, points: getMemberMonthPoints(m.id, monthKey), name: m.name || "" }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      return rows.length > 0 && rows[0].id === profile.id;
    });
  }

  function getAchievementMetrics() {
    const streak = streakSnapshot();
    const selfcareDays = getSelfcareDayKeys();
    const selfcareSet = new Set(selfcareDays);
    const activitySet = new Set([...collectActivityDays(), ...selfcareDays]);
    const createdByMeCount = groups.filter(
      (g) => String(g.ownerId || g.owner_id || "") === String(profile.id || "")
    ).length;
    const invitedCount = groups.reduce((acc, g) => {
      if (String(g.ownerId || g.owner_id || "") !== String(profile.id || "")) return acc;
      return Math.max(acc, Array.isArray(g.members) ? g.members.length : 0);
    }, 0);
    return {
      completedTasks: tasks.filter((t) => t.completed).length,
      timedEventsDone: events.filter((e) => !e.allDay && e.streakDone).length,
      currentStreak: streak.current,
      successfulDays: countSuccessfulGoalDays(),
      selfcareEntries: selfcareSet.size,
      selfcareCurrentStreak: currentStreakFromActivitySet(selfcareSet),
      groupCreated: createdByMeCount,
      groupMembersMax: invitedCount,
      isGroupRankOne: isRankOneInAnyGroup(),
      activeDays: activitySet.size,
      unlockedCount: Object.keys(achievementsState.unlocked || {}).length,
    };
  }

  function getAchievementProgress(def, metrics) {
    switch (def.id) {
      case "task_done_50":
      case "task_done_100":
        return Math.min(def.target, metrics.completedTasks);
      case "timed_events_10":
        return Math.min(def.target, metrics.timedEventsDone);
      case "streak_7":
      case "streak_30":
        return Math.min(def.target, metrics.currentStreak);
      case "perfect_days_5":
      case "perfect_days_10":
        return Math.min(def.target, metrics.successfulDays);
      case "selfcare_first":
      case "selfcare_days_7":
        return Math.min(def.target, metrics.selfcareEntries);
      case "selfcare_streak_3":
        return Math.min(def.target, metrics.selfcareCurrentStreak);
      case "group_created":
        return Math.min(def.target, metrics.groupCreated);
      case "group_member_2":
        return Math.min(def.target, metrics.groupMembersMax);
      case "group_rank_1":
        return metrics.isGroupRankOne ? 1 : 0;
      case "active_days_30":
        return Math.min(def.target, metrics.activeDays);
      case "achievements_3":
      case "achievements_10":
        return Math.min(def.target, metrics.unlockedCount);
      default:
        return 0;
    }
  }

  async function evaluateAchievements(opts) {
    const notify = Boolean(opts && opts.notify);
    const metrics = getAchievementMetrics();
    let changed = false;
    const pendingUnlocks = /** @type {Promise<boolean>[]} */ ([]);
    ACHIEVEMENT_DEFS.forEach((def) => {
      if (achievementsState.unlocked[def.id]) return;
      const done = getAchievementProgress(def, metrics);
      if (done < def.target) return;
      const unlockedAt = formatYMD(new Date());
      achievementsState.unlocked[def.id] = unlockedAt;
      changed = true;
      metrics.unlockedCount += 1;
      pendingUnlocks.push(unlockAchievementToSupabase(def.id, unlockedAt));
      if (notify) {
        const title = t(`ach.name.${def.id}`);
        showToast(`🏆 ${t("ach.toastUnlocked").replace("{name}", title)}`, { type: "accent" });
      }
    });
    if (pendingUnlocks.length) {
      await Promise.all(pendingUnlocks);
      await loadAchievementsFromSupabase();
    }
    return changed;
  }

  async function refreshAchievements(notify) {
    const changed = await evaluateAchievements({ notify: Boolean(notify) });
    if (currentView === "achievements" || changed) renderAchievements();
  }

  function renderAchievements() {
    if (!els.achievementsGrid || !els.achFilterStatus || !els.achFilterCategory) return;
    const status = els.achFilterStatus.value || "all";
    const currentCat = els.achFilterCategory.value || "all";
    const categories = [...new Set(ACHIEVEMENT_DEFS.map((d) => d.category))];

    if (!els.achFilterCategory.dataset.ready) {
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = t(`ach.category.${cat}`);
        els.achFilterCategory.appendChild(opt);
      });
      els.achFilterCategory.dataset.ready = "1";
    } else {
      [...els.achFilterCategory.options].forEach((opt, i) => {
        if (i === 0) return;
        opt.textContent = t(`ach.category.${opt.value}`);
      });
    }

    const metrics = getAchievementMetrics();
    const total = ACHIEVEMENT_DEFS.length;
    const unlockedTotal = ACHIEVEMENT_DEFS.filter((d) => Boolean(achievementsState.unlocked[d.id])).length;
    if (els.achievementsSummary) {
      const pct = total ? Math.round((unlockedTotal / total) * 100) : 0;
      els.achievementsSummary.innerHTML = `
        <span class="ach-summary-pill">${t("ach.summary.unlocked").replace("{n}", String(unlockedTotal))}</span>
        <span class="ach-summary-pill">${t("ach.summary.total").replace("{n}", String(total))}</span>
        <span class="ach-summary-pill">${t("ach.summary.progress").replace("{n}", String(pct))}</span>
      `;
    }

    const filtered = ACHIEVEMENT_DEFS.filter((def) => {
      const unlocked = Boolean(achievementsState.unlocked[def.id]);
      if (status === "unlocked" && !unlocked) return false;
      if (status === "locked" && unlocked) return false;
      if (currentCat !== "all" && def.category !== currentCat) return false;
      return true;
    });

    els.achievementsGrid.innerHTML = "";
    filtered.forEach((def) => {
      const done = getAchievementProgress(def, metrics);
      const unlockedAt = achievementsState.unlocked[def.id] || "";
      const unlocked = Boolean(unlockedAt);
      const card = document.createElement("article");
      card.className = `ach-card ${unlocked ? "ach-card--unlocked" : "ach-card--locked"}`;
      const pct = Math.max(0, Math.min(100, Math.round((100 * done) / def.target)));
      const achievedLine = unlocked ? `<span class="ach-date-pill">${t("ach.achievedOn").replace("{date}", shortDateLabel(unlockedAt))}</span>` : "";
      card.innerHTML = `
        <header class="ach-card-head">
          <span class="ach-icon-wrap" aria-hidden="true">${def.icon}</span>
          <span class="ach-state-tag ${unlocked ? "ach-state-tag--unlocked" : "ach-state-tag--locked"}">${t(
            unlocked ? "ach.status.unlocked" : "ach.status.locked"
          )}</span>
        </header>
        <h3 class="ach-name">${t(`ach.name.${def.id}`)}</h3>
        <p class="ach-desc">${t(`ach.desc.${def.id}`)}</p>
        <div class="ach-meta-row">
          <span class="ach-category-pill">${t(`ach.category.${def.category}`)}</span>
          ${achievedLine}
        </div>
        <div class="ach-progress-wrap">
          <span class="ach-progress-label">${t("ach.progress").replace("{done}", String(done)).replace("{target}", String(def.target))}</span>
          <span class="ach-progress-track" aria-hidden="true"><span class="ach-progress-fill" style="width:${pct}%"></span></span>
        </div>
      `;
      els.achievementsGrid.appendChild(card);
    });
    if (els.achievementsEmpty) els.achievementsEmpty.hidden = filtered.length > 0;
  }

  function setView(view) {
    currentView = view;
    els.navItems.forEach((btn) => {
      const v = btn.dataset.view;
      const active = v === view;
      btn.classList.toggle("active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    Object.entries(els.views).forEach(([k, el]) => {
      if (!el) return;
      el.hidden = k !== view;
      el.classList.toggle("active", k === view);
    });

    const pageKeys = {
      dashboard: ["page.dashboard.title", "page.dashboard.subtitle"],
      tasks: ["page.tasks.title", "page.tasks.subtitle"],
      calendar: ["page.calendar.title", "page.calendar.subtitle"],
      motivation: ["page.motivation.title", "page.motivation.subtitle"],
      selfcare: ["page.selfcare.title", "page.selfcare.subtitle"],
      focus: ["page.focus.title", "page.focus.subtitle"],
      achievements: ["page.achievements.title", "page.achievements.subtitle"],
      groups: ["page.groups.title", "page.groups.subtitle"],
    };
    els.pageTitle.textContent = t(pageKeys[view][0]);
    els.pageSubtitle.textContent = t(pageKeys[view][1]);

    if (view === "calendar") {
      renderCalendar();
      renderDayDetail();
    }
    if (view === "dashboard") renderDashboard();
    if (view === "tasks") renderTasks();
    if (view === "motivation") renderMotivation();
    if (view === "selfcare") renderSelfcare();
    if (view === "focus") renderFocus();
    if (view === "achievements") renderAchievements();
    if (view === "groups") void renderGroups();
    refreshCoachBanner();
  }

  function renderDashboard() {
    maybeUpdateBuddyRecord();
    els.statOpenTasks.textContent = String(openTasksCount());
    els.statWeekEvents.textContent = String(eventsInCurrentWeekCount());
    els.statDueSoon.textContent = String(dueSoonCount());
    const snap = streakSnapshot();
    if (els.dashStreakMini) els.dashStreakMini.textContent = String(snap.current);
    if (els.dashBuddyMini) els.dashBuddyMini.textContent = String(snap.buddyCurrent);

    const ut = upcomingTasks(5);
    els.dashboardTasks.innerHTML = "";
    if (ut.length === 0) {
      els.dashboardTasks.innerHTML =
        '<p class="empty-text" style="padding:1rem;text-align:left;margin:0">' +
        t("dashboard.emptyTasks") +
        "</p>";
    } else {
      ut.forEach((task, i) => {
        els.dashboardTasks.appendChild(dashboardTaskRow(task, i));
      });
    }

    const ue = upcomingEvents(6);
    els.dashboardEvents.innerHTML = "";
    if (ue.length === 0) {
      els.dashboardEvents.innerHTML =
        '<p class="empty-text" style="padding:1rem;text-align:left;margin:0">' +
        t("dashboard.emptyEvents") +
        "</p>";
    } else {
      ue.forEach((ev, i) => {
        els.dashboardEvents.appendChild(dashboardEventRow(ev, i));
      });
    }
  }

  function priorityDotClass(p) {
    if (p === "high") return "dot-rose";
    if (p === "low") return "dot-mint";
    return "dot-amber";
  }

  function dashboardTaskRow(task, index) {
    const row = document.createElement("div");
    row.className = "dash-row";
    row.style.animationDelay = `${index * 0.05}s`;
    row.innerHTML = `
      <span class="dash-dot ${priorityDotClass(task.priority)}"></span>
      <div class="dash-main">
        <p class="dash-title"></p>
        <p class="dash-sub"></p>
      </div>`;
    row.querySelector(".dash-title").textContent = task.title;
    const sub = task.dueDate
      ? `${t("tasks.duePrefix")} ${shortDateLabel(task.dueDate)}`
      : t("tasks.noDueDate");
    row.querySelector(".dash-sub").textContent = sub;
    row.addEventListener("click", () => {
      setView("tasks");
      openTaskModal(task.id);
    });
    return row;
  }

  function dashboardEventRow(ev, index) {
    const row = document.createElement("div");
    row.className = "dash-row dash-row--event";
    row.style.animationDelay = `${index * 0.05}s`;
    const timeStr = ev.allDay ? t("day.allDay") : formatTimeRange(ev) || t("day.timeNotSet");
    row.innerHTML = `
      <span class="dash-event-badge" aria-hidden="true"></span>
      <span class="dash-dot dot-${ev.color}"></span>
      <div class="dash-main">
        <p class="dash-title"></p>
        <p class="dash-sub"></p>
      </div>`;
    row.querySelector(".dash-event-badge").textContent = timeStr;
    row.querySelector(".dash-title").textContent = ev.title;
    row.querySelector(".dash-sub").textContent = longDateLabel(ev.date);
    row.addEventListener("click", () => {
      selectedDateStr = ev.date;
      calAnchor = startOfDay(parseYMD(ev.date));
      setView("calendar");
      openEventModal(ev.id);
    });
    return row;
  }

  function formatTimeForDisplay(time24) {
    if (!time24 || typeof time24 !== "string") return time24 || "";
    const parts = time24.split(":");
    const h = parseInt(parts[0], 10);
    const m = parts[1] ?? "00";
    if (Number.isNaN(h)) return time24;
    if (appPrefs.timeFormat === "12") {
      const suf = h >= 12 ? "PM" : "AM";
      let hr = h % 12;
      if (hr === 0) hr = 12;
      return `${hr}:${m} ${suf}`;
    }
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  function formatTimeRange(ev) {
    if (!ev.startTime) return "";
    const a = formatTimeForDisplay(ev.startTime);
    if (ev.endTime) return `${a} – ${formatTimeForDisplay(ev.endTime)}`;
    return a;
  }

  /** Single refresh pass after task mutations (no duplicate renders of the same view). */
  function refreshUiAfterTasksChange() {
    renderTasks();
    renderDashboard();
    renderMotivation();
    if (currentView === "calendar") {
      renderCalendar();
      renderDayDetail();
    }
    refreshCoachBanner();
  }

  function refreshUiAfterEventsChange() {
    renderCalendar();
    renderDayDetail();
    renderDashboard();
    renderMotivation();
    refreshCoachBanner();
    runReminderTick();
  }

  function renderTasks() {
    const list = filteredTasks();
    els.taskList.innerHTML = "";

    const showEmpty = list.length === 0;
    els.tasksEmpty.hidden = !showEmpty;
    els.taskList.style.display = showEmpty ? "none" : "flex";

    list.forEach((task, i) => {
      const li = document.createElement("li");
      li.className = "task-item" + (task.completed ? " completed" : "");
      li.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;
      const ariaDone = task.completed ? t("tasks.markIncomplete") : t("tasks.markComplete");
      li.innerHTML = `
        <button type="button" class="task-check ${task.completed ? "checked" : ""}" aria-label="${ariaDone}"></button>
        <div class="task-body">
          <p class="task-title"></p>
          <div class="task-meta">
            <span class="badge-priority ${task.priority}"></span>
            <span class="task-due"></span>
          </div>
          <p class="task-notes-preview" hidden></p>
        </div>
        <div class="task-actions">
          <button type="button" class="edit-task">${t("tasks.edit")}</button>
          <button type="button" class="danger delete-task">${t("tasks.delete")}</button>
        </div>`;

      li.querySelector(".task-title").textContent = task.title;
      li.querySelector(".badge-priority").textContent = translatePriority(task.priority);
      const dueEl = li.querySelector(".task-due");
      dueEl.textContent = task.dueDate
        ? `${t("tasks.duePrefix")} ${shortDateLabel(task.dueDate)}`
        : "";
      const notesEl = li.querySelector(".task-notes-preview");
      if (task.notes && task.notes.trim()) {
        notesEl.hidden = false;
        notesEl.textContent = task.notes.trim();
      }

      const checkBtn = li.querySelector(".task-check");
      checkBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const prev = { completed: task.completed, completedAt: task.completedAt };
        task.completed = !task.completed;
        if (task.completed) {
          task.completedAt = formatYMD(new Date());
        } else {
          delete task.completedAt;
        }
        const updated = await updateTaskToSupabase(task);
        if (!updated) {
          task.completed = prev.completed;
          if (prev.completedAt) task.completedAt = prev.completedAt;
          else delete task.completedAt;
          return;
        }
        const touchYmd = task.completed && task.completedAt ? task.completedAt : null;
        suppressTasksRealtimeReload(750);
        await reloadTasksAndRender();
        if (touchYmd) touchMeActivityYmd(touchYmd);
        maybeUpdateBuddyRecord();
        await refreshAchievements(true);
      });

      li.querySelector(".edit-task").addEventListener("click", () => openTaskModal(task.id));

      li.querySelector(".delete-task").addEventListener("click", async () => {
        if (confirm(t("confirm.deleteTask"))) {
          const ok = await deleteTaskFromSupabase(task.id);
          if (!ok) return;
          suppressTasksRealtimeReload(750);
          await reloadTasksAndRender();
          maybeUpdateBuddyRecord();
        }
      });

      els.taskList.appendChild(li);
    });
  }

  function renderWeekdayLabels() {
    const fmt = new Intl.DateTimeFormat(getLocaleTag(), { weekday: "short" });
    const labels = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2024, 0, 7 + i);
      labels.push(fmt.format(d));
    }
    els.calWeekdayLabels.innerHTML = labels.map((d) => `<div class="cal-weekday">${d}</div>`).join("");
  }

  function getMonthGrid(anchor) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const cells = [];
    const startDate = addDays(first, -startPad);
    for (let i = 0; i < 42; i++) {
      cells.push(addDays(startDate, i));
    }
    return { cells, year, month };
  }

  function getWeekCells(anchor) {
    const start = startOfWeek(anchor);
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push(addDays(start, i));
    return cells;
  }

  function renderCalendar() {
    renderWeekdayLabels();
    const today = startOfDay(new Date());
    const todayStr = formatYMD(today);

    if (calMode === "month") {
      els.calTitle.textContent = calAnchor.toLocaleDateString(getLocaleTag(), { month: "long", year: "numeric" });
      const { cells, month } = getMonthGrid(calAnchor);
      els.calGrid.className = "cal-grid-body month-mode";
      els.calGrid.innerHTML = "";

      cells.forEach((d) => {
        const ymd = formatYMD(d);
        const inMonth = d.getMonth() === month;
        const cell = buildCalCell(d, ymd, todayStr, !inMonth, false);
        els.calGrid.appendChild(cell);
      });
    } else {
      const weekStart = startOfWeek(calAnchor);
      const weekEnd = endOfWeek(calAnchor);
      els.calTitle.textContent = `${weekStart.toLocaleDateString(getLocaleTag(), {
        month: "short",
        day: "numeric",
      })} – ${weekEnd.toLocaleDateString(getLocaleTag(), { month: "short", day: "numeric", year: "numeric" })}`;
      const cells = getWeekCells(calAnchor);
      els.calGrid.className = "cal-grid-body week-mode";
      els.calGrid.innerHTML = "";
      cells.forEach((d) => {
        const ymd = formatYMD(d);
        const cell = buildCalCell(d, ymd, todayStr, false, true);
        els.calGrid.appendChild(cell);
      });
    }
  }

  function buildCalCell(dateObj, ymd, todayStr, otherMonth, weekMode) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (otherMonth) cell.classList.add("other-month");
    if (ymd === todayStr) cell.classList.add("today");
    if (ymd === selectedDateStr) cell.classList.add("selected");
    const goal = getDayGoalStatus(ymd, todayStr);
    if (goal === "success") cell.classList.add("cal-cell--goal-success");
    else if (goal === "fail") cell.classList.add("cal-cell--goal-fail");

    const num = document.createElement("div");
    num.className = "cal-day-num";
    num.textContent = String(dateObj.getDate());
    cell.appendChild(num);

    const { dots, more } = calendarDotsForDay(ymd);
    const wrap = document.createElement("div");
    wrap.className = "cal-dots";
    dots.forEach((cls) => {
      const dot = document.createElement("span");
      dot.className = `cal-dot ${cls}`;
      wrap.appendChild(dot);
    });
    if (more > 0) {
      const m = document.createElement("span");
      m.className = "cal-more";
      m.textContent = `+${more}`;
      wrap.appendChild(m);
    }
    cell.appendChild(wrap);

    const dayEvSorted = eventsForDay(ymd);
    if (weekMode && dayEvSorted.length > 0) {
      const list = document.createElement("ul");
      list.className = "cal-cell-event-list";
      dayEvSorted.slice(0, 4).forEach((ev) => {
        const li = document.createElement("li");
        li.className = "cal-cell-event-line";
        const timePart = ev.allDay ? t("day.allDay") : formatTimeRange(ev) || "—";
        li.textContent = `${timePart} · ${ev.title}`;
        list.appendChild(li);
      });
      if (dayEvSorted.length > 4) {
        const moreLi = document.createElement("li");
        moreLi.className = "cal-cell-event-more muted";
        moreLi.textContent = `+${dayEvSorted.length - 4}`;
        list.appendChild(moreLi);
      }
      cell.appendChild(list);
    } else if (!weekMode) {
      const timed = dayEvSorted.filter((e) => !e.allDay && e.startTime);
      if (timed.length > 0) {
        const hint = document.createElement("div");
        hint.className = "cal-cell-time-hint";
        hint.textContent = formatTimeRange(timed[0]);
        if (timed.length > 1) hint.textContent += ` · +${timed.length - 1}`;
        cell.appendChild(hint);
      }
    }

    cell.addEventListener("click", () => {
      selectedDateStr = ymd;
      $$(".cal-cell").forEach((c) => c.classList.remove("selected"));
      cell.classList.add("selected");
      renderDayDetail();
    });

    return cell;
  }

  function formatRecapPeriodLabel() {
    const loc = getLocaleTag();
    if (recapViewMode === "week") {
      const cells = getWeekCells(calAnchor);
      const a = cells[0];
      const b = cells[6];
      return `${a.toLocaleDateString(loc, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(loc, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    }
    return calAnchor.toLocaleDateString(loc, { month: "long", year: "numeric" });
  }

  function renderCalendarRecap() {
    if (!els.recapPeriodLabel) return;
    const todayStr = formatYMD(startOfDay(new Date()));
    const ymds =
      recapViewMode === "week"
        ? getWeekCells(calAnchor).map((d) => formatYMD(d))
        : getMonthYmds(calAnchor);
    const { success, fail } = aggregateRecapForYmds(ymds, todayStr);
    els.recapPeriodLabel.textContent = formatRecapPeriodLabel();
    if (els.recapValSuccess) els.recapValSuccess.textContent = String(success);
    if (els.recapValFail) els.recapValFail.textContent = String(fail);
    const denom = success + fail;
    if (els.recapValRate) {
      els.recapValRate.textContent = denom === 0 ? "—" : `${Math.round((100 * success) / denom)}%`;
    }
    const pctOk = denom === 0 ? 0 : (100 * success) / denom;
    const pctBad = denom === 0 ? 0 : (100 * fail) / denom;
    if (els.recapBarSuccess) els.recapBarSuccess.style.width = `${pctOk}%`;
    if (els.recapBarFail) els.recapBarFail.style.width = `${pctBad}%`;
  }

  function openCalendarRecap() {
    if (!appPrefs.recapWeekEnabled && !appPrefs.recapMonthEnabled) {
      showToast(t("settings.recapAllOff"));
      return;
    }
    if (appPrefs.recapWeekEnabled) {
      recapViewMode = "week";
      if (els.recapSegWeek) els.recapSegWeek.classList.add("active");
      if (els.recapSegMonth) els.recapSegMonth.classList.remove("active");
    } else {
      recapViewMode = "month";
      if (els.recapSegMonth) els.recapSegMonth.classList.add("active");
      if (els.recapSegWeek) els.recapSegWeek.classList.remove("active");
    }
    renderCalendarRecap();
    applyDomI18n();
    showModal(els.calendarRecapModal, els.calendarRecapBackdrop);
  }

  function closeCalendarRecapModal() {
    hideModal(els.calendarRecapModal, els.calendarRecapBackdrop);
  }

  function renderDayDetail() {
    const ymd = selectedDateStr;
    els.selectedDayLabel.textContent = formatDayHeading(ymd);
    els.selectedDayDate.textContent = longDateLabel(ymd);

    const dayTasks = sortTasksForDisplay(tasksForDay(ymd), els.taskSort.value);
    const dayEv = eventsForDay(ymd);

    els.dayTasksList.innerHTML = "";
    els.dayEventsList.innerHTML = "";

    const noTasks = dayTasks.length === 0;
    els.dayTasksEmpty.hidden = !noTasks;
    els.dayTasksList.style.display = noTasks ? "none" : "block";
    els.dayTasksEmpty.textContent = t("day.noTasks");

    const noEv = dayEv.length === 0;
    els.dayEventsEmpty.hidden = !noEv;
    els.dayEventsList.style.display = noEv ? "none" : "block";
    els.dayEventsEmpty.textContent = t("day.noEvents");

    dayTasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = "mini-item mini-item--task";
      li.innerHTML = `
        <span class="mini-icon mini-icon--task" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </span>
        <div class="mini-item-main">
          <strong class="mini-item-title"></strong>
          <span class="mini-item-meta"></span>
        </div>`;
      li.querySelector(".mini-item-title").textContent = (task.completed ? "✓ " : "") + task.title;
      li.querySelector(".mini-item-meta").textContent = `${translatePriority(task.priority)} · ${t("tasks.prioritySuffix")}`;
      li.addEventListener("click", () => openTaskModal(task.id));
      els.dayTasksList.appendChild(li);
    });

    dayEv.forEach((ev) => {
      const li = document.createElement("li");
      li.className = "mini-item mini-item--event";
      li.style.borderLeftColor = EVENT_COLORS[ev.color] || EVENT_COLORS.violet;
      const timeLine = ev.allDay ? t("day.allDay") : formatTimeRange(ev) || t("day.timeNotSet");
      li.innerHTML = `
        <span class="mini-icon mini-icon--event" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>
        </span>
        <div class="mini-item-main">
          <span class="event-time-badge">${timeLine}</span>
          <strong class="mini-item-title"></strong>
          <span class="mini-item-notes muted small" hidden></span>
        </div>`;
      li.querySelector(".mini-item-title").textContent = ev.title;
      const notesEl = li.querySelector(".mini-item-notes");
      if (ev.notes && ev.notes.trim()) {
        notesEl.hidden = false;
        notesEl.textContent = ev.notes.trim();
      }
      li.addEventListener("click", () => openEventModal(ev.id));
      els.dayEventsList.appendChild(li);
    });
  }

  // ——— Modals ———

  function suppressTasksRealtimeReload(ms = 600) {
    suppressTasksRealtimeReloadUntil = Date.now() + ms;
  }

  function populateShareScopeSelect(selectEl, selectedGroupId) {
    if (!selectEl) return;
    const want = selectedGroupId && groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : "";
    selectEl.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.setAttribute("data-i18n", "share.scopePrivate");
    o0.textContent = t("share.scopePrivate");
    selectEl.appendChild(o0);
    groups.forEach((g) => {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name;
      selectEl.appendChild(o);
    });
    selectEl.value = want;
    applyDomI18n();
  }

  function openTaskModal(id) {
    const isNew = !id;
    const defaultGroup =
      activeGroupId && groups.some((g) => g.id === activeGroupId) ? activeGroupId : null;
    const task = isNew
      ? {
          id: "",
          title: "",
          notes: "",
          completed: false,
          priority: "medium",
          dueDate: selectedDateStr || null,
          createdAt: Date.now(),
          groupId: defaultGroup,
        }
      : tasks.find((x) => x.id === id);

    if (!task) return;

    applyDomI18n();
    els.taskModalTitle.textContent = isNew ? t("taskModal.new") : t("taskModal.edit");
    if (els.taskForm) els.taskForm.dataset.taskMode = isNew ? "create" : "edit";
    els.taskId.value = task.id || "";
    els.taskTitle.value = task.title || "";
    els.taskNotes.value = task.notes || "";
    els.taskPriority.value = task.priority || "medium";
    els.taskDue.value = task.dueDate || "";
    populateShareScopeSelect(els.taskShareScope, task.groupId || null);
    els.taskCompleted.checked = !!task.completed;
    els.taskDelete.hidden = isNew;
    [...els.taskPriority.options].forEach((opt) => {
      opt.textContent = translatePriority(opt.value);
    });

    showModal(els.taskModal, els.taskModalBackdrop);
    setTimeout(() => els.taskTitle.focus(), 50);
  }

  function resetTaskModalForm() {
    if (!els.taskForm) return;
    els.taskForm.reset();
    if (els.taskId) els.taskId.value = "";
    if (els.taskDelete) els.taskDelete.hidden = true;
    try {
      delete els.taskForm.dataset.taskMode;
    } catch (_) {}
  }

  function closeTaskModal() {
    hideModal(els.taskModal, els.taskModalBackdrop);
    resetTaskModalForm();
  }

  const EVENT_TIME_MIN_STEP = 5;

  function padTimeUnit(n) {
    return String(n).padStart(2, "0");
  }

  function snapMinuteToStep(min, step) {
    const x = Math.round(min / step) * step;
    return Math.min(55, Math.max(0, x));
  }

  function parseHHMMToParts(s) {
    if (!s || typeof s !== "string") return { h: 9, m: 0 };
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { h: 9, m: 0 };
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return { h, m: snapMinuteToStep(min, EVENT_TIME_MIN_STEP) };
  }

  let eventTimeSelectsReady = false;

  function ensureEventTimeSelectsPopulated() {
    if (eventTimeSelectsReady || !els.eventStartHour) return;
    const addHours = (sel, withBlank) => {
      if (!sel) return;
      sel.innerHTML = "";
      if (withBlank) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "—";
        sel.appendChild(o);
      }
      for (let h = 0; h < 24; h++) {
        const o = document.createElement("option");
        o.value = String(h);
        o.textContent = padTimeUnit(h);
        sel.appendChild(o);
      }
    };
    const addMins = (sel) => {
      if (!sel) return;
      sel.innerHTML = "";
      for (let min = 0; min < 60; min += EVENT_TIME_MIN_STEP) {
        const o = document.createElement("option");
        o.value = padTimeUnit(min);
        o.textContent = padTimeUnit(min);
        sel.appendChild(o);
      }
    };
    addHours(els.eventStartHour, false);
    addMins(els.eventStartMin);
    addHours(els.eventEndHour, true);
    addMins(els.eventEndMin);
    eventTimeSelectsReady = true;
  }

  function setEventTimePickersFromStored(startHHMM, endHHMM, allDay) {
    if (allDay) return;
    ensureEventTimeSelectsPopulated();
    const s = parseHHMMToParts(startHHMM || "09:00");
    if (els.eventStartHour) els.eventStartHour.value = String(s.h);
    if (els.eventStartMin) els.eventStartMin.value = padTimeUnit(s.m);
    if (!endHHMM) {
      if (els.eventEndHour) els.eventEndHour.value = "";
      if (els.eventEndMin) {
        els.eventEndMin.value = padTimeUnit(0);
        els.eventEndMin.disabled = true;
      }
    } else {
      const e = parseHHMMToParts(endHHMM);
      if (els.eventEndHour) els.eventEndHour.value = String(e.h);
      if (els.eventEndMin) {
        els.eventEndMin.disabled = false;
        els.eventEndMin.value = padTimeUnit(e.m);
      }
    }
  }

  function getStartTimeFromPickers() {
    if (!els.eventStartHour || !els.eventStartMin) return "";
    const h = els.eventStartHour.value;
    const m = els.eventStartMin.value;
    if (h === "" || m === "") return "";
    return `${padTimeUnit(parseInt(h, 10))}:${m}`;
  }

  function getEndTimeFromPickers() {
    if (!els.eventEndHour || !els.eventEndMin) return null;
    if (els.eventEndHour.value === "") return null;
    const h = els.eventEndHour.value;
    const m = els.eventEndMin.value || padTimeUnit(0);
    return `${padTimeUnit(parseInt(h, 10))}:${m}`;
  }

  function syncEventEndMinEnabled() {
    const on = els.eventEndHour && els.eventEndHour.value !== "";
    if (els.eventEndMin) {
      els.eventEndMin.disabled = !on;
      if (!on) els.eventEndMin.value = padTimeUnit(0);
    }
  }

  function openEventModal(id) {
    const isNew = !id;
    const defaultGroup =
      activeGroupId && groups.some((g) => g.id === activeGroupId) ? activeGroupId : null;
    const ev = isNew
      ? {
          id: "",
          title: "",
          notes: "",
          date: selectedDateStr || formatYMD(new Date()),
          allDay: false,
          startTime: "09:00",
          endTime: "",
          color: "violet",
          streakDone: false,
          createdAt: Date.now(),
          groupId: defaultGroup,
        }
      : events.find((x) => x.id === id);

    if (!ev) return;

    ensureEventTimeSelectsPopulated();
    applyDomI18n();
    els.eventModalTitle.textContent = isNew ? t("eventModal.new") : t("eventModal.edit");
    if (els.eventForm) els.eventForm.dataset.eventMode = isNew ? "create" : "edit";
    els.eventId.value = ev.id || "";
    els.eventTitle.value = ev.title || "";
    els.eventNotes.value = ev.notes || "";
    els.eventDate.value = ev.date;
    els.eventColor.value = ev.color || "violet";
    populateShareScopeSelect(els.eventShareScope, ev.groupId || null);
    els.eventAllDay.checked = !!ev.allDay;
    setEventTimePickersFromStored(ev.startTime, ev.endTime, !!ev.allDay);
    if (els.eventStreakDone) els.eventStreakDone.checked = !!ev.streakDone;
    toggleEventTimeRow();
    els.eventDelete.hidden = isNew;
    [...els.eventColor.options].forEach((opt) => {
      opt.textContent = t("color." + opt.value);
    });

    showModal(els.eventModal, els.eventModalBackdrop);
    setTimeout(() => els.eventTitle.focus(), 50);
  }

  function toggleEventTimeRow() {
    const allDay = els.eventAllDay.checked;
    if (!allDay) ensureEventTimeSelectsPopulated();
    els.eventTimeRow.style.display = allDay ? "none" : "grid";
    els.eventTimeRow.style.gridTemplateColumns = allDay ? "" : "1fr 1fr";
    if (els.eventStreakRow) els.eventStreakRow.hidden = allDay;
    if (els.eventTimePanel) els.eventTimePanel.classList.toggle("event-time-panel--allday", allDay);
    if (!allDay && eventTimeSelectsReady && els.eventStartHour) {
      if (!els.eventStartHour.value && els.eventStartHour.options.length) {
        els.eventStartHour.value = "9";
        if (els.eventStartMin) els.eventStartMin.value = "00";
      }
      syncEventEndMinEnabled();
    }
    if (els.eventStartHour) els.eventStartHour.setAttribute("aria-required", allDay ? "false" : "true");
  }

  function closeEventModal() {
    hideModal(els.eventModal, els.eventModalBackdrop);
  }

  function showModal(modal, backdrop) {
    backdrop.hidden = false;
    modal.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function hideModal(modal, backdrop) {
    backdrop.hidden = true;
    modal.hidden = true;
    backdrop.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function handleTaskSubmit(e) {
    console.log("TASK SUBMIT TRIGGERED");
    e.preventDefault();
    if (taskSubmitBusy) return;
    taskSubmitBusy = true;
    try {
      const isEditMode = Boolean(String(els.taskId.value || "").trim());
      console.log("Task submit triggered", { mode: isEditMode ? "edit" : "create" });
      const id = isEditMode ? String(els.taskId.value).trim() : crypto.randomUUID();
      const existing = isEditMode ? tasks.find((x) => x.id === id) : null;
      const completed = els.taskCompleted.checked;
      const scopeGid = els.taskShareScope && els.taskShareScope.value ? els.taskShareScope.value.trim() : "";
      const groupOk = scopeGid && groups.some((g) => g.id === scopeGid);
      const payload = {
        id,
        title: els.taskTitle.value.trim(),
        notes: els.taskNotes.value.trim(),
        priority: els.taskPriority.value,
        dueDate: els.taskDue.value || null,
        completed,
        createdAt: existing ? existing.createdAt : Date.now(),
        groupId: groupOk ? scopeGid : null,
      };
      if (completed) {
        payload.completedAt = existing && existing.completedAt ? existing.completedAt : formatYMD(new Date());
      } else {
        delete payload.completedAt;
      }
      if (!payload.title) {
        showToast(t("taskModal.titleRequired"));
        els.taskTitle?.focus();
        return;
      }

      console.log("Task object before save:", payload);
      const saved = isEditMode ? await updateTaskToSupabase(payload) : await insertTaskToSupabase(payload);
      if (!saved) {
        showToast(t("taskModal.saveFailed"));
        return;
      }
      console.log("Task saved (mapped):", saved);
      if (completed && payload.completedAt) touchMeActivityYmd(payload.completedAt);

      suppressTasksRealtimeReload(750);
      await reloadTasksAndRender();
      maybeUpdateBuddyRecord();
      await refreshAchievements(true);
      closeTaskModal();
    } catch (err) {
      console.error("handleTaskSubmit: caught exception:", err);
      const line = err instanceof Error ? err.message : String(err);
      console.error("handleTaskSubmit: message for UI:", line);
      const maxLen = 380;
      showToast(line.length > maxLen ? line.slice(0, maxLen - 1) + "…" : line);
    } finally {
      taskSubmitBusy = false;
    }
  }

  async function handleEventSubmit(e) {
    e.preventDefault();
    if (eventSubmitBusy) return;
    eventSubmitBusy = true;
    try {
      const isEditMode = Boolean(String(els.eventId.value || "").trim());
      const id = isEditMode ? String(els.eventId.value).trim() : crypto.randomUUID();
      const existing = isEditMode ? events.find((x) => x.id === id) : null;
      const allDay = els.eventAllDay.checked;
      const streakDone = !allDay && els.eventStreakDone && els.eventStreakDone.checked;
      const startStr = allDay ? null : getStartTimeFromPickers();
      const endStr = allDay ? null : getEndTimeFromPickers();
      const scopeGid = els.eventShareScope && els.eventShareScope.value ? els.eventShareScope.value.trim() : "";
      const groupOk = scopeGid && groups.some((g) => g.id === scopeGid);
      const payload = {
        id,
        title: els.eventTitle.value.trim(),
        notes: els.eventNotes.value.trim(),
        date: els.eventDate.value,
        allDay,
        startTime: startStr || null,
        endTime: endStr || null,
        color: els.eventColor.value,
        streakDone: !!streakDone,
        createdAt: existing ? existing.createdAt : Date.now(),
        groupId: groupOk ? scopeGid : null,
      };
      if (!payload.title || !payload.date) return;
      if (!allDay && !payload.startTime) {
        showToast(t("eventModal.errStartRequired"));
        try {
          els.eventStartHour?.focus();
        } catch (_) {}
        return;
      }

      const ok = isEditMode ? await updateEventToSupabase(payload) : await insertEventToSupabase(payload);
      if (!ok) return;
      if (payload.streakDone) {
        touchMeActivityYmd(payload.date);
        maybeUpdateBuddyRecord();
      }

      events = await loadEventsFromSupabase();
      await reconcilePointsLogWithSources();
      await refreshAchievements(true);
      closeEventModal();
      selectedDateStr = payload.date;
      refreshUiAfterEventsChange();
    } finally {
      eventSubmitBusy = false;
    }
  }

  // ——— Theme ———

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    appPrefs.themeMode = isDark ? "light" : "dark";
    saveAppPrefs();
    syncSettingsThemeControls();
  }

  // ——— Calendar nav ———

  function calNavigate(dir) {
    if (calMode === "month") {
      calAnchor = addMonths(calAnchor, dir);
    } else {
      calAnchor = addDays(calAnchor, dir * 7);
    }
    renderCalendar();
    if (!els.calendarRecapModal?.hidden) renderCalendarRecap();
  }

  function goToday() {
    const now = new Date();
    calAnchor = calMode === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : startOfWeek(now);
    selectedDateStr = formatYMD(now);
    renderCalendar();
    renderDayDetail();
    if (!els.calendarRecapModal?.hidden) renderCalendarRecap();
  }

  // ——— Auth, cookies, legal (client-side; connect backend for production) ———

  let authUsers = [];
  /** @type {{ userId: string, email: string, name: string, provider: string } | null} */
  let authSession = null;
  let mainAppInitialized = false;
  /** Prevents duplicate task modal / form listeners if init ever re-ran */
  let taskModalBindingsInitialized = false;
  let taskSubmitBusy = false;
  let eventModalBindingsInitialized = false;
  let eventSubmitBusy = false;
  let tasksRealtimeChannel = null;
  let eventsRealtimeChannel = null;
  let selfcareRealtimeChannel = null;
  let focusRealtimeChannel = null;
  let achievementsRealtimeChannel = null;
  let buddyRealtimeChannel = null;
  let pointsRealtimeChannel = null;
  let refreshTasksRealtimeTimer = 0;
  let refreshEventsRealtimeTimer = 0;
  let refreshSelfcareRealtimeTimer = 0;
  let refreshFocusRealtimeTimer = 0;
  let refreshAchievementsRealtimeTimer = 0;
  let refreshBuddyRealtimeTimer = 0;
  let refreshPointsRealtimeTimer = 0;
  /** Skip task realtime reload briefly after local mutations to avoid racing with our own refetch. */
  let suppressTasksRealtimeReloadUntil = 0;

  function loadAuthUsers() {
    authUsers = loadJSON(STORAGE_USERS, []);
    if (!Array.isArray(authUsers)) authUsers = [];
  }

  function saveAuthUsers() {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(authUsers));
  }

  function readSessionRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isSessionValid() {
    const s = readSessionRaw();
    if (!s || !s.userId) return false;
    return authUsers.some((u) => u.id === s.userId);
  }

  function persistSession(s) {
    authSession = s;
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(s));
  }

  function clearSession() {
    authSession = null;
    localStorage.removeItem(STORAGE_SESSION);
  }

  async function sha256Hex(str) {
    try {
      const buf = new TextEncoder().encode(str);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return "fb-" + String(h) + "-" + btoa(unescape(encodeURIComponent(str.slice(0, 64)))).slice(0, 32);
    }
  }

  function passwordHashInput(password, email) {
    return sha256Hex(password + ":" + String(email).toLowerCase().trim());
  }

  function validatePasswordStrength(pw) {
    if (!pw || pw.length < 8) return false;
    if (!/[a-zA-Z]/.test(pw)) return false;
    if (!/[0-9]/.test(pw)) return false;
    return true;
  }

  function normalizeEmail(e) {
    return String(e || "")
      .trim()
      .toLowerCase();
  }

  function showAuthPanel(mode) {
    if (els.authPanelWelcome) els.authPanelWelcome.hidden = mode !== "welcome";
    if (els.authPanelLogin) els.authPanelLogin.hidden = mode !== "login";
    if (els.authPanelRegister) els.authPanelRegister.hidden = mode !== "register";
  }

  function showAuthScreen() {
    if (els.authGate) els.authGate.hidden = false;
    if (els.app) els.app.hidden = true;
    document.body.style.overflow = "";
    showAuthPanel("welcome");
  }

  function hideAuthScreen() {
    if (els.authGate) els.authGate.hidden = true;
    if (els.app) els.app.hidden = false;
  }

  function setAuthError(el, msg) {
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  async function loginUserSuccess(user, provider) {
    const s = { userId: user.id, email: user.email, name: user.name || user.email.split("@")[0], provider };
    persistSession(s);
    profile.id = user.id;
    profile.displayName = user.name || profile.displayName;
    saveProfile();
    hideAuthScreen();
    applyDomI18n();
    try {
      await loadState();
    } catch (e) {
      console.error("loginUserSuccess loadState:", e);
    }
    if (!mainAppInitialized) {
      mainAppInitialized = true;
      await runMainAppInit();
    } else {
      initAvatarPicker();
      applyProfileAvatars();
      void startSupabaseRealtime();
    }
    updateAccountSettingsLabel();
    maybeShowCookieBar();
    setTimeout(() => maybeShowWelcomeModal(), 300);
    showToast(t("account.welcome"));
  }

  function updateAccountSettingsLabel() {
    const s = readSessionRaw();
    if (els.accountSignedInLabel && s) {
      els.accountSignedInLabel.textContent = s.email + " · " + (s.provider || "email");
    }
  }

  function logoutUser() {
    void stopSupabaseRealtime();
    try {
      sessionStorage.removeItem(WELCOME_SESSION_KEY);
    } catch (_) {}
    clearSession();
    showAuthScreen();
    applyDomI18n();
    showToast(t("account.loggedOut"));
  }

  function deleteAccountFlow() {
    const s = readSessionRaw();
    if (!s || !confirm(t("account.deleteConfirm"))) return;
    authUsers = authUsers.filter((u) => u.id !== s.userId);
    saveAuthUsers();
    try {
      sessionStorage.removeItem(WELCOME_SESSION_KEY);
    } catch (_) {}
    clearSession();
    showAuthScreen();
    applyDomI18n();
    showToast(t("account.deleted"));
  }

  async function handleAuthLoginSubmit(e) {
    e.preventDefault();

    const email = document.getElementById("authLoginEmail").value;
    const password = document.getElementById("authLoginPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(els.authLoginError, error.message);
      return;
    }

    const u = data?.user;
    if (!u) {
      setAuthError(els.authLoginError, "Kein Benutzer in der Antwort.");
      return;
    }

    const meta = u.user_metadata || {};
    const name = meta.full_name || meta.name || String(u.email || email || "").split("@")[0] || "You";
    await loginUserSuccess({ id: u.id, email: u.email || email, name }, "email");
  }

  async function handleAuthRegisterSubmit(e) {
    e.preventDefault();
  
    const email = document.getElementById("authRegEmail").value;
    const password = document.getElementById("authRegPassword").value;
  
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
  
    if (error) {
      alert("Registrierung fehlgeschlagen: " + error.message);
      return;
    }
  
    alert("Account erstellt! Check deine Emails 📧");
  }

  async function demoOAuthLogin(provider) {
    const email = provider + "-demo@flow.local";
    let user = authUsers.find((u) => u.email === email);
    if (!user) {
      user = {
        id: uid(),
        email,
        name: provider === "google" ? "Google demo" : "Apple demo",
        provider,
        createdAt: Date.now(),
      };
      authUsers.push(user);
      saveAuthUsers();
    }
    loginUserSuccess(user, provider);
  }

  async function handleGoogleClick() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  
    if (error) {
      alert("Google Login Fehler: " + error.message);
    }
  }

  function handleAppleClick() {
    const id = AUTH_CONFIG.appleClientId || "";
    if (!id || id.indexOf("YOUR_") === 0) {
      demoOAuthLogin("apple");
      return;
    }
    showToast(t("auth.configureOAuth"));
  }

  function togglePasswordVisibility(inputEl, btnEl) {
    if (!inputEl || !btnEl) return;
    const isPw = inputEl.getAttribute("type") === "password";
    inputEl.setAttribute("type", isPw ? "text" : "password");
    btnEl.textContent = t(isPw ? "auth.hidePassword" : "auth.showPassword");
  }

  function loadCookieConsent() {
    return loadJSON(STORAGE_COOKIE_CONSENT, null);
  }

  function saveCookieConsent(prefs) {
    const payload = {
      version: 1,
      necessary: true,
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_COOKIE_CONSENT, JSON.stringify(payload));
    hideCookieBar();
    applyOptionalCookiesFromConsent(payload);
    queueWelcomeModalAfterConsent();
  }

  function applyOptionalCookiesFromConsent(c) {
    window.__flowConsent = c;
    if (c && c.analytics) {
      /* Integrate analytics SDK here when consent granted */
    }
  }

  function hideCookieBar() {
    if (els.cookieBar) els.cookieBar.hidden = true;
  }

  function maybeShowCookieBar() {
    if (!isSessionValid()) return;
    const c = loadCookieConsent();
    if (c && c.savedAt) {
      hideCookieBar();
      applyOptionalCookiesFromConsent(c);
      return;
    }
    if (els.cookieBar) els.cookieBar.hidden = false;
  }

  function openCookieSettingsModal() {
    const c = loadCookieConsent() || { analytics: false, marketing: false };
    if (els.cookieToggleAnalytics) els.cookieToggleAnalytics.checked = !!c.analytics;
    if (els.cookieToggleMarketing) els.cookieToggleMarketing.checked = !!c.marketing;
    showModal(els.cookieSettingsModal, els.cookieSettingsBackdrop);
  }

  function closeCookieSettingsModal() {
    hideModal(els.cookieSettingsModal, els.cookieSettingsBackdrop);
  }

  function saveCookieSettingsFromModal() {
    saveCookieConsent({
      analytics: !!(els.cookieToggleAnalytics && els.cookieToggleAnalytics.checked),
      marketing: !!(els.cookieToggleMarketing && els.cookieToggleMarketing.checked),
    });
    closeCookieSettingsModal();
    showToast(t("cookie.savePrefs"));
  }

  function openLegalModal(kind) {
    if (!els.legalModal || !els.legalModalBody) return;
    const isTerms = kind === "terms";
    if (els.legalModalTitle) els.legalModalTitle.textContent = t(isTerms ? "legal.termsTitle" : "legal.privacyTitle");
    els.legalModalBody.innerHTML = t(isTerms ? "legal.termsBody" : "legal.privacyBody");
    showModal(els.legalModal, els.legalModalBackdrop);
  }

  function closeLegalModal() {
    hideModal(els.legalModal, els.legalModalBackdrop);
  }

  function initAuthAndCookieListeners() {
    els.authBtnGoogle?.addEventListener("click", handleGoogleClick);
    els.authBtnApple?.addEventListener("click", handleAppleClick);
    els.authBtnShowEmailLogin?.addEventListener("click", () => {
      applyDomI18n();
      showAuthPanel("login");
      setAuthError(els.authLoginError, "");
      setTimeout(() => els.authLoginEmail?.focus(), 50);
    });
    els.authBtnShowRegister?.addEventListener("click", () => {
      applyDomI18n();
      showAuthPanel("register");
      setAuthError(els.authRegisterError, "");
      setTimeout(() => els.authRegName?.focus(), 50);
    });
    els.authBtnQuickLogin?.addEventListener("click", () => {
      applyDomI18n();
      showAuthPanel("login");
      setTimeout(() => els.authLoginEmail?.focus(), 50);
    });
    els.authBackFromLogin?.addEventListener("click", () => {
      showAuthPanel("welcome");
    });
    els.authBackFromRegister?.addEventListener("click", () => {
      showAuthPanel("welcome");
    });
    els.authFormLogin?.addEventListener("submit", handleAuthLoginSubmit);
    els.authFormRegister?.addEventListener("submit", handleAuthRegisterSubmit);
    els.authToggleLoginPw?.addEventListener("click", () => togglePasswordVisibility(els.authLoginPassword, els.authToggleLoginPw));
    els.authToggleRegPw?.addEventListener("click", () => togglePasswordVisibility(els.authRegPassword, els.authToggleRegPw));
    els.authLinkTerms?.addEventListener("click", () => openLegalModal("terms"));
    els.authLinkPrivacyFromGate?.addEventListener("click", () => openLegalModal("privacy"));

    els.cookieAcceptAll?.addEventListener("click", () =>
      saveCookieConsent({ analytics: true, marketing: true })
    );
    els.cookieNecessaryOnly?.addEventListener("click", () => saveCookieConsent({ analytics: false, marketing: false }));
    els.cookieOpenSettings?.addEventListener("click", openCookieSettingsModal);
    els.cookieSettingsClose?.addEventListener("click", closeCookieSettingsModal);
    els.cookieSettingsBackdrop?.addEventListener("click", closeCookieSettingsModal);
    els.cookieSettingsSave?.addEventListener("click", saveCookieSettingsFromModal);

    els.btnLogout?.addEventListener("click", () => {
      closeSettingsModal();
      logoutUser();
    });
    els.btnDeleteAccount?.addEventListener("click", () => {
      closeSettingsModal();
      deleteAccountFlow();
    });
    els.btnCookiePrefs?.addEventListener("click", () => {
      closeSettingsModal();
      openCookieSettingsModal();
    });
    els.btnOpenPrivacyFromSettings?.addEventListener("click", () => openLegalModal("privacy"));
    els.btnOpenTermsFromSettings?.addEventListener("click", () => openLegalModal("terms"));
    els.legalModalClose?.addEventListener("click", closeLegalModal);
    els.legalModalBackdrop?.addEventListener("click", closeLegalModal);
  }

  // ——— Init & events ———

  async function init() {
    calAnchor = startOfDay(new Date());
    selectedDateStr = formatYMD(new Date());
    loadAppPrefs();
    initLanguage();
    initAuthAndCookieListeners();

    let session = null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session) session = data.session;
    } catch (e) {
      console.error("auth.getSession:", e);
    }

    if (!session) {
      try {
        await loadState();
      } catch (e) {
        console.error("init loadState (guest):", e);
      }
      showAuthScreen();
      applyDomI18n();
      return;
    }

    document.getElementById("authGate").hidden = true;
    document.getElementById("app").hidden = false;

    hideAuthScreen();
    authSession = readSessionRaw();
    try {
      await loadState();
    } catch (e) {
      console.error("init loadState (authenticated):", e);
    }
    await runMainAppInit();
    maybeShowCookieBar();
    setTimeout(() => maybeShowWelcomeModal(), 300);
  }

  async function stopSupabaseRealtime() {
    try {
      if (tasksRealtimeChannel) {
        await supabase.removeChannel(tasksRealtimeChannel);
        tasksRealtimeChannel = null;
      }
      if (eventsRealtimeChannel) {
        await supabase.removeChannel(eventsRealtimeChannel);
        eventsRealtimeChannel = null;
      }
      if (selfcareRealtimeChannel) {
        await supabase.removeChannel(selfcareRealtimeChannel);
        selfcareRealtimeChannel = null;
      }
      if (focusRealtimeChannel) {
        await supabase.removeChannel(focusRealtimeChannel);
        focusRealtimeChannel = null;
      }
      if (achievementsRealtimeChannel) {
        await supabase.removeChannel(achievementsRealtimeChannel);
        achievementsRealtimeChannel = null;
      }
      if (buddyRealtimeChannel) {
        await supabase.removeChannel(buddyRealtimeChannel);
        buddyRealtimeChannel = null;
      }
      if (pointsRealtimeChannel) {
        await supabase.removeChannel(pointsRealtimeChannel);
        pointsRealtimeChannel = null;
      }
    } catch (err) {
      console.error("Supabase realtime stop:", err);
    }
    if (refreshTasksRealtimeTimer) {
      clearTimeout(refreshTasksRealtimeTimer);
      refreshTasksRealtimeTimer = 0;
    }
    if (refreshEventsRealtimeTimer) {
      clearTimeout(refreshEventsRealtimeTimer);
      refreshEventsRealtimeTimer = 0;
    }
    if (refreshSelfcareRealtimeTimer) {
      clearTimeout(refreshSelfcareRealtimeTimer);
      refreshSelfcareRealtimeTimer = 0;
    }
    if (refreshFocusRealtimeTimer) {
      clearTimeout(refreshFocusRealtimeTimer);
      refreshFocusRealtimeTimer = 0;
    }
    if (refreshAchievementsRealtimeTimer) {
      clearTimeout(refreshAchievementsRealtimeTimer);
      refreshAchievementsRealtimeTimer = 0;
    }
    if (refreshBuddyRealtimeTimer) {
      clearTimeout(refreshBuddyRealtimeTimer);
      refreshBuddyRealtimeTimer = 0;
    }
    if (refreshPointsRealtimeTimer) {
      clearTimeout(refreshPointsRealtimeTimer);
      refreshPointsRealtimeTimer = 0;
    }
  }

  async function reloadTasksAfterRemoteChange() {
    if (Date.now() < suppressTasksRealtimeReloadUntil) {
      return;
    }
    try {
      await reloadTasksAndRender();
    } catch (err) {
      console.error("Task reload after realtime:", err);
    }
  }

  async function reloadEventsAfterRemoteChange() {
    try {
      events = await loadEventsFromSupabase();
      await reconcilePointsLogWithSources();
      refreshUiAfterEventsChange();
    } catch (err) {
      console.error("Event reload after realtime:", err);
    }
  }

  function scheduleTasksRealtimeReload() {
    if (refreshTasksRealtimeTimer) clearTimeout(refreshTasksRealtimeTimer);
    refreshTasksRealtimeTimer = window.setTimeout(() => {
      refreshTasksRealtimeTimer = 0;
      void reloadTasksAfterRemoteChange();
    }, 200);
  }

  function scheduleEventsRealtimeReload() {
    if (refreshEventsRealtimeTimer) clearTimeout(refreshEventsRealtimeTimer);
    refreshEventsRealtimeTimer = window.setTimeout(() => {
      refreshEventsRealtimeTimer = 0;
      void reloadEventsAfterRemoteChange();
    }, 200);
  }

  async function reloadSelfcareAfterRemoteChange() {
    try {
      await loadSelfcareEntriesFromSupabase();
      renderSelfcare();
    } catch (err) {
      console.error("Self-care reload after realtime:", err);
    }
  }

  async function reloadFocusAfterRemoteChange() {
    try {
      await loadFocusSessionsFromSupabase();
      renderFocus();
    } catch (err) {
      console.error("Focus reload after realtime:", err);
    }
  }

  async function reloadAchievementsAfterRemoteChange() {
    try {
      await loadAchievementsFromSupabase();
      renderAchievements();
    } catch (err) {
      console.error("Achievements reload after realtime:", err);
    }
  }

  async function reloadBuddyAfterRemoteChange() {
    try {
      await loadBuddyStateFromSupabase();
      syncBuddyPartnerCheckbox();
      renderMotivation();
      refreshCoachBanner();
    } catch (err) {
      console.error("Buddy reload after realtime:", err);
    }
  }

  async function reloadPointsAfterRemoteChange() {
    try {
      await loadPointsLogFromSupabase();
      renderMotivation();
      if (currentView === "achievements") renderAchievements();
      if (currentView === "groups") void renderGroups();
      refreshCoachBanner();
    } catch (err) {
      console.error("Points reload after realtime:", err);
    }
  }

  function scheduleSelfcareRealtimeReload() {
    if (refreshSelfcareRealtimeTimer) clearTimeout(refreshSelfcareRealtimeTimer);
    refreshSelfcareRealtimeTimer = window.setTimeout(() => {
      refreshSelfcareRealtimeTimer = 0;
      void reloadSelfcareAfterRemoteChange();
    }, 200);
  }

  function scheduleFocusRealtimeReload() {
    if (refreshFocusRealtimeTimer) clearTimeout(refreshFocusRealtimeTimer);
    refreshFocusRealtimeTimer = window.setTimeout(() => {
      refreshFocusRealtimeTimer = 0;
      void reloadFocusAfterRemoteChange();
    }, 200);
  }

  function scheduleAchievementsRealtimeReload() {
    if (refreshAchievementsRealtimeTimer) clearTimeout(refreshAchievementsRealtimeTimer);
    refreshAchievementsRealtimeTimer = window.setTimeout(() => {
      refreshAchievementsRealtimeTimer = 0;
      void reloadAchievementsAfterRemoteChange();
    }, 200);
  }

  function scheduleBuddyRealtimeReload() {
    if (refreshBuddyRealtimeTimer) clearTimeout(refreshBuddyRealtimeTimer);
    refreshBuddyRealtimeTimer = window.setTimeout(() => {
      refreshBuddyRealtimeTimer = 0;
      void reloadBuddyAfterRemoteChange();
    }, 200);
  }

  function schedulePointsRealtimeReload() {
    if (refreshPointsRealtimeTimer) clearTimeout(refreshPointsRealtimeTimer);
    refreshPointsRealtimeTimer = window.setTimeout(() => {
      refreshPointsRealtimeTimer = 0;
      void reloadPointsAfterRemoteChange();
    }, 200);
  }

  async function startSupabaseRealtime() {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;

      await stopSupabaseRealtime();

      const groupIds = await fetchMySupabaseGroupIds(userId);

      let taskCh = supabase.channel(`flow-tasks-${userId}`).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => scheduleTasksRealtimeReload()
      );
      groupIds.forEach((gid) => {
        taskCh = taskCh.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `group_id=eq.${gid}` },
          () => scheduleTasksRealtimeReload()
        );
      });
      tasksRealtimeChannel = taskCh.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Tasks realtime:", status, err?.message || err);
        }
      });

      let evCh = supabase.channel(`flow-events-${userId}`).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        () => scheduleEventsRealtimeReload()
      );
      groupIds.forEach((gid) => {
        evCh = evCh.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "events", filter: `group_id=eq.${gid}` },
          () => scheduleEventsRealtimeReload()
        );
      });
      eventsRealtimeChannel = evCh.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Events realtime:", status, err?.message || err);
        }
      });

      selfcareRealtimeChannel = supabase
        .channel(`flow-selfcare-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "selfcare_entries", filter: `user_id=eq.${userId}` },
          () => scheduleSelfcareRealtimeReload()
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Self-care realtime:", status, err?.message || err);
          }
        });

      focusRealtimeChannel = supabase
        .channel(`flow-focus-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` },
          () => scheduleFocusRealtimeReload()
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Focus realtime:", status, err?.message || err);
          }
        });

      achievementsRealtimeChannel = supabase
        .channel(`flow-achievements-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "achievements", filter: `user_id=eq.${userId}` },
          () => scheduleAchievementsRealtimeReload()
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Achievements realtime:", status, err?.message || err);
          }
        });

      buddyRealtimeChannel = supabase
        .channel(`flow-buddy-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "buddy_state", filter: `user_id=eq.${userId}` },
          () => scheduleBuddyRealtimeReload()
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Buddy realtime:", status, err?.message || err);
          }
        });

      pointsRealtimeChannel = supabase
        .channel(`flow-points-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "points_log", filter: `user_id=eq.${userId}` },
          () => schedulePointsRealtimeReload()
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Points realtime:", status, err?.message || err);
          }
        });
    } catch (err) {
      console.error("Supabase realtime start:", err);
    }
  }

  async function runMainAppInit() {
    attachSystemThemeListener();
    if (els.profileDisplayName) els.profileDisplayName.value = profile.displayName;
    initAvatarPicker();
    applyProfileAvatars();
    updateAccountSettingsLabel();
    bindWelcomeModalEvents();

    els.navItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        setView(btn.dataset.view);
        els.sidebar.classList.remove("open");
        els.sidebarBackdrop.hidden = true;
        els.navToggle.setAttribute("aria-expanded", "false");
      });
    });

    els.navToggle.addEventListener("click", () => {
      const open = els.sidebar.classList.toggle("open");
      els.navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      els.sidebarBackdrop.hidden = !open;
    });

    els.sidebarBackdrop.addEventListener("click", () => {
      els.sidebar.classList.remove("open");
      els.sidebarBackdrop.hidden = true;
      els.navToggle.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".sidebar") || e.target.closest(".nav-toggle")) return;
      if (window.innerWidth <= 768) {
        els.sidebar.classList.remove("open");
        els.sidebarBackdrop.hidden = true;
        els.navToggle.setAttribute("aria-expanded", "false");
      }
    });

    $('[data-action="go-tasks"]')?.addEventListener("click", () => setView("tasks"));
    $('[data-action="go-calendar"]')?.addEventListener("click", () => setView("calendar"));
    $('[data-action="go-motivation"]')?.addEventListener("click", () => setView("motivation"));
    $('[data-action="add-task-empty"]')?.addEventListener("click", () => openTaskModal(null));

    els.btnSaveSelfcare?.addEventListener("click", () => void saveSelfcareEntry(true));
    els.btnSelfcareClear?.addEventListener("click", () => {
      clearSelfcareForm();
      setSelfcareStatus(t("selfcare.statusIdle"));
    });
    els.btnSelfcareLoadDate?.addEventListener("click", () => {
      if (selfcareDirty) void saveSelfcareEntry(false);
      const ymd = getSelfcareSelectedDate();
      loadSelfcareDateIntoForm(ymd);
      renderSelfcarePreview(ymd);
      renderSelfcareEntriesList();
    });
    els.btnSelfcareEditPreview?.addEventListener("click", () => {
      if (!selfcareActivePreviewYmd) return;
      loadSelfcareDateIntoForm(selfcareActivePreviewYmd);
      if (els.selfcareQuestions) {
        const first = els.selfcareQuestions.querySelector("textarea");
        first?.focus();
      }
    });
    [
      els.selfcareQGrateful,
      els.selfcareQSmile,
      els.selfcareQWentWell,
      els.selfcareQProud,
      els.selfcareQSelf,
      els.selfcareQSurprise,
    ].forEach((el) => {
      el?.addEventListener("input", markSelfcareDirty);
    });
    els.focusTaskSelect?.addEventListener("change", () => {
      focusTimer.selectedTaskId = els.focusTaskSelect.value || "";
      refreshFocusActiveTaskCard();
      if (!focusTimer.running) refreshFocusGuidance();
    });
    els.focusCustomMinutes?.addEventListener("change", () => {
      const min = Math.max(1, Math.min(240, Number(els.focusCustomMinutes.value) || 25));
      els.focusCustomMinutes.value = String(min);
      focusTimer.durationSec = min * 60;
      if (!focusTimer.running) {
        focusTimer.remainingSec = focusTimer.durationSec;
        updateFocusTimerUi();
        refreshFocusGuidance();
      }
    });
    els.focusPresetButtons?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-focus-min]");
      if (!btn || !els.focusCustomMinutes) return;
      const min = Math.max(1, Math.min(240, Number(btn.getAttribute("data-focus-min")) || 25));
      els.focusCustomMinutes.value = String(min);
      focusTimer.durationSec = min * 60;
      if (!focusTimer.running) {
        focusTimer.remainingSec = focusTimer.durationSec;
        updateFocusTimerUi();
        refreshFocusGuidance();
      }
      els.focusPresetButtons.querySelectorAll("[data-focus-min]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
    els.btnFocusStart?.addEventListener("click", startFocusSession);
    els.btnFocusPause?.addEventListener("click", pauseFocusSession);
    els.btnFocusResume?.addEventListener("click", resumeFocusSession);
    els.btnFocusEnd?.addEventListener("click", endFocusSessionEarly);
    els.btnFocusFullscreen?.addEventListener("click", toggleFocusFullscreen);
    els.btnBreakStart?.addEventListener("click", () => startBreak(false));
    els.btnBreakSkip?.addEventListener("click", skipBreak);
    els.achFilterStatus?.addEventListener("change", () => renderAchievements());
    els.achFilterCategory?.addEventListener("change", () => renderAchievements());

    els.btnAddTask.addEventListener("click", () => openTaskModal(null));
    els.btnAddEvent.addEventListener("click", () => openEventModal(null));

    els.taskFilter.addEventListener("change", renderTasks);
    els.taskSort.addEventListener("change", () => {
      renderTasks();
      if (currentView === "calendar") renderDayDetail();
    });

    els.calPrev.addEventListener("click", () => calNavigate(-1));
    els.calNext.addEventListener("click", () => calNavigate(1));
    els.calToday.addEventListener("click", goToday);

    els.btnCalendarRecap?.addEventListener("click", () => openCalendarRecap());
    els.calendarRecapClose?.addEventListener("click", () => closeCalendarRecapModal());
    els.calendarRecapBackdrop?.addEventListener("click", () => closeCalendarRecapModal());
    $$(".recap-segments .segment").forEach((seg) => {
      seg.addEventListener("click", () => {
        const mode = seg.dataset.recapMode;
        if (mode === "week" && !appPrefs.recapWeekEnabled) return;
        if (mode === "month" && !appPrefs.recapMonthEnabled) return;
        if (!mode || mode === recapViewMode) return;
        recapViewMode = mode;
        $$(".recap-segments .segment").forEach((s) => {
          s.classList.toggle("active", s.dataset.recapMode === recapViewMode);
        });
        renderCalendarRecap();
      });
    });

    els.segments.forEach((seg) => {
      seg.addEventListener("click", () => {
        const mode = seg.dataset.calMode;
        if (!mode || mode === calMode) return;
        calMode = mode;
        els.segments.forEach((s) => s.classList.toggle("active", s.dataset.calMode === calMode));
        const now = new Date();
        calAnchor =
          calMode === "month"
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : startOfWeek(now);
        renderCalendar();
        if (!els.calendarRecapModal?.hidden) renderCalendarRecap();
      });
    });

    els.themeToggle.addEventListener("click", toggleTheme);

    els.btnSettings.addEventListener("click", openSettingsModal);
    if (els.btnSidebarSettings) els.btnSidebarSettings.addEventListener("click", openSettingsModal);
    els.settingsModalClose.addEventListener("click", closeSettingsModal);
    els.settingsModalBackdrop.addEventListener("click", closeSettingsModal);
    els.languageSelect?.addEventListener("change", () => setLanguage(els.languageSelect.value));

    els.profileDisplayName?.addEventListener("input", () => {
      profile.displayName = (els.profileDisplayName.value || "").trim() || t("profile.defaultName");
      saveProfile();
      groups.forEach((g) => {
        const m = g.members.find((x) => x.id === profile.id);
        if (m) m.name = profile.displayName;
      });
      saveGroupsState();
      if (currentView === "groups") void renderGroups();
      updateSidebarUserName();
      applyProfileAvatars();
    });
    els.profileDisplayName?.addEventListener("blur", () => {
      void persistProfileToSupabase();
    });

    els.btnRequestNotifications?.addEventListener("click", () => requestNotificationPermission());

    els.buddyNameInput?.addEventListener("change", () => {
      buddy.partnerName = (els.buddyNameInput.value || "").trim();
      void persistBuddyStateToSupabase();
      renderMotivation();
    });

    els.buddyPartnerActiveToday?.addEventListener("change", () => {
      const today = formatYMD(new Date());
      const on = els.buddyPartnerActiveToday.checked;
      if (on) {
        if (!buddy.partnerActiveDates.includes(today)) buddy.partnerActiveDates.push(today);
        buddy.lastPartnerYmd = today;
      } else {
        buddy.partnerActiveDates = buddy.partnerActiveDates.filter((d) => d !== today);
      }
      void persistBuddyStateToSupabase();
      maybeUpdateBuddyRecord();
      renderMotivation();
      if (currentView === "dashboard") renderDashboard();
    });

    els.btnOpenGroupCreateModal?.addEventListener("click", () => openGroupCreateModal());

    els.groupCreateForm?.addEventListener("submit", handleGroupCreateSubmit);
    els.groupCreateModalClose?.addEventListener("click", closeGroupCreateModal);
    els.groupCreateModalCancel?.addEventListener("click", closeGroupCreateModal);
    els.groupCreateModalBackdrop?.addEventListener("click", closeGroupCreateModal);
    els.groupCreateDoneBtn?.addEventListener("click", closeGroupCreateModal);

    els.groupCreateModal?.addEventListener("click", (e) => {
      const shareBtn = e.target.closest("[data-share]");
      if (!shareBtn || !els.groupCreateModal || !els.groupCreateModal.contains(shareBtn)) return;
      const kind = shareBtn.getAttribute("data-share");
      if (kind) runShareAction(kind);
    });

    els.groupModalCopyCode?.addEventListener("click", () => {
      const ctx = lastGroupShareContext;
      if (!ctx) return;
      copyTextToClipboard(ctx.code).then((ok) => ok && showToast(t("groups.copied")));
    });

    els.btnSidebarAvatar?.addEventListener("click", openSettingsModal);

    els.coachBannerClose?.addEventListener("click", dismissCoachBanner);

    els.btnAvatarUpload?.addEventListener("click", () => els.avatarFileInput?.click());
    els.avatarFileInput?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) processAvatarFile(f);
      e.target.value = "";
    });

    els.btnJoinGroup?.addEventListener("click", async () => {
      const ok = await joinGroupByCode(els.groupJoinCode?.value || "");
      if (!ok) showToast(t("groups.invalidCode"));
    });

    els.btnLeaveGroup?.addEventListener("click", () => {
      if (confirm(t("groups.leave") + "?")) void leaveGroup();
    });

    els.btnCopyGroupCode?.addEventListener("click", async () => {
      const g = activeGroupId ? findGroupInState(activeGroupId) : null;
      if (!g || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(g.code || g.inviteCode || "");
        showToast(t("groups.copied"));
      } catch (_) {}
    });

    els.btnCopyInviteLink?.addEventListener("click", async () => {
      if (!els.groupInviteLink || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(els.groupInviteLink.value);
        showToast(t("groups.copied"));
      } catch (_) {}
    });

    setInterval(runReminderTick, 60000);
    runReminderTick();

    if (!taskModalBindingsInitialized) {
      taskModalBindingsInitialized = true;
      if (!els.taskForm) {
        console.error("Flow: #taskForm not found — task modal submit cannot bind.");
      } else {
        els.taskForm.addEventListener("submit", handleTaskSubmit);
      }
      els.taskCancel.addEventListener("click", closeTaskModal);
      els.taskModalClose.addEventListener("click", closeTaskModal);
      els.taskModalBackdrop.addEventListener("click", closeTaskModal);
      els.taskDelete.addEventListener("click", async () => {
        const id = els.taskId.value;
        if (!id) return;
        if (confirm(t("confirm.deleteTask"))) {
          const ok = await deleteTaskFromSupabase(id);
          if (!ok) return;
          suppressTasksRealtimeReload(750);
          await reloadTasksAndRender();
          maybeUpdateBuddyRecord();
          await refreshAchievements(false);
          closeTaskModal();
        }
      });
    }

    if (!eventModalBindingsInitialized) {
      eventModalBindingsInitialized = true;
      els.eventForm.addEventListener("submit", handleEventSubmit);
      els.eventCancel.addEventListener("click", closeEventModal);
      els.eventModalClose.addEventListener("click", closeEventModal);
      els.eventModalBackdrop.addEventListener("click", closeEventModal);
      els.eventAllDay.addEventListener("change", toggleEventTimeRow);
      els.eventEndHour?.addEventListener("change", syncEventEndMinEnabled);
      els.eventDelete.addEventListener("click", async () => {
        const id = els.eventId.value;
        if (!id) return;
        if (confirm(t("confirm.deleteEvent"))) {
          const ok = await deleteEventFromSupabase(id);
          if (!ok) return;
          events = await loadEventsFromSupabase();
          await reconcilePointsLogWithSources();
          maybeUpdateBuddyRecord();
          await refreshAchievements(false);
          closeEventModal();
          refreshUiAfterEventsChange();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.cookieSettingsModal?.hidden) closeCookieSettingsModal();
        else if (!els.legalModal?.hidden) closeLegalModal();
        else if (!els.settingsModal.hidden) closeSettingsModal();
        else if (!els.groupCreateModal?.hidden) closeGroupCreateModal();
        else if (!els.taskModal.hidden) closeTaskModal();
        else if (!els.eventModal.hidden) closeEventModal();
        else if (!els.calendarRecapModal?.hidden) closeCalendarRecapModal();
      }
    });

    void refreshAchievements(false);
    const openedJoinLink = await parseJoinFromQuery();
    if (!openedJoinLink) setView(appPrefs.defaultView || "dashboard");
    renderTasks();
    renderSelfcare();
    renderFocus();
    renderAchievements();
    renderDayDetail();

    void startSupabaseRealtime();
    scheduleFirstRunNotificationPermission();
  }

  let flowServiceWorkerRegistrationDone = false;
  function registerFlowServiceWorker() {
    if (flowServiceWorkerRegistrationDone) return;
    flowServiceWorkerRegistrationDone = true;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }

  registerFlowServiceWorker();
  init();
})();