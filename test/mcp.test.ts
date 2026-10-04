import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildDemoEmails } from "../src/demo-mail.js";
import { WIDGET_URI, createMcpServer } from "../src/mcp.js";
import { createRuntime } from "../src/runtime.js";
import type { Dashboard } from "../src/types.js";

const now = new Date(2026, 9, 3, 12, 0, 0);

async function connectedClient() {
  const runtime = createRuntime({
    now: () => now,
    config: {
      ...loadConfig({}),
      demoMode: true,
      openAiApiKey: "",
      gmailRefreshToken: "",
      googleClientId: "",
      googleClientSecret: "",
    },
  });
  await runtime.desk.ingest(buildDemoEmails(now), "demo", now);
  const server = createMcpServer(runtime, "<html><p>FreeTrial Terminator</p></html>");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "freetrial-test", version: "0.0.1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, runtime };
}

describe("mcp server", () => {
  it("lists the trial tools and serves the widget resource", async () => {
    const { client, server } = await connectedClient();
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        [
          "approve_cancellation",
          "get_trial",
          "list_trials",
          "mark_kept",
          "scan_inbox",
          "show_trials",
          "snooze_trial",
          "upcoming_charges",
        ].sort(),
      );
      const show = listed.tools.find((tool) => tool.name === "show_trials");
      const meta = show?._meta as { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string } | undefined;
      expect(meta?.ui?.resourceUri).toBe(WIDGET_URI);
      expect(meta?.["openai/outputTemplate"]).toBe(WIDGET_URI);

      const resource = await client.readResource({ uri: WIDGET_URI });
      const widget = resource.contents[0];
      expect(widget?.mimeType).toContain("text/html");
      expect(widget && "text" in widget ? widget.text : "").toContain("FreeTrial Terminator");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns structured demo trials and blocks an unapproved cancel", async () => {
    const { client, server, runtime } = await connectedClient();
    try {
      const listed = await client.callTool({ name: "list_trials", arguments: {} });
      const dashboard = listed.structuredContent as Dashboard;
      expect(dashboard.trials[0]?.service).toBe("Canva");
      expect(dashboard.demo).toBe(true);

      const blocked = await client.callTool({
        name: "approve_cancellation",
        arguments: { trialId: "canva", confirmed: false, confirmationText: "no" },
      });
      expect(blocked.isError).toBe(true);
      expect(runtime.desk.get("canva")?.guidanceApproved).toBe(false);
      expect(runtime.desk.executor.calls).toBe(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
