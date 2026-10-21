# Azure DevOps health dashboard

A credential-free example of using the **Azure DevOps public Status API** for earlier awareness of reported service impact. A scheduled GitHub Action publishes a JSON snapshot and an accessible, responsive static dashboard to GitHub Pages. No PAT, Azure subscription, packages, or paid infrastructure required.

**Optional Azure deployment:** [Azure Functions + Storage setup](azure/README.md)
reuses the same collector in a timer-triggered Function and hosts the dashboard
on a Storage static website. Useful for learning Azure serverless automation;
requires an Azure subscription and can incur costs. GitHub Pages stays the default.

**Intended site:** https://aj-enns.github.io/ado-health-dashboard/

The URL works only after the implementation is merged, Pages is configured, and a deployment succeeds. This repository does not monitor Azure platform/subscription health or an individual ADO organization.

## Run locally

Install Node.js 22 or newer, then:

```sh
npm test
npm run collect
npm run build
npm run serve
```

Open http://127.0.0.1:4173. No `npm install` is needed. If collection fails, it writes an explicit unknown/error snapshot and exits nonzero; run build/serve separately to inspect that state. Building without a snapshot also displays unavailable, never synthetic healthy data.

## The API call

The [official Health - Get reference](https://learn.microsoft.com/en-us/rest/api/azure/devops/status/health/get?view=azure-devops-rest-7.1) documents this anonymous request:

```sh
curl --fail-with-body "https://status.dev.azure.com/_apis/status/health?api-version=7.1-preview.1"
```

Optional scopes (the dashboard collects all scopes and filters locally):

```sh
curl --fail-with-body "https://status.dev.azure.com/_apis/status/health?services=Boards,Pipelines&geographies=AU&api-version=7.1-preview.1"
```

The documented response contains `status.health`, `status.message`, and `services[]`, each with an `id` and `geographies[]` containing `id`, `name`, and `health`. `lastUpdated` is optional and is displayed separately from our collection timestamp. Health values are `healthy`, `advisory`, `degraded`, `unhealthy`, and `unknown`. Unrecognized values become **unknown**, not healthy. Missing/invalid response structure fails the collection.

Microsoft [caches results for 60 seconds](https://learn.microsoft.com/en-us/rest/api/azure/devops/status/); call **at most once per minute**. The collector makes one request with a 20-second timeout and no automatic retries. Avoid repeated manual dispatches, reruns, or local collections within a minute of any other check.

## How it works

```text
GitHub Actions (15-minute schedule)
  -> public ADO Status API
  -> validate + normalize (Node built-ins)
  -> data/status.json + self-contained dist/index.html
  -> GitHub Pages
  -> browser reads same-origin JSON (no API CORS dependency)
```

`scripts/collect.mjs` is the reusable API automation example; `lib/status.mjs` holds validation, filtering, and freshness rules. `scripts/build.mjs` inlines the dashboard CSS/JavaScript into one HTML page and includes only the normalized snapshot. `scripts/serve.mjs` serves that output on loopback.

The UI shows the overall API summary independently of filters, per-service/per-geography observations, the time of collection, optional API update time, and explicit stale/unknown/error states. Filters do not recompute the overall summary. Reported nonhealthy or unknown scopes are counted visibly. Remote text is rendered with `textContent`, never HTML.

## Enable GitHub Pages

1. Merge the implementation PR into `main`.
2. In **Settings > Pages > Build and deployment > Source**, select **GitHub Actions**.
3. In **Actions**, enable workflows if necessary and run **Collect status and publish Pages** on `main` (or let the next schedule run).
4. Confirm the deployment succeeded and open the environment URL shown in the run.

The publishing workflow runs on `main` pushes, manual dispatch, and at minutes **7, 22, 37, and 52 each hour (UTC)**. PR checks run tests and build without querying the live API or deploying. Deployments are serialized, with a 65-second pause before collection to keep even adjacent workflow runs more than a minute apart. Separate local copies/forks still need to respect the rate limit. The collector job only reads repository contents; only the deployment job gets `pages: write` and `id-token: write`. No data branch or repository write token is used.

An API failure still publishes an explicit unavailable snapshot, then **fails the workflow** after deployment so it remains visible in Actions. If collection cannot write a snapshot or the build/deploy fails, the previous site remains; its timestamp eventually triggers the stale warning. Check Actions for the cause. GitHub's own outages can prevent publication.

## Reuse and limitations

- Copy/fork this repository, update the source/site links, enable Actions and Pages, and retain the API rate limit. In a fork, enable scheduled workflows explicitly if GitHub disables them.
- Reuse `collect()` in another Node script or consume `data/status.json`. The snapshot has `schemaVersion: 1`, `ok`, `collectedAt`, `source`, `sourceUpdatedAt`, `status`, `services`, and `error`. Do not infer health from HTTP 200 on the static JSON file; inspect `ok` and freshness.
- The snapshot and site are **public**. Only public service health is collected: no organization names, PATs, tenant data, or private incidents. Do not add secrets or private telemetry to published files.
- This is sampled awareness, **not predictive monitoring, guaranteed real-time status, availability/SLA measurement, or alert delivery**. There is no incident history, cross-run change tracking, email, or paging integration. Consult the [official status portal](https://status.dev.azure.com/) and [incident history](https://status.dev.azure.com/_history).
- GitHub scheduled runs can be delayed or dropped and run only from the default branch. Public repositories may have schedules disabled after 60 days without repository activity. See [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- After **40 minutes** without a successful recent observation, the dashboard labels the snapshot stale and marks table values as last reported. A fresh collection timestamp does not prove that the provider's upstream information is current. Missing API timestamps are shown as not provided.
- The browser reloads the static JSON every 60 seconds; this does not query Microsoft. Pages/CDN propagation may add delay. A failure to load/validate JSON immediately shows unknown instead of retaining a green screen.

Tests use documented-shape fixtures and injected HTTP responses to cover normalization, scope filters, unknown values, the exact staleness boundary, and collection failures. They do not assert that the live service is always healthy.
