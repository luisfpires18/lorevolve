// LorEvolve DEV infrastructure. One Linux App Service, and the plan it runs on. Nothing else:
// the app is one process that serves both the API and the built client, and it keeps its
// SQLite database and its Data Protection key ring on the site's own persistent /home share.
//
// DEV only, and not a production template. There is no slot, no scale-out, no Key Vault and
// no custom domain, because none of those are free of consequences for a single-writer SQLite
// file. See docs/deployment/azure-dev.md for what that costs and why it is accepted here.
//
// No secret is declared, referenced or output by this file.

targetScope = 'resourceGroup'

@description('Globally unique name for the DEV App Service. Becomes <name>.azurewebsites.net.')
@minLength(2)
@maxLength(60)
param appName string

@description('Azure region. Defaults to the resource group\'s.')
param location string = resourceGroup().location

@description('Name for the App Service plan.')
param appServicePlanName string = '${appName}-plan'

@description('Plan size. B1 is the smallest that supports Always On, which SQLite wants.')
param skuName string = 'B1'

@description('Runtime stack. Check availability with: az webapp list-runtimes --os linux.')
param linuxFxVersion string = 'DOTNETCORE|10.0'

@description('Host header filter. Narrow this to the site hostname once DEV is reachable.')
param allowedHosts string = '*'

@description('ASP.NET Core environment name. Selects appsettings.AzureDev.json.')
param environmentName string = 'AzureDev'

@description('Tags applied to both resources.')
param tags object = {
  application: 'lorevolve'
  environment: 'dev'
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  kind: 'linux'
  properties: {
    reserved: true // Linux.
  }
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true // The PWA needs a secure context, and the session cookie is Secure.
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      alwaysOn: true // Otherwise an idle site unloads and the next visitor pays for a migration.
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/health'
      appCommandLine: 'dotnet LorEvolve.Api.dll'
      // One writer. SQLite over the /home share cannot survive a second instance.
      numberOfWorkers: 1
      appSettings: [
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: environmentName
        }
        {
          name: 'AllowedHosts'
          value: allowedHosts
        }
        {
          // The workflow uploads output that is already published. Oryx must not rebuild it.
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          // Mount the ZIP read-only as wwwroot, so a deploy never swaps assemblies under the running process.
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
      ]
    }
  }
}

output appServiceName string = site.name
output defaultHostName string = site.properties.defaultHostName
output appUrl string = 'https://${site.properties.defaultHostName}'
