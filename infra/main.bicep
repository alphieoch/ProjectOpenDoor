@description('Primary Azure region for deployment')
param primaryLocation string = 'westeurope'

@description('Secondary Azure region for deployment')
param secondaryLocation string = 'eastus'

@description('Resource group name')
param resourceGroupName string = 'rg-opendoor-ocheingco'

@description('Environment name')
param environmentName string = 'opendoor'

@description('PostgreSQL admin username')
param postgresAdminUser string = 'opendooradmin'

@description('PostgreSQL admin password')
@secure()
param postgresAdminPassword string

@description('Container registry name')
param containerRegistryName string = 'acropendoor${uniqueString(resourceGroup().id)}'

@description('Auth secret for the application')
@secure()
param authSecret string

@description('API key hash secret')
@secure()
param apiKeyHashSecret string

@description('Stripe secret key')
@secure()
param stripeSecretKey string = ''

@description('Stripe webhook secret')
@secure()
param stripeWebhookSecret string = ''

@description('Stripe Pro price ID')
param stripeProPriceId string = ''

@description('Stripe Enterprise price ID')
param stripeEnterprisePriceId string = ''

@description('Public app URL')
param appUrl string = ''

// Container Registry
module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: containerRegistryName
    location: primaryLocation
  }
}

// PostgreSQL Primary
module postgresPrimary 'modules/postgres.bicep' = {
  name: 'postgresPrimary'
  params: {
    name: '${environmentName}-postgres'
    location: primaryLocation
    adminUsername: postgresAdminUser
    adminPassword: postgresAdminPassword
  }
}

// Redis Primary
module redisPrimary 'modules/redis.bicep' = {
  name: 'redisPrimary'
  params: {
    name: '${environmentName}-redis'
    location: primaryLocation
  }
}

// Container App Environment Primary
module containerEnvPrimary 'modules/containerApp.bicep' = {
  name: 'containerEnvPrimary'
  params: {
    name: '${environmentName}-primary'
    location: primaryLocation
    postgresHost: postgresPrimary.outputs.fqdn
    postgresPassword: postgresAdminPassword
    redisHost: redisPrimary.outputs.hostName
    redisKey: redisPrimary.outputs.primaryKey
    authSecret: authSecret
    apiKeyHashSecret: apiKeyHashSecret
    stripeSecretKey: stripeSecretKey
    stripeWebhookSecret: stripeWebhookSecret
    stripeProPriceId: stripeProPriceId
    stripeEnterprisePriceId: stripeEnterprisePriceId
    appUrl: appUrl
    registryLoginServer: registry.outputs.loginServer
    registryUsername: registry.outputs.username
    registryPassword: registry.outputs.password
    azureRegion: primaryLocation
  }
}

// Redis Secondary
module redisSecondary 'modules/redis.bicep' = {
  name: 'redisSecondary'
  params: {
    name: '${environmentName}-redis-sec'
    location: secondaryLocation
  }
}

// Container App Environment Secondary
module containerEnvSecondary 'modules/containerApp.bicep' = {
  name: 'containerEnvSecondary'
  params: {
    name: '${environmentName}-secondary'
    location: secondaryLocation
    postgresHost: postgresPrimary.outputs.fqdn
    postgresPassword: postgresAdminPassword
    redisHost: redisSecondary.outputs.hostName
    redisKey: redisSecondary.outputs.primaryKey
    authSecret: authSecret
    apiKeyHashSecret: apiKeyHashSecret
    stripeSecretKey: stripeSecretKey
    stripeWebhookSecret: stripeWebhookSecret
    stripeProPriceId: stripeProPriceId
    stripeEnterprisePriceId: stripeEnterprisePriceId
    appUrl: appUrl
    registryLoginServer: registry.outputs.loginServer
    registryUsername: registry.outputs.username
    registryPassword: registry.outputs.password
    azureRegion: secondaryLocation
  }
}

// Front Door
module frontDoor 'modules/frontDoor.bicep' = {
  name: 'frontDoor'
  params: {
    name: '${environmentName}-fd'
    primaryEndpoint: containerEnvPrimary.outputs.gatewayFqdn
    secondaryEndpoint: containerEnvSecondary.outputs.gatewayFqdn
    primaryDashboardEndpoint: containerEnvPrimary.outputs.dashboardFqdn
    secondaryDashboardEndpoint: containerEnvSecondary.outputs.dashboardFqdn
  }
}

output gatewayEndpoint string = 'https://${frontDoor.outputs.gatewayHostName}'
output dashboardEndpoint string = 'https://${frontDoor.outputs.dashboardHostName}'
output registryLoginServer string = registry.outputs.loginServer
