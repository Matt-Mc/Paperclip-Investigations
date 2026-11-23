import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const origin = new URL(process.env.INVESTIGATIONS_SMOKE_URL ?? "http://127.0.0.1:3377").origin;
assert.equal(new URL(origin).hostname, "127.0.0.1", "The smoke test requires a local instance");
const plugin = "matt-mc.investigations";
const script = fileURLToPath(new URL("demo-agent.mjs", import.meta.url));

async function request(path, method = "GET", body) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

async function call(path, method, body) {
  const response = await request(path, method, body);
  assert.ok(response.status < 300, `${method ?? "GET"} ${path}: ${JSON.stringify(response)}`);
  return response.data;
}

const health = await call("/health");
assert.equal(health.deploymentMode, "local_trusted");
const installed = await call(`/plugins/${plugin}`);
assert.equal(installed.status, "ready");
const companies = await call("/companies");
const company = await call("/companies", "POST", {
  name: companies.some(({ name }) => name === "Investigations Lab") ? "Investigations Smoke Test" : "Investigations Lab",
  description: "Synthetic Paperclip plugin test data",
});
const [lead, jira, identity, reviewer] = await Promise.all(
  [["Auspex", "lead"], ["Jira Evidence", "jira"], ["Identity Evidence", "identity"], ["Socrates", "reviewer"]]
    .map(([name, role]) => call(`/companies/${company.id}/agents`, "POST", {
      name, role: "general", runner: "legacy", adapterType: "process",
      adapterConfig: { command: process.execPath, args: [script, role], timeoutSec: 40 },
      runtimeConfig: { heartbeat: { enabled: false } },
    })),
);
const parent = await call(`/companies/${company.id}/issues`, "POST", {
  title: "[Synthetic] P1 gateway policy change",
  description: "Fixture alert at 14:05 UTC. P1 is the synthetic service priority. Confirm authorization and match the identity session before proposing closure.",
  status: "backlog",
  assigneeAgentId: lead.id,
  executionPolicy: { stages: [{ type: "review", participants: [{ type: "agent", agentId: reviewer.id }] }] },
});
await call(`/plugins/${plugin}/config`, "POST", {
  companyId: company.id,
  configJson: { pilotIssueId: parent.id, leadAgentIds: [lead.id], jiraAgentId: jira.id, identityAgentId: identity.id, reviewerAgentId: reviewer.id },
});
const outsidePilot = await call(`/companies/${company.id}/issues`, "POST", {
  title: "Outside the investigation pilot", status: "backlog", assigneeAgentId: lead.id,
});
assert.equal((await request(`/plugins/${plugin}/api/issues/${outsidePilot.id}/evidence`)).status, 404);
const issuePath = `/issues/${parent.id}`;
const evidencePath = `/plugins/${plugin}/api/issues/${parent.id}/evidence`;
const link = `${origin}/${company.issuePrefix}${issuePath}`.replace(parent.id, parent.identifier);
console.log(`Synthetic investigation: ${link}`);

const initial = await call(evidencePath);
assert.equal(initial.owner, "Auspex");
assert.equal(initial.review.name, "Socrates");
assert.deepEqual(initial.specialists.map(({ role }) => role).sort(), ["identity", "jira"]);
assert.equal((await request(evidencePath, "POST", { role: "other" })).status, 400);

if (process.argv.includes("--seed-only")) process.exit(0);
await call(issuePath, "PATCH", { status: "todo" });

let waitedWithLead = false;
let waitedForReview = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const [current, view] = await Promise.all([call(issuePath), call(evidencePath)]);
  if (current.status === "blocked" && view.evidence.length === 2) {
    assert.equal(current.assigneeAgentId, lead.id);
    waitedWithLead = true;
  }
  if (current.status === "in_review") {
    assert.equal(current.assigneeAgentId, reviewer.id);
    assert.equal(view.owner, "Auspex");
    waitedForReview = true;
  }
  if (current.status === "done") {
    assert.ok(waitedWithLead, "Auspex should retain assignment while evidence is outstanding");
    assert.ok(waitedForReview, "Core review must intercept attempted closure");
    assert.equal(view.evidence.length, 2);
    assert.ok(view.evidence.every(({ status }) => status === "done"));
    assert.equal(view.review.status, "completed");
    const comments = await call(`${issuePath}/comments`);
    assert.ok(comments.some(({ authorAgentId, body }) => authorAgentId === reviewer.id && body.includes("Socrates sign-off")));
    console.log("Verified parallel specialist dispatch, Auspex ownership during evidence gathering, and Socrates closure sign-off.");
    process.exit(0);
  }
  await wait(400);
}
const final = await call(issuePath);
const finalView = await call(evidencePath);
throw new Error(`Investigation stalled at ${final.status}; ${JSON.stringify(finalView)}`);
