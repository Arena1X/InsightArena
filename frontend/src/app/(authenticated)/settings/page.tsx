"use client";

import { useState, useEffect, useRef } from "react";
import {
  User,
  Bell,
  Shield,
  AlertTriangle,
  Download,
  LogOut,
} from "lucide-react";
import { useFormValidation } from "@/hooks/useFormValidation";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description, id }: ToggleProps) {
  const toggleId = id || `toggle-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-center justify-between gap-4 py-3 group">
      <div>
        <label
          htmlFor={toggleId}
          className="text-sm text-gray-200 group-hover:text-white transition cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
          checked ? "bg-orange-500" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}


function SectionCard({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4 scroll-mt-6"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gray-300">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-white font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <hr className="border-white/5" />;
}

// ── Sections ──────────────────────────────────────────────────────────────────

function ProfileSettings() {
  const [username, setUsername] = useState("You_Arena");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <SectionCard id="profile" icon={User} title="Profile Settings">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Avatar URL
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar preview"
                className="h-9 w-9 rounded-full object-cover border border-white/10 flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell the community about yourself..."
            className="w-full rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition"
        >
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </form>
    </SectionCard>
  );
}

function NotificationSettings() {
  const [initialPrefs, setInitialPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { values, setState, reset } = useFormValidation({
    initialValues: DEFAULT_NOTIFICATION_PREFERENCES,
  });

  useEffect(() => {
    let isMounted = true;
    getNotificationPreferences()
      .then((prefs) => {
        if (isMounted) {
          setInitialPrefs(prefs);
          reset(prefs);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [reset]);

  const predictions =
    values.predictions !== undefined
      ? Boolean(values.predictions)
      : initialPrefs.predictions;
  const rewards =
    values.rewards !== undefined ? Boolean(values.rewards) : initialPrefs.rewards;
  const disputes =
    values.disputes !== undefined
      ? Boolean(values.disputes)
      : initialPrefs.disputes;
  const digests =
    values.digests !== undefined ? Boolean(values.digests) : initialPrefs.digests;

  const isDirty =
    predictions !== initialPrefs.predictions ||
    rewards !== initialPrefs.rewards ||
    disputes !== initialPrefs.disputes ||
    digests !== initialPrefs.digests;

  // Dirty-state guard warning on navigation away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your notification preferences.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated: NotificationPreferences = {
        predictions,
        rewards,
        disputes,
        digests,
      };
      const res = await updateNotificationPreferences(updated);
      setInitialPrefs(res);
      reset(res);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    reset(initialPrefs);
    setError(null);
  }

  return (
    <SectionCard
      id="notifications"
      icon={Bell}
      title="Notification Preferences"
    >
      {loading ? (
        <div className="py-4 text-sm text-gray-400">Loading preferences...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="divide-y divide-white/5">
            <Toggle
              checked={predictions}
              onChange={(v) => setState("predictions", v)}
              label="Predictions & Market Resolutions"
              description="Get notified when markets you predicted on update or resolve"
              id="toggle-predictions"
            />
            <Toggle
              checked={rewards}
              onChange={(v) => setState("rewards", v)}
              label="Rewards & Claims"
              description="Alerts for claimable payout rewards and achievement unlocks"
              id="toggle-rewards"
            />
            <Toggle
              checked={disputes}
              onChange={(v) => setState("disputes", v)}
              label="Dispute Escalations"
              description="Notifications when disputes are opened or escalated on your markets"
              id="toggle-disputes"
            />
            <Toggle
              checked={digests}
              onChange={(v) => setState("digests", v)}
              label="Weekly Activity Digests"
              description="Receive weekly performance summaries and digest emails"
              id="toggle-digests"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              {error}
            </div>
          )}

          {isDirty && (
            <div
              data-testid="save-reset-bar"
              className="flex items-center justify-between gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"
            >
              <span className="text-xs text-orange-300 font-medium">
                Unsaved notification preference changes
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md border border-white/10 bg-white/5 text-xs font-medium text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </div>
          )}

          {!isDirty && saveSuccess && (
            <p className="text-xs text-green-400 font-medium">Preferences saved successfully!</p>
          )}

          {!isDirty && !saveSuccess && (
            <button
              type="submit"
              disabled
              className="px-4 py-2 rounded-lg border border-white/5 bg-white/5 text-sm font-medium text-gray-500 cursor-not-allowed opacity-50"
            >
              Saved
            </button>
          )}
        </form>
      )}
    </SectionCard>
  );
}


function PrivacySettings() {
  const [prefs, setPrefs] = useState({
    showPredictions: true,
    showWinRate: true,
    showOnLeaderboard: true,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <SectionCard id="privacy" icon={Shield} title="Privacy Settings">
      <div className="divide-y divide-white/5">
        <Toggle
          checked={prefs.showPredictions}
          onChange={() => toggle("showPredictions")}
          label="Show Predictions Publicly"
          description="Allow others to see your prediction history"
        />
        <Toggle
          checked={prefs.showWinRate}
          onChange={() => toggle("showWinRate")}
          label="Show Win Rate Publicly"
          description="Display your win rate on your public profile"
        />
        <Toggle
          checked={prefs.showOnLeaderboard}
          onChange={() => toggle("showOnLeaderboard")}
          label="Show on Leaderboard"
          description="Appear in the global rankings"
        />
      </div>
    </SectionCard>
  );
}

function DangerZone() {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  return (
    <section
      id="danger"
      className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-6 space-y-4 scroll-mt-6"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <h2 className="text-red-400 font-semibold">Danger Zone</h2>
      </div>
      <Divider />
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-gray-300 hover:bg-white/10 transition"
          onClick={() => {}}
        >
          <Download className="h-4 w-4" />
          Export My Data
        </button>

        {confirmDisconnect ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">Are you sure?</p>
            <button
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition"
              onClick={() => setConfirmDisconnect(false)}
            >
              Confirm Disconnect
            </button>
            <button
              className="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-400 hover:text-white transition"
              onClick={() => setConfirmDisconnect(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
            onClick={() => setConfirmDisconnect(true)}
          >
            <LogOut className="h-4 w-4" />
            Disconnect Wallet
          </button>
        )}
      </div>
    </section>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const NAV_ITEMS: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

function SidebarNav({ active }: { active: string }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
            active === id
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {label}
        </a>
      ))}
    </nav>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    // Create IntersectionObserver to track which section is visible
    const observerOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-50% 0px -50% 0px", // Trigger when section is in the middle of the viewport
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      // Find the section that's currently most visible
      const visibleEntry = entries.find((entry) => entry.isIntersecting);
      if (visibleEntry) {
        setActiveSection(visibleEntry.target.id);
      }
    }, observerOptions);

    // Observe all section elements
    const sections = document.querySelectorAll(
      "section[id='profile'], section[id='notifications'], section[id='privacy'], section[id='danger']",
    );
    sections.forEach((section) => observer.observe(section));

    // Cleanup observer on unmount
    return () => {
      sections.forEach((section) => observer.unobserve(section));
      observer.disconnect();
    };
  }, []);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-white text-2xl font-bold">Settings</h1>
      <p className="text-gray-400 text-sm">
        Manage your profile, preferences, and account.
      </p>

      <div className="pt-4 flex gap-8 items-start">
        {/* Sticky sidebar — desktop only */}
        <aside className="hidden lg:block w-44 flex-shrink-0 sticky top-6">
          <SidebarNav active={activeSection} />
        </aside>

        {/* Mobile tab bar */}
        <div className="lg:hidden w-full overflow-x-auto pb-2">
          <div className="flex gap-2 min-w-max">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition whitespace-nowrap"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">
          <ProfileSettings />
          <NotificationSettings />
          <PrivacySettings />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}
