import React from "react";
import { usePluginData, type PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";

type View = {
  owner: string;
  status: string;
  review: { name: string; status: string } | null;
  evidence: { id: string; identifier: string; title: string; status: string }[];
};

const label = (value: string) => value.replaceAll("_", " ");
const reviewStatus: Record<string, string> = {
  idle: "Required before closure",
  pending: "Awaiting sign-off",
  completed: "Signed off",
  changes_requested: "Changes requested",
};

export function Investigation({ context }: PluginDetailTabProps) {
  const { data, loading, error, refresh } = usePluginData<View>("investigation", {
    companyId: context.companyId, issueId: context.entityId,
  });
  if (loading && !data) return <p>Loading investigation…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return null;

  return <div className="grid max-w-3xl gap-6 text-sm">
    <h2 className="font-semibold">Investigation</h2>
    <dl className="grid gap-2 rounded-lg border border-border p-4 sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Investigation lead</dt><dd className="font-medium">{data.owner}</dd></div>
      <div><dt className="text-muted-foreground">Task status</dt><dd className="capitalize">{label(data.status)}</dd></div>
      <div><dt className="text-muted-foreground">Closure review</dt><dd>
        {data.review ? `${data.review.name} · ${reviewStatus[data.review.status] ?? label(data.review.status)}` : "No reviewer configured"}
      </dd></div>
    </dl>

    <section aria-labelledby="investigation-evidence">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="investigation-evidence" className="font-semibold">Evidence requests</h2>
        <button type="button" onClick={() => refresh()} className="underline underline-offset-4">Refresh evidence</button>
      </div>
      {data.evidence.length === 0 ? <p className="text-muted-foreground">No evidence requested yet.</p> :
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.evidence.map((child) => <li key={child.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <a className="underline underline-offset-4" href={`/${context.companyPrefix}/issues/${child.identifier}`}>
              {child.identifier} · {child.title}
            </a>
            <span className="capitalize text-muted-foreground">{label(child.status)}</span>
          </li>)}
        </ul>}
    </section>

  </div>;
}
