import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./dist/worker.js";

const plugin = worker.definition;

test("each approved lead can act on its own task, including legacy single-lead configuration", async () => {
  const auspex = "00000000-0000-4000-8000-000000000001";
  const gom = "00000000-0000-4000-8000-000000000002";
  const socrates = "00000000-0000-4000-8000-000000000003";
  const issueId = "00000000-0000-4000-8000-000000000004";
  const task = { id: issueId, assigneeAgentId: gom, status: "in_progress", checkoutRunId: "gom-run" };
  let config = { leadAgentId: gom };
  await plugin.setup({
    data: { register() {} },
    tools: { register() {} },
    config: { get: async () => config },
    agents: { get: async (id) => ({ name: id === gom ? "GOM" : "Auspex" }) },
    issues: { get: async () => task, getSubtree: async () => ({ issues: [] }) },
  });

  const request = (actor, routeKey = "read", body) => plugin.onApiRequest({
    companyId: "company", params: { issueId }, actor, routeKey, body,
  });
  const fromGom = { agentId: gom, runId: "gom-run" };
  assert.equal((await request(fromGom)).body.owner, "GOM");

  config = { leadAgentId: gom, leadAgentIds: [auspex, gom] };
  assert.equal((await request(fromGom)).body.owner, "GOM");
  assert.equal((await request({ ...fromGom, runId: "stale-run" })).status, 403);
  const evidence = { role: "jira", requestKey: "authorization", question: "Was it authorized?", required: true };
  assert.equal((await request({ agentId: auspex, runId: "auspex-run" }, "delegate", evidence)).status, 403);

  config.pilotIssueId = "00000000-0000-4000-8000-000000000005";
  assert.equal((await request(fromGom)).status, 404);
  assert.equal((await request(fromGom, "delegate", evidence)).status, 404);
  config.pilotIssueId = issueId;
  assert.equal((await request(fromGom)).body.owner, "GOM");

  task.status = "in_review";
  task.assigneeAgentId = socrates;
  task.executionState = { returnAssignee: { agentId: gom } };
  assert.equal((await request({})).body.owner, "GOM");
  assert.equal((await request(fromGom, "delegate", evidence)).status, 409);

  config.leadAgentIds = [auspex];
  assert.equal((await request({})).status, 404);
});
