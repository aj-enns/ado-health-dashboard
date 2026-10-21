// Based on the official timer quickstart's infra/app/api.bicep.
param name string
param location string
param tags object
param planId string
param identityId string
param identityClientId string
param runtimeStorageName string
param websiteStorageName string
param insightsName string
param packageContainer string

resource runtimeStorage 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: runtimeStorageName
}
resource websiteStorage 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: websiteStorageName
}
resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: insightsName
}

module app 'br/public:avm/res/web/site:0.15.1' = {
  name: 'collector-flex'
  params: {
    name: name
    kind: 'functionapp,linux'
    location: location
    tags: union(tags, { 'azd-service-name': 'collector' })
    serverFarmResourceId: planId
    httpsOnly: true
    managedIdentities: {
      systemAssigned: false
      userAssignedResourceIds: [identityId]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${runtimeStorage.properties.primaryEndpoints.blob}${packageContainer}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identityId
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 100
      }
      runtime: { name: 'node', version: '24' }
    }
    siteConfig: { alwaysOn: false, minTlsVersion: '1.2' }
    appSettingsKeyValuePairs: {
      AzureWebJobsStorage__credential: 'managedidentity'
      AzureWebJobsStorage__clientId: identityClientId
      AzureWebJobsStorage__blobServiceUri: runtimeStorage.properties.primaryEndpoints.blob
      AzureWebJobsStorage__queueServiceUri: runtimeStorage.properties.primaryEndpoints.queue
      APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'ClientId=${identityClientId};Authorization=AAD'
      APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
      AZURE_CLIENT_ID: identityClientId
      WEBSITE_STORAGE_BLOB_ENDPOINT: websiteStorage.properties.primaryEndpoints.blob
      TIMER_SCHEDULE: '0 7,22,37,52 * * * *'
    }
  }
}
output name string = app.outputs.name
