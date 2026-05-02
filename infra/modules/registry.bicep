@description('Container registry name')
param name string

@description('Azure region')
param location string

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

output loginServer string = registry.properties.loginServer
output username string = registry.listCredentials().username
output password string = registry.listCredentials().passwords[0].value
