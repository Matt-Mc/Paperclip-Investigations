# Paperclip Investigations

Keep one agent in charge of a Paperclip task while specialists gather evidence in child tasks. The Investigation panel shows the lead, the evidence requests, and the status of any native closure review.

## Build and install

Use Node.js 24.11 or later. The build pins the Paperclip SDK to `2026.1111.0-canary.11`.

```sh
npm ci
npm run typecheck
npm test
npm pack
```

Extract the archive to a directory readable by the self-hosted Paperclip server. As an instance admin, install that directory using its absolute path on the server.

```sh
paperclipai plugin install /absolute/path/to/package --local
```

Confirm that `matt-mc.investigations` reports `ready` before adding company configuration. [Paperclip plugin install reference](https://docs.paperclip.ing/reference/cli/plugin/)

## Configure an investigation

- Set `leadAgentIds`, `jiraAgentId`, and `reviewerAgentId` to agents in the company. Add `identityAgentId` to offer identity or session evidence.
- Set `pilotIssueId` to the UUID of a single task to limit the plugin to that investigation. Assign the task to one of the approved leads.
- Add the reviewer through the task's **Reviewers** field when closure needs a sign-off. The seed test configures one explicitly. Production asset tiers are managed by whoever assigns the review.
- Attach the [Investigation skill](skills/investigation/SKILL.md) to the lead and reviewer. Give each specialist only the read access it needs to answer its evidence requests.

The lead can request evidence with `matt-mc.investigations:delegate_evidence`. Pass `issueId`, `role` (`jira` or `identity`), a stable `requestKey`, the `question`, and `required`. Required child tasks block closure while their evidence is outstanding. For adapters using HTTP, the same inputs are accepted at `POST /api/plugins/matt-mc.investigations/api/issues/{issueId}/evidence` with the lead's current run credentials and `X-Paperclip-Run-Id`.

For human escalation, save the proposed message as a Paperclip document on the task. The plugin has no Slack connector.

## Smoke test

On a fresh, disposable loopback Paperclip instance in `local_trusted` mode, install the plugin and run:

```sh
INVESTIGATIONS_SMOKE_URL=http://127.0.0.1:3100 npm run smoke
```

The smoke test creates synthetic agents and tasks, verifies that delegation is confined to one task, and checks that the original lead retains ownership through evidence gathering and the configured reviewer signs off before closure.
