@description('Container App Environment name')
param name string

@description('Azure region')
param location string

@description('PostgreSQL host')
param postgresHost string

@description('PostgreSQL password')
@secure()
param postgresPassword string

@description('Redis host')
param redisHost string

@description('Redis key')
@secure()
param redisKey string

@description('Auth secret')
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

@description('Container registry login server')
param registryLoginServer string

@description('Container registry username')
param registryUsername string

@description('Container registry password')
@secure()
param registryPassword string

@description('Azure region identifier')
param azureRegion string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${name}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: name
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource gatewayApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${name}-gateway'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'auto'
      }
      registries: [
        {
          server: registryLoginServer
          username: registryUsername
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: registryPassword
        }
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'redis-key'
          value: redisKey
        }
        {
          name: 'auth-secret'
          value: authSecret
        }
        {
          name: 'api-key-hash-secret'
          value: apiKeyHashSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'gateway'
          image: '${registryLoginServer}/opendoor-gateway:latest'
          env: [
            {
              name: 'DATABASE_URL'
              value: 'postgresql://${postgresHost}:5432/opendoor?user=opendooradmin&password=${postgresPassword}&sslmode=require'
            }
            {
              name: 'REDIS_URL'
              value: 'rediss://:${redisKey}@${redisHost}:6380'
            }
            {
              name: 'AUTH_SECRET'
              secretRef: 'auth-secret'
            }
            {
              name: 'GATEWAY_API_KEY_HASH_SECRET'
              secretRef: 'api-key-hash-secret'
            }
            {
              name: 'AZURE_REGION'
              value: azureRegion
            }
            {
              name: 'PORT'
              value: '3001'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

resource dashboardApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${name}-dashboard'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: registryLoginServer
          username: registryUsername
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: registryPassword
        }
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'auth-secret'
          value: authSecret
        }
        {
          name: 'stripe-secret'
          value: stripeSecretKey
        }
        {
          name: 'stripe-webhook-secret'
          value: stripeWebhookSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dashboard'
          image: '${registryLoginServer}/opendoor-dashboard:latest'
          env: [
            {
              name: 'DATABASE_URL'
              value: 'postgresql://${postgresHost}:5432/opendoor?user=opendooradmin&password=${postgresPassword}&sslmode=require'
            }
            {
              name: 'AUTH_SECRET'
              secretRef: 'auth-secret'
            }
            {
              name: 'STRIPE_SECRET_KEY'
              secretRef: 'stripe-secret'
            }
            {
              name: 'STRIPE_WEBHOOK_SECRET'
              secretRef: 'stripe-webhook-secret'
            }
            {
              name: 'STRIPE_PRO_PRICE_ID'
              value: stripeProPriceId
            }
            {
              name: 'STRIPE_ENTERPRISE_PRICE_ID'
              value: stripeEnterprisePriceId
            }
            {
              name: 'NEXT_PUBLIC_APP_URL'
              value: appUrl
            }
            {
              name: 'AZURE_REGION'
              value: azureRegion
            }
            {
              name: 'PORT'
              value: '3000'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output gatewayFqdn string = gatewayApp.properties.configuration.ingress.fqdn
output dashboardFqdn string = dashboardApp.properties.configuration.ingress.fqdn
