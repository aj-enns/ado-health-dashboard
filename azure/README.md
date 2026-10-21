# Optional Azure Functions deployment

Use this option to demonstrate Azure-native scheduled automation. **GitHub Pages
remains the default** and needs none of these dependencies or Azure resources.
This directory prepares an opt-in deployment; adding it does not deploy anything.

## Architecture and trade-offs

```text
Azure Functions timer (Flex Consumption, Node.js 24)
  -> existing anonymous ADO collector + validation
  -> managed-identity write to website Storage / $web/data/status.json
  -> browser reads dashboard + JSON from the same static website origin
```

The Function runs at minutes 7, 22, 37, and 52 UTC, with startup execution disabled.
Timer monitoring uses host Storage to coordinate instances. A recent published
check suppresses another API call for 60 seconds, including after a failed check.
There is no automatic API retry; the next scheduled invocation checks again.
Independent deployments/local runs must also respect Microsoft's API rate limit.

Two separate **Standard LRS Storage accounts** isolate host/deployment artifacts
from public website files. A user-assigned identity retains the official
template's host Blob/Queue and monitoring roles; website writes are limited to
its `$web` container. Shared-key authentication is disabled. The deployed app
uses managed identity through `DefaultAzureCredential`; local development can
use Azure CLI sign-in. No PAT or storage key is needed.

Failures publish unknown health before failing the invocation. Storage failures
fail the invocation and may leave the previous snapshot, which becomes stale
after 40 minutes. The browser never treats a JSON loading failure as healthy.
Redeploying the page does not overwrite an existing snapshot. On first deploy,
the page shows unknown until the next scheduled check.

This adds a subscription, resource management, and costs for Functions execution,
Storage, and Application Insights/Log Analytics ingestion. There are no
always-ready instances, but **this is not a promise of zero cost**. Scheduling
can be delayed, and Azure-hosted monitoring can share outage dependencies with
the service being observed. Alerts, private networking, custom domains/CDNs,
history, and guaranteed real-time status are not included.

## Prepare locally (no cloud resources created)

Prerequisites: Node.js 22+ (Azure runs Node.js 24), npm, Azure CLI with Bicep,
Azure Developer CLI (`azd`), and PowerShell 7 (`pwsh`) for the portable hooks.
For local Functions hosting, also install Functions Core Tools v4 and Azurite.

From the repository root:

```powershell
npm test
npm ci --prefix azure/functions
npm --prefix azure/functions run build
az bicep build --file infra/main.bicep --stdout > $null
```

The Azure build copies the shared collector and generated dashboard into ignored
`shared/` and `public/` directories. There is no forked copy of the API logic to
maintain. The root project still uses only Node built-ins.

## Deploy when you explicitly choose to create Azure resources

**These commands create billable resources and scoped role assignments.** Review
`infra/` first. Use a dedicated example environment and confirm the subscription,
region availability, Flex quota, and organizational policies before provisioning.
The signed-in developer needs permission to deploy at subscription scope and
assign roles (for example, Contributor plus User Access Administrator).
Enabling static website hosting also requires
`Microsoft.Storage/storageAccounts/blobServices/write`, included in Contributor
or Storage Account Contributor. The template grants the developer data access
to upload website files, not additional subscription privileges.

Use the **same user and tenant** for both CLI sign-ins:

```powershell
az login
azd auth login
azd env new ado-health-example
azd env set AZURE_SUBSCRIPTION_ID "<your-subscription-id>"
azd env set AZURE_LOCATION "<supported-flex-region>"
azd provision
```

The post-provision hook enables the Storage static website using Entra login.
New RBAC grants can take several minutes to propagate. If the hook reports 403,
wait for propagation and rerun it without weakening authentication:

```powershell
azd hooks run postprovision
```

After provisioning and RBAC propagation:

```powershell
azd deploy
$account = azd env get-value AZURE_WEBSITE_STORAGE_ACCOUNT_NAME
az storage account show --name $account --query primaryEndpoints.web --output tsv
```

The post-deploy hook uploads `index.html` and creates an unknown bootstrap
snapshot **only if no snapshot already exists**. Wait for the next scheduled
timer check; do not enable `runOnStartup` just to force an early API request.
Open the returned HTTPS website URL and verify its collection timestamp.
Check **Function App > Functions > pollStatus > Invocations** and Application
Insights for execution logs and exceptions. A successful code deployment alone
does not prove that collection or publication works.

If website publishing fails after code deployment, correct the reported error
(often RBAC propagation), then run:

```powershell
azd hooks run postdeploy
```

There is intentionally no GitHub Azure deployment workflow and no Azure secrets
to configure in GitHub. Deploy/update this option manually with `azd`.
To avoid leaving costs running, remove the example environment's resources when
finished. Resource deletion is destructive; review the resource group first.

## Local Functions development

After provisioning a **test** website account, copy
`azure/functions/local.settings.example.json` to `local.settings.json`, replace
the placeholder website endpoint, and sign in with `az login` as the developer
who has website Blob data access. Never commit the local settings file.

Start Azurite in a separate terminal, then:

```powershell
npm --prefix azure/functions run build
npm --prefix azure/functions start
```

Azurite supplies host timer state; website writes still go to the configured
Azure test account. Local timer executions make real public API requests and
write public snapshots. Do not run multiple collectors against the same
destination. For discovery-only checks, disable `pollStatus` with the
`AzureWebJobs.pollStatus.Disabled` setting.

## Public data and security boundary

Everything uploaded to `$web` is **public through the static website endpoint**,
even with `allowBlobPublicAccess: false`. That setting protects the Blob API,
not the website. Only the generated HTML and normalized public health JSON are
uploaded; runtime files, identity settings, and deployment packages live
elsewhere. No authentication is provided for website readers.

Do not put private incidents, tenant data, credentials, or organizational
telemetry in these snapshots. The standard Azure Storage HTTPS hostname is used;
custom HTTPS domains and extra HTTP security headers require additional hosting
components and are outside this example.

## References

- [Official timer template, v1.0.1](https://github.com/Azure-Samples/functions-quickstart-javascript-azd-timer/tree/v1.0.1), adapted with separate public website Storage and a production-safe schedule.
- [Functions timer behavior](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer)
- [Supported Functions runtimes](https://learn.microsoft.com/en-us/azure/azure-functions/supported-languages)
- [Storage static websites, public access, and permissions](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website)
- [ADO Status API](https://learn.microsoft.com/en-us/rest/api/azure/devops/status/)
