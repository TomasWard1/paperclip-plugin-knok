import { useState } from "react";
import {
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginWidgetProps,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Types matching worker data handlers
// ---------------------------------------------------------------------------

type HealthData = {
  status: "ok" | "degraded" | "error";
  lastNotificationAt: string | null;
  totalSent: number;
  totalFailed: number;
};

type Notification = {
  timestamp: string;
  eventType: string;
  level: string;
  title: string;
  success: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Shared styles (host CSS variables for theme integration)
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--card, transparent)",
};

const stack = (gap = 16): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap,
});

const row = (gap = 8): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap,
});

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};

const muted: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 12,
};

// ---------------------------------------------------------------------------
// Micro-components (using host CSS vars for theme consistency)
// ---------------------------------------------------------------------------

type BadgeVariant = "ok" | "warning" | "error" | "info" | "muted";

const variantColors: Record<BadgeVariant, { bg: string; fg: string }> = {
  ok: { bg: "color-mix(in oklch, var(--foreground) 10%, transparent)", fg: "var(--foreground)" },
  warning: { bg: "#fef3c7", fg: "#92400e" },
  error: { bg: "#fee2e2", fg: "#991b1b" },
  info: { bg: "color-mix(in oklch, var(--primary) 12%, transparent)", fg: "var(--primary)" },
  muted: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
};

function Badge({ label, variant = "muted" }: { label: string; variant?: BadgeVariant }) {
  const c = variantColors[variant];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "18px",
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: "ok" | "degraded" | "error" | string }) {
  const color =
    status === "ok" ? "#22c55e" : status === "degraded" ? "#eab308" : "#ef4444";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function MetricBox({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?: "default" | "success" | "danger";
}) {
  const valueColor =
    variant === "success"
      ? "#22c55e"
      : variant === "danger"
        ? "#ef4444"
        : "var(--foreground)";
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: "var(--muted, #f9fafb)",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 24, fontWeight: 700, color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

function levelVariant(level: string): BadgeVariant {
  if (level === "break") return "error";
  if (level === "knock") return "warning";
  if (level === "nudge") return "info";
  return "ok";
}

const buttonBase: React.CSSProperties = {
  appearance: "none",
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  padding: "8px 18px",
  border: "1px solid var(--foreground)",
  background: "var(--foreground)",
  color: "var(--background)",
};

const ghostButton: React.CSSProperties = {
  ...buttonBase,
  padding: "6px 12px",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "inherit",
  fontSize: 12,
};

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

export function SettingsPanel(_props: PluginSettingsPageProps) {
  const health = usePluginData<HealthData>("health");
  const recent = usePluginData<Notification[]>("recent-notifications");
  const testAction = usePluginAction("test-notification");
  const toast = usePluginToast();

  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      await testAction();
      toast({ title: "Test sent", body: "Check your desktop for the Knok notification", tone: "success", ttlMs: 4000 });
      health.refresh();
      recent.refresh();
    } catch {
      toast({ title: "Test failed", tone: "error", ttlMs: 6000 });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ ...stack(24), maxWidth: 720 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--foreground)" }}>
          Knok Notifications
        </h2>
        <p style={{ margin: "4px 0 0", ...muted, fontSize: 14 }}>
          Desktop notifications for Paperclip events via Knok
        </p>
      </div>

      {/* Connection + Metrics */}
      <div style={card}>
        {health.loading ? (
          <div style={{ ...row(), padding: 8 }}>
            <span style={muted}>Checking connection...</span>
          </div>
        ) : health.error ? (
          <div style={{ ...row(10) }}>
            <StatusDot status="error" />
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }}>
              Connection Error
            </span>
            <span style={{ fontSize: 13, color: "var(--destructive)" }}>
              {health.error.message}
            </span>
          </div>
        ) : (
          <div style={stack(16)}>
            <div style={row(10)}>
              <StatusDot status={health.data?.status ?? "error"} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }}>
                {health.data?.status === "ok"
                  ? "Connected"
                  : health.data?.status === "degraded"
                    ? "Degraded"
                    : "Disconnected"}
              </span>
              {health.data?.lastNotificationAt && (
                <span style={muted}>
                  Last: {relativeTime(health.data.lastNotificationAt)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <MetricBox
                label="Sent"
                value={health.data?.totalSent ?? 0}
                variant="success"
              />
              <MetricBox
                label="Failed"
                value={health.data?.totalFailed ?? 0}
                variant={health.data?.totalFailed ? "danger" : "default"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Test */}
      <div style={{ ...row(12) }}>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{ ...primaryButton, opacity: testing ? 0.6 : 1, cursor: testing ? "not-allowed" : "pointer" }}
        >
          {testing ? "Sending..." : "Send Test Notification"}
        </button>
      </div>

      {/* Recent Notifications */}
      <div style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
          Recent Notifications
        </h3>

        {recent.loading ? (
          <p style={muted}>Loading...</p>
        ) : recent.error ? (
          <p style={{ fontSize: 13, color: "var(--destructive)" }}>{recent.error.message}</p>
        ) : !recent.data || recent.data.length === 0 ? (
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>
            No notifications sent yet. Use the test button above to send your first one.
          </p>
        ) : (
          <div style={stack(0)}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 130px 80px 1fr 70px",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted-foreground)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <span>Time</span>
              <span>Event</span>
              <span>Level</span>
              <span>Title</span>
              <span>Status</span>
            </div>
            {/* Rows */}
            {recent.data.map((n, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 130px 80px 1fr 70px",
                  gap: 8,
                  padding: "10px 0",
                  borderBottom:
                    i < recent.data!.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  fontSize: 13,
                  alignItems: "center",
                  color: "var(--foreground)",
                }}
              >
                <span style={{ ...mono, fontSize: 12, color: "var(--muted-foreground)" }}>
                  {relativeTime(n.timestamp)}
                </span>
                <Badge label={n.eventType} variant="info" />
                <Badge label={n.level} variant={levelVariant(n.level)} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.title}
                </span>
                <Badge
                  label={n.success ? "OK" : "Fail"}
                  variant={n.success ? "ok" : "error"}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardWidget (compact)
// ---------------------------------------------------------------------------

export function DashboardWidget(_props: PluginWidgetProps) {
  const health = usePluginData<HealthData>("health");
  const testAction = usePluginAction("test-notification");
  const toast = usePluginToast();
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      await testAction();
      toast({ title: "Test sent", tone: "success", ttlMs: 3000 });
      health.refresh();
    } catch {
      toast({ title: "Test failed", tone: "error", ttlMs: 4000 });
    } finally {
      setTesting(false);
    }
  }

  if (health.loading) {
    return <span style={muted}>Loading...</span>;
  }

  if (health.error) {
    return (
      <div style={row(8)}>
        <StatusDot status="error" />
        <span style={{ fontSize: 13, color: "var(--destructive)" }}>Error</span>
      </div>
    );
  }

  return (
    <div style={{ ...row(12), fontSize: 13 }}>
      <StatusDot status={health.data?.status ?? "error"} />
      <span style={mono}>
        {health.data?.totalSent ?? 0} sent / {health.data?.totalFailed ?? 0} failed
      </span>
      <span style={muted}>
        {health.data?.lastNotificationAt
          ? relativeTime(health.data.lastNotificationAt)
          : "Never"}
      </span>
      <button
        onClick={handleTest}
        disabled={testing}
        style={{
          ...ghostButton,
          marginLeft: "auto",
          opacity: testing ? 0.6 : 1,
          cursor: testing ? "not-allowed" : "pointer",
        }}
      >
        {testing ? "..." : "Test"}
      </button>
    </div>
  );
}
