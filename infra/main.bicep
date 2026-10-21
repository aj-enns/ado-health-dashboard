// Adapted from the Azure Functions JavaScript timer quickstart v1.0.1.
// See azure/THIRD-PARTY-NOTICES for the source and license.
targetScope = 'subscription'

@minLength(1)
@maxLength(32)
param environmentName string

@description('A region that supports Azure Functions Flex Consumption.')
@metadata({ azd: { type: 'location' } })
param location string

@description('Signed-in developer object ID, used only for publishing website files.')
param principalId string = deployer().objectId

var token = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }
var functionName = 'func-ado-health-${token}'
var packageContainer = 'deploymentpackage'

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-ado-health-${environmentName}'
  location: location
  tags: tags
}

module identity 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.1' = {
  name: 'collector-identity'
  scope: rg
  params: {
    name: 'id-ado-health-${token}'
    location: location
    tags: tags
  }
}

module plan 'br/public:avm/res/web/serverfarm:0.1.1' = {
  name: 'flex-plan'
  scope: rg
  params: {
    name: 'plan-ado-health-${token}'
    sku: { name: 'FC1', tier: 'FlexConsumption' }
    reserved: true
    location: location
    tags: tags
  }
}

module runtimeStorage 'br/public:avm/res/storage/storage-account:0.8.3' = {
  name: 'runtime-storage'
  scope: rg
  params: {
    name: 'stadofunc${token}'
    location: location
    tags: tags
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Enabled'
    minimumTlsVersion: 'TLS1_2'
    skuName: 'Standard_LRS'
    blobServices: {
      containers: [{ name: packageContainer }]
    }
  }
}

module websiteStorage 'br/public:avm/res/storage/storage-account:0.8.3' = {
  name: 'website-storage'
  scope: rg
  params: {
    name: 'stadoweb${token}'
    location: location
    tags: tags
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Enabled'
    minimumTlsVersion: 'TLS1_2'
    skuName: 'Standard_LRS'
    blobServices: {
      containers: [{ name: '$web' }]
    }
  }
}

module workspace 'br/public:avm/res/operational-insights/workspace:0.11.1' = {
  name: 'logs'
  scope: rg
  params: {
    name: 'log-ado-health-${token}'
    location: location
    tags: tags
    dataRetention: 30
  }
}

module insights 'br/public:avm/res/insights/component:0.6.0' = {
  name: 'insights'
  scope: rg
  params: {
    name: 'appi-ado-health-${token}'
    location: location
    tags: tags
    workspaceResourceId: workspace.outputs.resourceId
    disableLocalAuth: true
  }
}

module roles './roles.bicep' = {
  name: 'roles'
  scope: rg
  params: {
    runtimeStorageName: runtimeStorage.outputs.name
    websiteStorageName: websiteStorage.outputs.name
    insightsName: insights.outputs.name
    identityPrincipalId: identity.outputs.principalId
    developerPrincipalId: principalId
  }
}

module collector './collector.bicep' = {
  name: 'collector'
  scope: rg
  params: {
    name: functionName
    location: location
    tags: tags
    planId: plan.outputs.resourceId
    identityId: identity.outputs.resourceId
    identityClientId: identity.outputs.clientId
    runtimeStorageName: runtimeStorage.outputs.name
    websiteStorageName: websiteStorage.outputs.name
    insightsName: insights.outputs.name
    packageContainer: packageContainer
  }
  dependsOn: [roles]
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_COLLECTOR_NAME string = collector.outputs.name
output AZURE_FUNCTION_NAME string = collector.outputs.name
output AZURE_WEBSITE_STORAGE_ACCOUNT_NAME string = websiteStorage.outputs.name
output WEBSITE_STORAGE_BLOB_ENDPOINT string = 'https://${websiteStorage.outputs.name}.blob.${environment().suffixes.storage}/'
