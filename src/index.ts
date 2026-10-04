import { loadEnvFile } from "./config.js";
import { buildDemoEmails } from "./demo-mail.js";
import { createHttpServer } from "./http.js";
import { createRuntime } from "./runtime.js";

loadEnvFile();

const runtime = createRuntime();
const now = runtime.now();
await runtime.desk.ingest(buildDemoEmails(now), "demo", now);

const server = createHttpServer(runtime);
server.listen(runtime.config.port, "0.0.0.0", () => {
  const port = runtime.config.port;
  console.log(`FreeTrial Terminator MCP at http://127.0.0.1:${port}/mcp`);
  console.log(`Widget preview at http://127.0.0.1:${port}/preview`);
});
