import { useState } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginWidgetProps,
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

type TestResult = {
  success: boolean;
  action?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const colors = {
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  blue: "#3b82f6",
  border: "#e5e7eb",
  muted: "#6b7280",
  bg: "#f9fafb",
  white: "#ffffff",
} as const;

function statusColor(status: HealthData["status"]): string {
  if (status === "ok") return colors.green;
  if (status === "degraded") return colors.yellow;
  return colors.red;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function levelColor(level: string): string {
  if (level === "error" || level === "break") return colors.red;
  if (level === "warning" || level === "knock") return colors.yellow;
  if (level === "info" || level === "nudge") return colors.blue;
  return colors.muted;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 16,
  background: colors.white,
};

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};

const badge = (bg: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 600,
  color: colors.white,
  background: bg,
  lineHeight: "18px",
});

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

export function SettingsPanel(_props: PluginWidgetProps) {
  const health = usePluginData<HealthData>("health");
  const recent = usePluginData<Notification[]>("recent-notifications");
  const testAction = usePluginAction("test-notification");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = (await testAction()) as TestResult;
      setTestResult(result);
    } catch {
      setTestResult({ success: false });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Knok Notifications</h2>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Desktop notifications for Paperclip events via Knok
        </p>
      </div>

      {/* Connection Status */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StatusDot
            color={health.data ? statusColor(health.data.status) : colors.muted}
            size={10}
          />
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {health.loading
              ? "Checking..."
              : health.error
                ? "Connection Error"
                : `Status: ${health.data?.status ?? "unknown"}`}
          </span>
        </div>

        {health.error && (
          <p style={{ color: colors.red, fontSize: 13, margin: "0 0 12px" }}>
            {health.error.message}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>Sent</div>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: colors.green }}>
              {health.data?.totalSent ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>Failed</div>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: colors.red }}>
              {health.data?.totalFailed ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>
              Last notification
            </div>
            <div style={{ ...mono, fontSize: 13 }}>
              {health.data?.lastNotificationAt
                ? relativeTime(health.data.lastNotificationAt)
                : "Never"}
            </div>
          </div>
        </div>
      </div>

      {/* Test Notification */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: colors.blue,
              color: colors.white,
              fontWeight: 600,
              fontSize: 13,
              cursor: testing ? "not-allowed" : "pointer",
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? "Sending..." : "Send Test Notification"}
          </button>
          {testResult && (
            <span
              style={{
                fontSize: 13,
                color: testResult.success ? colors.green : colors.red,
                fontWeight: 500,
              }}
            >
              {testResult.success ? "Test sent successfully" : "Test failed"}
            </span>
          )}
        </div>
      </div>

      {/* Recent Notifications */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
          Recent Notifications
        </h3>
        {recent.loading && (
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Loading...</p>
        )}
        {recent.error && (
          <p style={{ color: colors.red, fontSize: 13, margin: 0 }}>{recent.error.message}</p>
        )}
        {!recent.loading && !recent.error && (!recent.data || recent.data.length === 0) && (
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
            No notifications sent yet. Use the test button above to send your first one.
          </p>
        )}
        {recent.data && recent.data.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 100px 70px 1fr 60px",
                gap: 8,
                padding: "6px 0",
                borderBottom: `1px solid ${colors.border}`,
                fontSize: 11,
                color: colors.muted,
                fontWeight: 600,
                textTransform: "uppercase" as const,
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
                  gridTemplateColumns: "80px 100px 70px 1fr 60px",
                  gap: 8,
                  padding: "8px 0",
                  borderBottom:
                    i < recent.data!.length - 1
                      ? `1px solid ${colors.border}`
                      : "none",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <span style={{ ...mono, fontSize: 12, color: colors.muted }}>
                  {relativeTime(n.timestamp)}
                </span>
                <span style={badge(colors.blue)}>{n.eventType}</span>
                <span style={badge(levelColor(n.level))}>{n.level}</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.title}
                </span>
                <span>
                  <StatusDot color={n.success ? colors.green : colors.red} size={8} />{" "}
                  <span style={{ fontSize: 12, color: n.success ? colors.green : colors.red }}>
                    {n.success ? "OK" : "Fail"}
                  </span>
                </span>
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
  const { data, loading, error } = usePluginData<HealthData>("health");
  const testAction = usePluginAction("test-notification");
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      await testAction();
    } catch {
      // silently ignore in widget
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: colors.muted }}>Loading...</div>;
  if (error)
    return (
      <div style={{ fontSize: 13, color: colors.red }}>Error: {error.message}</div>
    );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      <StatusDot color={data ? statusColor(data.status) : colors.muted} />
      <span style={mono}>
        {data?.totalSent ?? 0} sent / {data?.totalFailed ?? 0} failed
      </span>
      <span style={{ color: colors.muted, fontSize: 12 }}>
        {data?.lastNotificationAt ? relativeTime(data.lastNotificationAt) : "Never"}
      </span>
      <button
        onClick={handleTest}
        disabled={testing}
        style={{
          marginLeft: "auto",
          padding: "4px 10px",
          borderRadius: 4,
          border: `1px solid ${colors.border}`,
          background: colors.white,
          fontSize: 12,
          cursor: testing ? "not-allowed" : "pointer",
          opacity: testing ? 0.6 : 1,
        }}
      >
        {testing ? "..." : "Test"}
      </button>
    </div>
  );
}
