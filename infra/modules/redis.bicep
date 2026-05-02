@description('Redis cache name')
param name string

@description('Azure region')
param location string

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: name
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

output hostName string = redis.properties.hostName
output primaryKey string = redis.listKeys().primaryKey
