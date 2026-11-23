import { setTimeout as wait } from "node:timers/promises";

const [role] = process.argv.slice(2);
const {
  PAPERCLIP_API_URL: base, PAPERCLIP_API_KEY: token, PAPERCLIP_RUN_ID: run,
  PAPERCLIP_AGENT_ID: agent, PAPERCLIP_COMPANY_ID: company,
} = process.env;
if (!base || new URL(base).hostname !== "127.0.0.1" || !token || !run || !agent || !company) {
  throw new Error("The synthetic agent requires a local Paperclip run.");
}

async function call(path, method = "GET", body) {
  const response = await fetch(`${base.replace(/\/api\/?$/, "")}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "X-Paperclip-Run-Id": run, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

const tasks = await call(`/companies/${company}/issues?assigneeAgentId=${agent}&status=todo,in_progress,blocked,in_review`);
const issue = tasks.find(({ id, title }) => id === process.env.PAPERCLIP_TASK_ID || title.startsWith("[Synthetic]") || /^(Jira|Identity) evidence · /.test(title));
if (!issue || (issue.status === "in_review" && role !== "reviewer")) process.exit(0);
const path = `/issues/${issue.id}`;

if (role === "reviewer") {
  if (issue.status !== "in_review") process.exit(0);
  await wait(2_500);
  await call(path, "PATCH", { status: "done", comment: "Synthetic Socrates sign-off. The authorization and session evidence support the disposition for this P1 asset." });
  process.exit(0);
}

if (issue.status === "blocked") process.exit(0);
await call(`${path}/checkout`, "POST", { agentId: agent, expectedStatuses: ["todo", "in_progress"] });

if (role === "lead") {
  const evidence = `/plugins/matt-mc.investigations/api/issues/${issue.id}/evidence`;
  const view = await call(evidence);
  if (view.evidence.length === 0) {
    await Promise.all([
      call(evidence, "POST", {
        role: "jira", requestKey: "change-authorization", required: true,
        question: "Was the synthetic gateway policy change authorized for the demo operator at 14:05 UTC?",
      }),
      call(evidence, "POST", {
        role: "identity", requestKey: "session-correlation", required: true,
        question: "Does the synthetic gateway audit event match the operator's authenticated maintenance session?",
      }),
    ]);
    await call(path, "PATCH", { status: "blocked", comment: "Both evidence requests are required. Auspex remains the investigation lead." });
  } else if (view.evidence.length === 2 && view.evidence.every(({ status }) => status === "done")) {
    const [jira, identity] = await Promise.all(view.evidence.map(({ id }) => call(`/issues/${id}/comments`)));
    const expectedFindings = (comments) => comments.some(({ body }) => body.startsWith("Synthetic finding"));
    if (!expectedFindings(jira) || !expectedFindings(identity)) throw new Error("Required synthetic findings are missing.");
    await call(path, "PATCH", {
      status: "done",
      comment: `Proposed disposition: authorized maintenance. ${view.evidence.map(({ identifier }) => identifier).join(" and ")} corroborate the change and session. Requesting Socrates's closure review.`,
    });
  }
} else {
  await wait(4_000);
  const comment = role === "jira"
    ? "Synthetic finding — FIXTURE-42 explicitly authorizes the demo operator's gateway policy change at 14:05 UTC."
    : "Synthetic finding — audit fixture SESSION-17 links the change to the approved maintenance session.";
  await call(path, "PATCH", { status: "done", comment });
}
