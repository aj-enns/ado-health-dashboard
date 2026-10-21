$ErrorActionPreference = 'Stop'
if (-not $env:AZURE_WEBSITE_STORAGE_ACCOUNT_NAME) {
    throw 'AZURE_WEBSITE_STORAGE_ACCOUNT_NAME is required. Run this hook through azd provision.'
}
az storage blob service-properties update `
    --account-name $env:AZURE_WEBSITE_STORAGE_ACCOUNT_NAME `
    --auth-mode login `
    --static-website true `
    --index-document index.html `
    --only-show-errors
if ($LASTEXITCODE -ne 0) {
    throw 'Static website initialization failed. Check your Storage Account Contributor access and retry after RBAC propagation.'
}
