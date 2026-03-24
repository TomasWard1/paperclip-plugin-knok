import { describe, expect, it, beforeEach, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    knokEndpoint: "http://100.0.0.1:9999",
    knokTokenRef: "secret://knok-token",
    defaultLevel: "nudge",
    events: {
      approvalCreated: true,
      approvalDecided: true,
      agentRunFailed: true,
      agentRunFinished: true,
      agentStatusChanged: true,
      issueCreated: true,
      issueUpdated: true,
      issueCommentCreated: true,
    },
    levelOverrides: {},
    ...overrides,
  };
}

function createHarness(configOverrides: Record<string, unknown> = {}) {
  const harness = createTestHarness({
    manifest,
    capabilities: [...manifest.capabilities, "events.emit"],
  });

  // Mock config
  const config = makeConfig(configOverrides);
  vi.spyOn(harness.ctx.config, "get").mockResolvedValue(config);

  // Mock secrets
  vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-token-123");

  // Mock HTTP fetch - success by default
  vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ action: "dismissed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  return harness;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Knok plugin worker", () => {
  describe("event handling", () => {
    it("sends a Knok alert on approval.created", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "approval.created",
        { description: "Deploy to prod", dashboardUrl: "https://app.example.com/approvals/1" },
        { entityId: "apr_1", entityType: "approval" },
      );

      expect(harness.ctx.http.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://100.0.0.1:9999/alert");
      const body = JSON.parse(init.body);
      expect(body.level).toBe("nudge");
      expect(body.title).toBe("Approval Requested");
      expect(body.message).toContain("Deploy to prod");
      expect(body.actions).toEqual([
        { label: "Review", id: "review", url: "https://app.example.com/approvals/1" },
      ]);
    });

    it("sends a Knok alert on approval.decided", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "approval.decided",
        { decision: "approved", approvalId: "apr_1" },
        { entityId: "apr_1", entityType: "approval" },
      );

      expect(harness.ctx.http.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("whisper");
      expect(body.title).toBe("Approval Decided");
      expect(body.message).toContain("approved");
    });

    it("sends a Knok alert on agent.run.failed with red color", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "agent.run.failed",
        { agentName: "deploy-bot", error: "timeout" },
        { entityId: "agent_1", entityType: "agent" },
      );

      expect(harness.ctx.http.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("knock");
      expect(body.title).toBe("Agent Run Failed");
      expect(body.message).toContain("deploy-bot");
      expect(body.message).toContain("timeout");
      expect(body.color).toBe("#FF4444");
      expect(body.icon).toBe("exclamationmark.triangle.fill");
    });

    it("sends a Knok alert on agent.run.finished", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "agent.run.finished",
        { agentName: "deploy-bot" },
        { entityId: "agent_1", entityType: "agent" },
      );

      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("whisper");
      expect(body.title).toBe("Agent Run Complete");
      expect(body.message).toContain("deploy-bot");
    });

    it("sends a Knok alert on agent.status_changed", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "agent.status_changed",
        { agentName: "deploy-bot", fromStatus: "idle", toStatus: "running" },
        { entityId: "agent_1", entityType: "agent" },
      );

      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("nudge");
      expect(body.title).toBe("Agent Status Changed");
      expect(body.message).toContain("idle");
      expect(body.message).toContain("running");
    });

    it("sends a Knok alert on issue.created", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "issue.created",
        { title: "Login button broken" },
        { entityId: "iss_1", entityType: "issue" },
      );

      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("whisper");
      expect(body.title).toBe("New Issue");
      expect(body.message).toContain("Login button broken");
    });

    it("sends a Knok alert on issue.updated", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "issue.updated",
        { title: "Login button broken" },
        { entityId: "iss_1", entityType: "issue" },
      );

      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("whisper");
      expect(body.title).toBe("Issue Updated");
      expect(body.message).toContain("Login button broken");
    });

    it("sends a Knok alert on issue.comment.created", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "issue.comment.created",
        { authorName: "Alice", issueTitle: "Login bug" },
        { entityId: "comment_1", entityType: "issue.comment" },
      );

      const body = JSON.parse((harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.level).toBe("nudge");
      expect(body.title).toBe("New Comment");
      expect(body.message).toContain("Alice");
      expect(body.message).toContain("Login bug");
    });
  });

  describe("event filtering", () => {
    it("does NOT send when event is disabled in config", async () => {
      const harness = createHarness({
        events: {
          approvalCreated: false,
          approvalDecided: false,
          agentRunFailed: false,
          agentRunFinished: false,
          agentStatusChanged: false,
          issueCreated: false,
          issueUpdated: false,
          issueCommentCreated: false,
        },
      });
      await plugin.definition.setup(harness.ctx);

      await harness.emit("approval.created", {}, {});
      await harness.emit("agent.run.failed", {}, {});
      await harness.emit("issue.created", {}, {});
      await harness.emit("issue.comment.created", {}, {});

      expect(harness.ctx.http.fetch).not.toHaveBeenCalled();
    });

    it("only sends for enabled events", async () => {
      const harness = createHarness({
        events: {
          approvalCreated: true,
          approvalDecided: false,
          agentRunFailed: true,
          agentRunFinished: false,
          agentStatusChanged: false,
          issueCreated: false,
          issueUpdated: false,
          issueCommentCreated: false,
        },
      });
      await plugin.definition.setup(harness.ctx);

      await harness.emit("approval.created", { description: "test" }, {});
      await harness.emit("approval.decided", { decision: "yes" }, {});
      await harness.emit("agent.run.failed", { error: "boom" }, {});
      await harness.emit("issue.created", { title: "test" }, {});

      expect(harness.ctx.http.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("notification level mapping", () => {
    it("uses correct default levels for each event type", async () => {
      const expectedLevels: Record<string, string> = {
        "approval.created": "nudge",
        "approval.decided": "whisper",
        "agent.run.failed": "knock",
        "agent.run.finished": "whisper",
        "agent.status_changed": "nudge",
        "issue.created": "whisper",
        "issue.updated": "whisper",
        "issue.comment.created": "nudge",
      };

      for (const [eventType, expectedLevel] of Object.entries(expectedLevels)) {
        const harness = createHarness();
        await plugin.definition.setup(harness.ctx);

        await harness.emit(eventType as "issue.created", {}, { entityId: "test_1" });

        const body = JSON.parse(
          (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
        );
        expect(body.level).toBe(expectedLevel);
      }
    });

    it("respects levelOverrides from config", async () => {
      const harness = createHarness({
        levelOverrides: {
          approvalCreated: "break",
          issueCreated: "knock",
        },
      });
      await plugin.definition.setup(harness.ctx);

      await harness.emit("approval.created", {}, {});
      const body1 = JSON.parse(
        (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body1.level).toBe("break");

      await harness.emit("issue.created", { title: "test" }, {});
      const body2 = JSON.parse(
        (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
      );
      expect(body2.level).toBe("knock");
    });
  });

  describe("HTTP payload format", () => {
    it("sends correct headers with Bearer token", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      const [, init] = (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(init.headers["Authorization"]).toBe("Bearer test-token-123");
    });

    it("strips trailing slashes from endpoint", async () => {
      const harness = createHarness({ knokEndpoint: "http://100.0.0.1:9999/" });
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      const [url] = (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://100.0.0.1:9999/alert");
    });

    it("payload body matches Knok API shape", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit(
        "approval.created",
        { description: "Deploy v2", dashboardUrl: "https://app.example.com" },
        {},
      );

      const body = JSON.parse(
        (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body).toHaveProperty("level");
      expect(body).toHaveProperty("title");
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("icon");
      expect(body).toHaveProperty("actions");
      expect(body.actions[0]).toHaveProperty("label");
      expect(body.actions[0]).toHaveProperty("id");
      expect(body.actions[0]).toHaveProperty("url");
    });
  });

  describe("stats tracking", () => {
    it("increments totalSent on successful notification", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});
      await harness.emit("issue.created", { title: "test2" }, {});

      const stats = harness.getState({ scopeKind: "instance", stateKey: "stats" }) as { totalSent: number; totalFailed: number; lastNotificationAt: string | null };
      expect(stats.totalSent).toBe(2);
      expect(stats.totalFailed).toBe(0);
      expect(stats.lastNotificationAt).toBeTruthy();
    });

    it("increments totalFailed on HTTP error", async () => {
      const harness = createHarness();
      vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500 }),
      );
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      const stats = harness.getState({ scopeKind: "instance", stateKey: "stats" }) as { totalSent: number; totalFailed: number; lastNotificationAt: string | null };
      expect(stats.totalSent).toBe(0);
      expect(stats.totalFailed).toBe(1);
    });

    it("increments totalFailed on network error", async () => {
      const harness = createHarness();
      vi.spyOn(harness.ctx.http, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      const stats = harness.getState({ scopeKind: "instance", stateKey: "stats" }) as { totalSent: number; totalFailed: number; lastNotificationAt: string | null };
      expect(stats.totalSent).toBe(0);
      expect(stats.totalFailed).toBe(1);
    });
  });

  describe("recent notifications tracking", () => {
    it("stores recent notifications in state", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "Bug #1" }, {});

      const recent = harness.getState({
        scopeKind: "instance",
        stateKey: "recentNotifications",
      }) as { eventType: string; title: string; timestamp: string; success: boolean }[];
      expect(recent).toHaveLength(1);
      expect(recent[0].eventType).toBe("issue.created");
      expect(recent[0].title).toBe("New Issue");
      expect(recent[0].timestamp).toBeTruthy();
      expect(recent[0].success).toBe(true);
    });

    it("caps recent notifications at 10", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      for (let i = 0; i < 15; i++) {
        await harness.emit("issue.created", { title: `Bug #${i}` }, {});
      }

      const recent = harness.getState({
        scopeKind: "instance",
        stateKey: "recentNotifications",
      }) as { eventType: string; title: string; timestamp: string; success: boolean }[];
      expect(recent).toHaveLength(10);
    });

    it("returns recent notifications via data handler", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "Bug" }, {});

      const data = await harness.getData<{ eventType: string }[]>("recent-notifications");
      expect(data).toHaveLength(1);
      expect(data[0].eventType).toBe("issue.created");
    });
  });

  describe("data handlers", () => {
    it("health returns stats", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      const health = await harness.getData<{
        status: string;
        totalSent: number;
        totalFailed: number;
        lastNotificationAt: string | null;
      }>("health");
      expect(health.status).toBe("ok");
      expect(health.totalSent).toBe(1);
      expect(health.totalFailed).toBe(0);
      expect(health.lastNotificationAt).toBeTruthy();
    });

    it("health returns zeros when no notifications sent", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      const health = await harness.getData<{
        status: string;
        totalSent: number;
      }>("health");
      expect(health.status).toBe("ok");
      expect(health.totalSent).toBe(0);
    });
  });

  describe("action handlers", () => {
    it("test-notification sends a nudge to Knok", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      const result = await harness.performAction<{ success: boolean; action?: string }>(
        "test-notification",
      );

      expect(result.success).toBe(true);
      expect(harness.ctx.http.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (harness.ctx.http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body.level).toBe("nudge");
      expect(body.title).toBe("Test Notification");
    });

    it("test-notification tracks in recent notifications", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);

      await harness.performAction("test-notification");

      const recent = harness.getState({
        scopeKind: "instance",
        stateKey: "recentNotifications",
      }) as { eventType: string; title: string; timestamp: string; success: boolean }[];
      expect(recent).toHaveLength(1);
      expect(recent[0].eventType).toBe("test");
    });
  });

  describe("error handling", () => {
    it("does not crash the worker when Knok endpoint fails", async () => {
      const harness = createHarness();
      vi.spyOn(harness.ctx.http, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      await plugin.definition.setup(harness.ctx);

      // Should not throw
      await harness.emit("approval.created", { description: "test" }, {});
      await harness.emit("agent.run.failed", { error: "boom" }, {});
      await harness.emit("issue.comment.created", { authorName: "Bob" }, {});

      const stats = harness.getState({ scopeKind: "instance", stateKey: "stats" }) as { totalSent: number; totalFailed: number; lastNotificationAt: string | null };
      expect(stats.totalFailed).toBe(3);
    });

    it("logs errors when fetch fails", async () => {
      const harness = createHarness();
      vi.spyOn(harness.ctx.http, "fetch").mockRejectedValue(new Error("Network error"));
      const errorSpy = vi.spyOn(harness.ctx.logger, "error");
      await plugin.definition.setup(harness.ctx);

      await harness.emit("issue.created", { title: "test" }, {});

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("lifecycle hooks", () => {
    it("onHealth returns ok when endpoint is reachable", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);
      vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(
        new Response("", { status: 200 }),
      );

      const result = await plugin.definition.onHealth!();
      expect(result.status).toBe("ok");
    });

    it("onHealth returns degraded when endpoint returns error status", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);
      vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(
        new Response("", { status: 503 }),
      );

      const result = await plugin.definition.onHealth!();
      expect(result.status).toBe("degraded");
    });

    it("onHealth returns error when endpoint is unreachable", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);
      vi.spyOn(harness.ctx.http, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await plugin.definition.onHealth!();
      expect(result.status).toBe("error");
      expect(result.message).toContain("ECONNREFUSED");
    });

    it("onValidateConfig rejects missing endpoint", async () => {
      const harness = createHarness({ knokEndpoint: "" });
      await plugin.definition.setup(harness.ctx);

      const result = await plugin.definition.onValidateConfig!(makeConfig({ knokEndpoint: "" }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("knokEndpoint is required");
    });

    it("onValidateConfig rejects invalid URL", async () => {
      const harness = createHarness({ knokEndpoint: "not-a-url" });
      await plugin.definition.setup(harness.ctx);

      const result = await plugin.definition.onValidateConfig!(makeConfig({ knokEndpoint: "not-a-url" }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("knokEndpoint must be a valid URL");
    });

    it("onValidateConfig rejects missing token ref", async () => {
      const harness = createHarness({ knokTokenRef: "" });
      await plugin.definition.setup(harness.ctx);

      const result = await plugin.definition.onValidateConfig!(makeConfig({ knokTokenRef: "" }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("knokTokenRef is required");
    });

    it("onValidateConfig returns ok for good config", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);
      vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(
        new Response("", { status: 405 }),
      );

      const result = await plugin.definition.onValidateConfig!(makeConfig());
      expect(result.ok).toBe(true);
    });

    it("onValidateConfig returns warning when test connection fails", async () => {
      const harness = createHarness();
      await plugin.definition.setup(harness.ctx);
      vi.spyOn(harness.ctx.http, "fetch").mockRejectedValue(new Error("timeout"));

      const result = await plugin.definition.onValidateConfig!(makeConfig());
      expect(result.ok).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain("timeout");
    });
  });
});
