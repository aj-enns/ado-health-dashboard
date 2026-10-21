// Host and monitoring roles preserve the official timer quickstart's RBAC pattern.
param runtimeStorageName string
param websiteStorageName string
param insightsName string
param identityPrincipalId string
param developerPrincipalId string

var blobOwner = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var blobContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var queueContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
var metricsPublisher = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')

resource runtimeStorage 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: runtimeStorageName
}
resource websiteStorage 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: websiteStorageName
}
resource websiteBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: websiteStorage
  name: 'default'
}
resource web 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: websiteBlobService
  name: '$web'
}
resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: insightsName
}

resource runtimeBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runtimeStorage.id, identityPrincipalId, blobOwner)
  scope: runtimeStorage
  properties: {
    roleDefinitionId: blobOwner
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}
resource runtimeQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runtimeStorage.id, identityPrincipalId, queueContributor)
  scope: runtimeStorage
  properties: {
    roleDefinitionId: queueContributor
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}
resource websiteWriterRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(web.id, identityPrincipalId, blobContributor)
  scope: web
  properties: {
    roleDefinitionId: blobContributor
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}
resource websiteDeveloperRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(websiteStorage.id, developerPrincipalId, blobContributor)
  scope: websiteStorage
  properties: {
    roleDefinitionId: blobContributor
    principalId: developerPrincipalId
    principalType: 'User'
  }
}
resource monitoringRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(insights.id, identityPrincipalId, metricsPublisher)
  scope: insights
  properties: {
    roleDefinitionId: metricsPublisher
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}
