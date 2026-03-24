import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnokPayload {
  level: "whisper" | "nudge" | "knock" | "break";
  title: string;
  message?: string;
  icon?: string;
  color?: string;
  tts?: boolean;
  ttl?: number;
  actions?: { label: string; id: string; url?: string; icon?: string }[];
}

interface PluginConfig {
  knokEndpoint: string;
  knokTokenRef: string;
  defaultLevel: "whisper" | "nudge" | "knock" | "break";
  events: {
    approvalCreated: boolean;
    approvalDecided: boolean;
    agentRunFailed: boolean;
    agentRunFinished: boolean;
    agentStatusChanged: boolean;
    issueCreated: boolean;
    issueUpdated: boolean;
    issueCommentCreated: boolean;
  };
  levelOverrides?: Record<string, string>;
}

interface Stats {
  totalSent: number;
  totalFailed: number;
  lastNotificationAt: string | null;
}

interface NotificationRecord {
  eventType: string;
  title: string;
  level: string;
  timestamp: string;
  success: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATS_SCOPE = { scopeKind: "instance", stateKey: "stats" } as const;
const RECENT_SCOPE = { scopeKind: "instance", stateKey: "recentNotifications" } as const;

const EVENT_CONFIG_MAP: Record<string, keyof PluginConfig["events"]> = {
  "approval.created": "approvalCreated",
  "approval.decided": "approvalDecided",
  "agent.run.failed": "agentRunFailed",
  "agent.run.finished": "agentRunFinished",
  "agent.status_changed": "agentStatusChanged",
  "issue.created": "issueCreated",
  "issue.updated": "issueUpdated",
  "issue.comment.created": "issueCommentCreated",
};

const DEFAULT_LEVELS: Record<string, KnokPayload["level"]> = {
  "approval.created": "nudge",
  "approval.decided": "whisper",
  "agent.run.failed": "knock",
  "agent.run.finished": "whisper",
  "agent.status_changed": "nudge",
  "issue.created": "whisper",
  "issue.updated": "whisper",
  "issue.comment.created": "nudge",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveLevel(
  eventType: string,
  config: PluginConfig,
): KnokPayload["level"] {
  // levelOverrides uses camelCase keys (matching instanceConfigSchema)
  const configKey = EVENT_CONFIG_MAP[eventType];
  const override = configKey ? config.levelOverrides?.[configKey] : undefined;
  if (
    override &&
    ["whisper", "nudge", "knock", "break"].includes(override)
  ) {
    return override as KnokPayload["level"];
  }
  return DEFAULT_LEVELS[eventType] ?? config.defaultLevel ?? "whisper";
}

function getConfig(raw: Record<string, unknown>): PluginConfig {
  return raw as unknown as PluginConfig;
}

// ---------------------------------------------------------------------------
// Module-scoped state (accessible from lifecycle hooks via closure)
// ---------------------------------------------------------------------------

let _ctx: PluginContext;
let _config: PluginConfig;
let _token: string;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    _ctx = ctx;
    const rawConfig = await ctx.config.get();
    _config = getConfig(rawConfig);
    _token = await ctx.secrets.resolve(_config.knokTokenRef);
    // Alias for readability inside setup
    const config = _config;
    const token = _token;

    // -- helper: send alert to Knok ------------------------------------------

    async function sendKnokAlert(
      endpoint: string,
      authToken: string,
      payload: KnokPayload,
    ): Promise<{ ok: boolean; action?: string }> {
      const url = `${endpoint.replace(/\/+$/, "")}/alert`;
      try {
        const res = await ctx.http.fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        });

        const stats: Stats = (await ctx.state.get(STATS_SCOPE)) ?? {
          totalSent: 0,
          totalFailed: 0,
          lastNotificationAt: null,
        };

        if (res.ok) {
          stats.totalSent += 1;
          stats.lastNotificationAt = new Date().toISOString();
          await ctx.state.set(STATS_SCOPE, stats);

          const body = await res.json().catch(() => ({}));
          return { ok: true, action: (body as Record<string, unknown>).action as string | undefined };
        }

        stats.totalFailed += 1;
        await ctx.state.set(STATS_SCOPE, stats);
        ctx.logger.error("Knok alert failed", {
          status: res.status,
          statusText: res.statusText,
        });
        return { ok: false };
      } catch (err) {
        const stats: Stats = (await ctx.state.get(STATS_SCOPE)) ?? {
          totalSent: 0,
          totalFailed: 0,
          lastNotificationAt: null,
        };
        stats.totalFailed += 1;
        await ctx.state.set(STATS_SCOPE, stats);
        ctx.logger.error("Knok alert error", { error: String(err) });
        return { ok: false };
      }
    }

    // -- helper: track recent notification -----------------------------------

    async function trackRecent(record: NotificationRecord): Promise<void> {
      const recent: NotificationRecord[] =
        (await ctx.state.get(RECENT_SCOPE)) ?? [];
      recent.unshift(record);
      if (recent.length > 10) recent.length = 10;
      await ctx.state.set(RECENT_SCOPE, recent);
    }

    // -- helper: handle event ------------------------------------------------

    async function handleEvent(
      eventType: string,
      payload: KnokPayload,
    ): Promise<void> {
      const result = await sendKnokAlert(config.knokEndpoint, token, payload);
      await trackRecent({
        eventType,
        title: payload.title,
        level: payload.level,
        timestamp: new Date().toISOString(),
        success: result.ok,
      });
    }

    function isEnabled(eventType: string): boolean {
      const configKey = EVENT_CONFIG_MAP[eventType];
      if (!configKey) return false;
      return config.events?.[configKey] !== false;
    }

    // -- event handlers ------------------------------------------------------

    ctx.events.on("approval.created", async (event) => {
      try {
        if (!isEnabled("approval.created")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("approval.created", {
          level: resolveLevel("approval.created", config),
          title: "Approval Requested",
          message: `Approval requested${p.description ? `: ${p.description}` : ""}`,
          icon: "checkmark.circle",
          actions: [
            {
              label: "Review",
              id: "review",
              url: p.dashboardUrl as string | undefined,
            },
          ],
        });
      } catch (err) {
        ctx.logger.error("Error handling approval.created", {
          error: String(err),
        });
      }
    });

    ctx.events.on("approval.decided", async (event) => {
      try {
        if (!isEnabled("approval.decided")) return;
        const p = event.payload as Record<string, unknown>;
        const decision = (p.decision as string) ?? "decided";
        await handleEvent("approval.decided", {
          level: resolveLevel("approval.decided", config),
          title: "Approval Decided",
          message: `Approval ${decision}${p.approvalId ? ` (${p.approvalId})` : ""}`,
          icon: "checkmark.seal",
        });
      } catch (err) {
        ctx.logger.error("Error handling approval.decided", {
          error: String(err),
        });
      }
    });

    ctx.events.on("agent.run.failed", async (event) => {
      try {
        if (!isEnabled("agent.run.failed")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("agent.run.failed", {
          level: resolveLevel("agent.run.failed", config),
          title: "Agent Run Failed",
          message: `Agent ${p.agentName ?? event.entityId ?? "unknown"} failed${p.error ? `: ${p.error}` : ""}`,
          icon: "exclamationmark.triangle.fill",
          color: "#FF4444",
        });
      } catch (err) {
        ctx.logger.error("Error handling agent.run.failed", {
          error: String(err),
        });
      }
    });

    ctx.events.on("agent.run.finished", async (event) => {
      try {
        if (!isEnabled("agent.run.finished")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("agent.run.finished", {
          level: resolveLevel("agent.run.finished", config),
          title: "Agent Run Complete",
          message: `Agent ${p.agentName ?? event.entityId ?? "unknown"} finished successfully`,
          icon: "checkmark.circle.fill",
        });
      } catch (err) {
        ctx.logger.error("Error handling agent.run.finished", {
          error: String(err),
        });
      }
    });

    ctx.events.on("agent.status_changed", async (event) => {
      try {
        if (!isEnabled("agent.status_changed")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("agent.status_changed", {
          level: resolveLevel("agent.status_changed", config),
          title: "Agent Status Changed",
          message: `Agent ${p.agentName ?? event.entityId ?? "unknown"}: ${p.fromStatus ?? "?"} → ${p.toStatus ?? "?"}`,
          icon: "arrow.triangle.2.circlepath",
        });
      } catch (err) {
        ctx.logger.error("Error handling agent.status_changed", {
          error: String(err),
        });
      }
    });

    ctx.events.on("issue.created", async (event) => {
      try {
        if (!isEnabled("issue.created")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("issue.created", {
          level: resolveLevel("issue.created", config),
          title: "New Issue",
          message: `${p.title ?? `Issue ${event.entityId ?? "unknown"}`}`,
          icon: "exclamationmark.bubble",
        });
      } catch (err) {
        ctx.logger.error("Error handling issue.created", {
          error: String(err),
        });
      }
    });

    ctx.events.on("issue.updated", async (event) => {
      try {
        if (!isEnabled("issue.updated")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("issue.updated", {
          level: resolveLevel("issue.updated", config),
          title: "Issue Updated",
          message: `${p.title ?? `Issue ${event.entityId ?? "unknown"}`} was updated`,
          icon: "pencil.circle",
        });
      } catch (err) {
        ctx.logger.error("Error handling issue.updated", {
          error: String(err),
        });
      }
    });

    ctx.events.on("issue.comment.created", async (event) => {
      try {
        if (!isEnabled("issue.comment.created")) return;
        const p = event.payload as Record<string, unknown>;
        await handleEvent("issue.comment.created", {
          level: resolveLevel("issue.comment.created", config),
          title: "New Comment",
          message: `${p.authorName ?? "Someone"} commented${p.issueTitle ? ` on ${p.issueTitle}` : ""}`,
          icon: "bubble.left",
        });
      } catch (err) {
        ctx.logger.error("Error handling issue.comment.created", {
          error: String(err),
        });
      }
    });

    // -- data handlers -------------------------------------------------------

    ctx.data.register("health", async () => {
      const stats: Stats = (await ctx.state.get(STATS_SCOPE)) ?? {
        totalSent: 0,
        totalFailed: 0,
        lastNotificationAt: null,
      };
      return {
        status: "ok",
        totalSent: stats.totalSent,
        totalFailed: stats.totalFailed,
        lastNotificationAt: stats.lastNotificationAt,
      };
    });

    ctx.data.register("recent-notifications", async () => {
      const recent: NotificationRecord[] =
        (await ctx.state.get(RECENT_SCOPE)) ?? [];
      return recent;
    });

    // -- action handlers -----------------------------------------------------

    ctx.actions.register("test-notification", async () => {
      const result = await sendKnokAlert(config.knokEndpoint, token, {
        level: "nudge",
        title: "Test Notification",
        message: "This is a test notification from the Knok plugin.",
        icon: "bell.fill",
      });
      await trackRecent({
        eventType: "test",
        title: "Test Notification",
        level: "nudge",
        timestamp: new Date().toISOString(),
        success: result.ok,
      });
      return { success: result.ok, action: result.action };
    });
  },

  // -- lifecycle hooks -------------------------------------------------------

  async onHealth() {
    try {
      const endpoint = `${_config.knokEndpoint.replace(/\/+$/, "")}/alert`;
      const res = await _ctx.http.fetch(endpoint, {
        method: "OPTIONS",
        headers: { Authorization: `Bearer ${_token}` },
      });

      if (res.ok || res.status === 405) {
        return { status: "ok" as const, message: "Knok endpoint is reachable" };
      }
      return {
        status: "degraded" as const,
        message: `Knok endpoint returned ${res.status}`,
      };
    } catch (err) {
      return {
        status: "error" as const,
        message: `Cannot reach Knok endpoint: ${String(err)}`,
      };
    }
  },

  async onConfigChanged(newConfig: Record<string, unknown>) {
    _config = getConfig(newConfig);
    _token = await _ctx.secrets.resolve(_config.knokTokenRef);
    _ctx.logger.info("Config reloaded successfully");
  },

  async onValidateConfig(rawConfig: Record<string, unknown>) {
    const config = getConfig(rawConfig);
    const errors: string[] = [];

    if (!config.knokEndpoint) {
      errors.push("knokEndpoint is required");
    } else {
      try {
        new URL(config.knokEndpoint);
      } catch {
        errors.push("knokEndpoint must be a valid URL");
      }
    }

    if (!config.knokTokenRef) {
      errors.push("knokTokenRef is required");
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    // Attempt test connection
    try {
      const authToken = await _ctx.secrets.resolve(config.knokTokenRef);
      const endpoint = `${config.knokEndpoint.replace(/\/+$/, "")}/alert`;
      const res = await _ctx.http.fetch(endpoint, {
        method: "OPTIONS",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok && res.status !== 405) {
        return {
          ok: true,
          warnings: [`Knok endpoint returned ${res.status} on test connection`],
        };
      }
    } catch (err) {
      return {
        ok: true,
        warnings: [`Could not verify Knok endpoint: ${String(err)}`],
      };
    }

    return { ok: true };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
