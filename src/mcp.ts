import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cancelOrigins } from "./catalog.js";
import { dispatchTool } from "./dispatch.js";
import type { AppRuntime } from "./runtime.js";
import {
  approveInputShape,
  dashboardOutputShape,
  listInputShape,
  scanInputShape,
  snoozeInputShape,
  trialIdInputShape,
  upcomingInputShape,
} from "./schema.js";

export const WIDGET_URI = "ui://widget/trials.html";

const INSTRUCTIONS = [
  "FreeTrial Terminator finds free trials that will convert into paid charges. Free, no account needed.",
  "Demo mode is the default. Always tell the user when a result is demo data.",
  "Call scan_inbox, then list_trials or show_trials. Talk about the soonest expiry first.",
  "Never say a subscription was cancelled or that an email was sent.",
  "approve_cancellation only prepares a link, steps, and a draft the user can send.",
  "Never set confirmed to true unless the user explicitly approved guidance for that service.",
  "Do not invent trials that are not in tool results.",
].join(" ");

function toolMeta(invoking: string, invoked: string) {
  return {
    ui: {
      resourceUri: WIDGET_URI,
      visibility: ["model", "app"] as ["model", "app"],
    },
    "openai/outputTemplate": WIDGET_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

export function createMcpServer(runtime: AppRuntime, widgetHtml: string): McpServer {
  const server = new McpServer(
    { name: "freetrial-terminator", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  registerAppResource(
    server,
    "trials-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [] },
              permissions: { clipboardWrite: {} },
            },
            "openai/widgetPrefersBorder": true,
            "openai/widgetDescription":
              "Trial cards sorted by days left, with monthly and annual exposure. Cancel asks for an explicit approval and only then shows a link, steps, and a draft the user sends.",
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
              redirect_domains: cancelOrigins(),
            },
          },
        },
      ],
    }),
  );

  const outputSchema = dashboardOutputShape;

  registerAppTool(
    server,
    "scan_inbox",
    {
      title: "Scan inbox",
      description:
        "Scan for free-trial emails and track what each one will cost when it converts. Defaults to demo data, which is labelled example email and is not the user's inbox. Pass source gmail only when the user wants a real inbox and Gmail is connected. Pass source demo to force example data.",
      inputSchema: scanInputShape,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: toolMeta("Scanning for trials", "Trials scanned"),
    },
    async (args) => dispatchTool("scan_inbox", args, runtime),
  );

  registerAppTool(
    server,
    "list_trials",
    {
      title: "List trials",
      description:
        "List tracked trials with the soonest charge first. Each row has the service, trial start, expiry, price after the trial, days left, cancel link, and short instructions. Demo rows are example data.",
      inputSchema: listInputShape,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Listing trials", "Trials listed"),
    },
    async (args) => dispatchTool("list_trials", args, runtime),
  );

  registerAppTool(
    server,
    "get_trial",
    {
      title: "Get trial",
      description:
        "Get one tracked trial by id, including the cancel link and instructions. The draft cancellation email is included only after approve_cancellation has already been approved.",
      inputSchema: trialIdInputShape,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Opening trial", "Trial ready"),
    },
    async (args) => dispatchTool("get_trial", args, runtime),
  );

  registerAppTool(
    server,
    "upcoming_charges",
    {
      title: "Upcoming charges",
      description:
        "Summarize upcoming trial charges, soonest expiry first. Includes the price and days left. Kept trials are left out of the at-risk total.",
      inputSchema: upcomingInputShape,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Adding up charges", "Charges ready"),
    },
    async (args) => dispatchTool("upcoming_charges", args, runtime),
  );

  registerAppTool(
    server,
    "show_trials",
    {
      title: "Show trials",
      description:
        "Show the FreeTrial Terminator cards. Call this after a scan or a list so the user sees trials sorted by days left, the monthly and annual exposure, and Cancel, Keep, and Remind actions.",
      inputSchema: {},
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Opening trials", "Trials on screen"),
    },
    async () => dispatchTool("show_trials", {}, runtime),
  );

  registerAppTool(
    server,
    "approve_cancellation",
    {
      title: "Approve cancellation guidance",
      description:
        "Prepare cancellation guidance for one trial. This does not log in to the service and does not send email. Call it only after the user explicitly agrees. confirmed must be the boolean true. confirmationText must be exactly: I approve cancellation guidance for <service>. If the user has not agreed, do not call this tool.",
      inputSchema: approveInputShape,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Checking approval", "Guidance ready"),
    },
    async (args) => dispatchTool("approve_cancellation", args, runtime),
  );

  registerAppTool(
    server,
    "mark_kept",
    {
      title: "Mark kept",
      description:
        "Mark a trial as one the user wants to keep. It leaves the at-risk total. This does not contact the service.",
      inputSchema: trialIdInputShape,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Updating trial", "Marked as keep"),
    },
    async (args) => dispatchTool("mark_kept", args, runtime),
  );

  registerAppTool(
    server,
    "snooze_trial",
    {
      title: "Remind later",
      description:
        "Remind the user later about a trial. Default is 1 day. The trial can still charge them if they do not cancel. This does not contact the service.",
      inputSchema: snoozeInputShape,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta("Setting a reminder", "Reminder set"),
    },
    async (args) => dispatchTool("snooze_trial", args, runtime),
  );

  return server;
}
