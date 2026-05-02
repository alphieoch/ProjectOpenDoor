@description('Front Door profile name')
param name string

@description('Primary gateway endpoint')
param primaryEndpoint string

@description('Secondary gateway endpoint')
param secondaryEndpoint string

@description('Primary dashboard endpoint')
param primaryDashboardEndpoint string

@description('Secondary dashboard endpoint')
param secondaryDashboardEndpoint string

resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-07-01-preview' = {
  name: name
  location: 'Global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource gatewayOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'gateway-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource gatewayPrimaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: gatewayOriginGroup
  name: 'primary'
  properties: {
    hostName: primaryEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
  }
}

resource gatewaySecondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: gatewayOriginGroup
  name: 'secondary'
  properties: {
    hostName: secondaryEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 2
    weight: 1000
  }
}

resource gatewayEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'gateway'
  location: 'Global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource gatewayRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-07-01-preview' = {
  parent: gatewayEndpoint
  name: 'default'
  properties: {
    originGroup: {
      id: gatewayOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
  dependsOn: [
    gatewayPrimaryOrigin
    gatewaySecondaryOrigin
  ]
}

resource dashboardOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'dashboard-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource dashboardPrimaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: dashboardOriginGroup
  name: 'primary'
  properties: {
    hostName: primaryDashboardEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
  }
}

resource dashboardSecondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: dashboardOriginGroup
  name: 'secondary'
  properties: {
    hostName: secondaryDashboardEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 2
    weight: 1000
  }
}

resource dashboardEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'dashboard'
  location: 'Global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource dashboardRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-07-01-preview' = {
  parent: dashboardEndpoint
  name: 'default'
  properties: {
    originGroup: {
      id: dashboardOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
  dependsOn: [
    dashboardPrimaryOrigin
    dashboardSecondaryOrigin
  ]
}

output gatewayHostName string = gatewayEndpoint.properties.hostName
output dashboardHostName string = dashboardEndpoint.properties.hostName
