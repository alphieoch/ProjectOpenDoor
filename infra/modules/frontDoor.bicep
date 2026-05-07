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

@description('Custom domain for gateway (e.g. api.opendoor.ai)')
param gatewayCustomDomain string = ''

@description('Custom domain for dashboard (e.g. app.opendoor.ai)')
param dashboardCustomDomain string = ''

@description('Primary docs endpoint')
param primaryDocsEndpoint string

@description('Secondary docs endpoint')
param secondaryDocsEndpoint string

@description('Custom domain for docs (e.g. docs.opendoor.ai)')
param docsCustomDomain string = ''

resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-07-01-preview' = {
  name: name
  location: 'Global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

// --- Gateway ---
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

resource gatewayCustomDomainResource 'Microsoft.Cdn/profiles/customDomains@2023-07-01-preview' = if (!empty(gatewayCustomDomain)) {
  parent: frontDoorProfile
  name: replace(replace(gatewayCustomDomain, '.', '-'), '*', 'wildcard')
  properties: {
    hostName: gatewayCustomDomain
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

resource gatewayRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-07-01-preview' = {
  parent: gatewayEndpoint
  name: 'default'
  properties: {
    originGroup: {
      id: gatewayOriginGroup.id
    }
    customDomains: !empty(gatewayCustomDomain)
      ? [
          {
            id: gatewayCustomDomainResource.id
          }
        ]
      : []
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

// --- Dashboard ---
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

resource dashboardCustomDomainResource 'Microsoft.Cdn/profiles/customDomains@2023-07-01-preview' = if (!empty(dashboardCustomDomain)) {
  parent: frontDoorProfile
  name: replace(replace(dashboardCustomDomain, '.', '-'), '*', 'wildcard')
  properties: {
    hostName: dashboardCustomDomain
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

resource dashboardRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-07-01-preview' = {
  parent: dashboardEndpoint
  name: 'default'
  properties: {
    originGroup: {
      id: dashboardOriginGroup.id
    }
    customDomains: !empty(dashboardCustomDomain)
      ? [
          {
            id: dashboardCustomDomainResource.id
          }
        ]
      : []
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

// --- Docs ---
resource docsOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'docs-og'
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

resource docsPrimaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: docsOriginGroup
  name: 'primary'
  properties: {
    hostName: primaryDocsEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
  }
}

resource docsSecondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-07-01-preview' = {
  parent: docsOriginGroup
  name: 'secondary'
  properties: {
    hostName: secondaryDocsEndpoint
    httpPort: 80
    httpsPort: 443
    priority: 2
    weight: 1000
  }
}

resource docsEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-07-01-preview' = {
  parent: frontDoorProfile
  name: 'docs'
  location: 'Global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource docsCustomDomainResource 'Microsoft.Cdn/profiles/customDomains@2023-07-01-preview' = if (!empty(docsCustomDomain)) {
  parent: frontDoorProfile
  name: replace(replace(docsCustomDomain, '.', '-'), '*', 'wildcard')
  properties: {
    hostName: docsCustomDomain
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

resource docsRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-07-01-preview' = {
  parent: docsEndpoint
  name: 'default'
  properties: {
    originGroup: {
      id: docsOriginGroup.id
    }
    customDomains: !empty(docsCustomDomain)
      ? [
          {
            id: docsCustomDomainResource.id
          }
        ]
      : []
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
    docsPrimaryOrigin
    docsSecondaryOrigin
  ]
}

output gatewayHostName string = gatewayEndpoint.properties.hostName
output dashboardHostName string = dashboardEndpoint.properties.hostName
output docsHostName string = docsEndpoint.properties.hostName
output gatewayCustomDomainValidation string = !empty(gatewayCustomDomain)
  ? 'Create CNAME: ${gatewayCustomDomain} -> ${gatewayEndpoint.properties.hostName}'
  : 'No custom domain configured'
output dashboardCustomDomainValidation string = !empty(dashboardCustomDomain)
  ? 'Create CNAME: ${dashboardCustomDomain} -> ${dashboardEndpoint.properties.hostName}'
  : 'No custom domain configured'
output docsCustomDomainValidation string = !empty(docsCustomDomain)
  ? 'Create CNAME: ${docsCustomDomain} -> ${docsEndpoint.properties.hostName}'
  : 'No custom domain configured'
