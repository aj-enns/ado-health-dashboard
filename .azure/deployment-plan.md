# Optional Azure deployment plan

Status: Ready for Validation

## Approved scope

Add an optional timer-triggered Azure Functions collector and Azure Storage static
website deployment. Keep GitHub Pages as the default. Prepare code, infrastructure,
tests, and setup documentation only; do not provision or deploy Azure resources.

## Architecture

- Reuse the existing Node.js collector and snapshot validation.
- Publish the dashboard and normalized public snapshot to a Storage static website.
- Use managed identity for runtime snapshot writes.
- Preserve explicit failure and stale states.

## Decisions

- Azure Developer CLI (`azd`) with Bicep, adapted from the official
  `Azure-Samples/functions-quickstart-javascript-azd-timer` v1.0.1 template
  discovered through the Azure Functions template manifest.
- Flex Consumption, Node.js 24 (currently GA), no always-ready instances.
- Separate runtime/deployment Storage and public website Storage accounts,
  both Standard LRS, HTTPS/TLS 1.2, shared-key authentication disabled.
- User-assigned managed identity; preserve the template's host Storage and
  monitoring roles and grant website writes only at the `$web` container.
- Azure CLI/Entra authentication for the developer publishing the website.
  Explicit post-provision static website initialization and post-deploy upload.
- Reuse/copy shared collector modules during packaging; no Azure dependencies
  in the root project or GitHub Pages workflow.
- Keep the 15-minute schedule and 40-minute stale threshold. Read the previous
  observation before collecting to avoid another request within 60 seconds.
- Test injected adapters, build/packaging, local Functions discovery, Bicep
  compilation/lint, and existing dashboard behavior.

## Deployment boundary and resource inventory

This change prepares an opt-in example only. Subscription, region, current
resource usage, deployment permissions, and Flex quota are deliberately not
queried or selected. The operator must confirm them before provisioning.
No deployment, role assignment, billable resource, or subscription setting is
created during this work.

Expected resources per environment: one resource group, one Flex plan, one
Function App, one managed identity, two Storage accounts, one Application
Insights component, one Log Analytics workspace, and scoped role assignments.
No VNet, private endpoint, CDN, paid alerting, or GitHub Azure credentials.

## Approval

User approved: "Yes, add the optional Azure deployment (Recommended)" after
reviewing the timer-triggered Functions + Storage architecture and the
explicit no-provisioning boundary.

## Execution

- [x] Inspect the merged baseline and Azure Functions guidance.
- [x] Finalize the implementation plan.
- [x] Implement the optional deployment and documentation.
- [x] Verify code, packaging, and infrastructure without deploying.

## Verification evidence

- 22 Node tests pass, including scope/freshness regression tests, Functions
  packaging, rate limiting, failure publication, Blob error variants, and
  conditional snapshot initialization.
- Azure dependency audit reports zero vulnerabilities.
- Functions Core Tools discovers `pollStatus` with `runOnStartup: false` and
  `useMonitor: true`; the host runs against isolated local Azurite Storage.
  Collection is disabled during discovery; no Azure account is contacted.
- Actual Blob SDK emulator checks pass for advisory publication, unknown/error
  publication, the 60-second guard, content/cache metadata, and preserving an
  existing snapshot across initialization.
- Bicep compilation succeeds with the pinned official AVM modules.
- `azure.yaml` passes the official Azure Developer CLI JSON Schema.
- Managed identity, Azure RBAC propagation, Flex region/quota availability,
  and the public Azure website remain unverified until an explicitly authorized
  real deployment. Nothing has been provisioned or deployed to Azure.

## Azure validation checklist

- [ ] All deployment validation checks pass (cloud checks intentionally deferred).
- [x] AZD installation.
- [x] Official `azure.yaml` schema validation.
- [ ] Environment setup: deferred until an operator chooses a subscription/region.
- [ ] Azure authentication: deferred; no Azure sign-in is needed to prepare code.
- [ ] Subscription/location/quota checks: deferred before provisioning.
- [x] Aspire pre-provisioning checks: not applicable.
- [ ] Provision preview: deferred; requires the operator's Azure context.
- [x] Build verification.
- [x] Docker build-context validation: not applicable.
- [x] Local shared-code packaging and Functions discovery.
- [ ] `azd package` validation in a selected deployment environment: deferred.
- [ ] Azure Policy validation: deferred until a target subscription is chosen.
- [x] Aspire post-provisioning checks: not applicable.

Do not treat the offline checks as authorization to deploy or as proof that a
particular Azure subscription satisfies policy, quotas, identity, or RBAC.
