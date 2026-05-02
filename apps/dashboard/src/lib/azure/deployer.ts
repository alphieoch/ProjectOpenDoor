// Azure Container App deployment worker
// Creates and manages user model deployments on Azure Container Apps

interface AzureCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  subscriptionId: string;
}

interface ComputeSpec {
  cpu: string;
  memoryGb: string;
  replicas: number;
}

function getCredentials(): AzureCredentials {
  return {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    tenantId: process.env.AZURE_TENANT_ID!,
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
  };
}

async function getAccessToken(creds: AzureCredentials): Promise<string> {
  const url = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    resource: "https://management.azure.com/",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to get Azure token: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function createContainerApp(
  name: string,
  imageUrl: string,
  envVars: Record<string, string>,
  compute: ComputeSpec,
  resourceGroup: string = "OchiengandCo",
  containerAppEnvName: string = "ochiengandco-env"
): Promise<{ fqdn: string; resourceId: string }> {
  const creds = getCredentials();
  const token = await getAccessToken(creds);

  // Get Container App Environment ID
  const envUrl = `https://management.azure.com/subscriptions/${creds.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/managedEnvironments/${containerAppEnvName}?api-version=2023-05-01`;
  const envRes = await fetch(envUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!envRes.ok) {
    throw new Error(`Failed to get Container App Environment: ${await envRes.text()}`);
  }

  const envData = await envRes.json();
  const envId = envData.id;

  // Create Container App
  const appName = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
  const appUrl = `https://management.azure.com/subscriptions/${creds.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/containerApps/${appName}?api-version=2023-05-01`;

  const environmentVariables = Object.entries(envVars).map(([name, value]) => ({
    name,
    value,
  }));

  const payload = {
    location: "uksouth",
    properties: {
      managedEnvironmentId: envId,
      configuration: {
        ingress: {
          external: true,
          targetPort: 8000,
          transport: "auto",
        },
        registries: [],
      },
      template: {
        containers: [
          {
            name: appName,
            image: imageUrl,
            env: environmentVariables,
            resources: {
              cpu: parseFloat(compute.cpu),
              memory: `${compute.memoryGb}Gi`,
            },
          },
        ],
        scale: {
          minReplicas: compute.replicas,
          maxReplicas: compute.replicas,
        },
      },
    },
  };

  const createRes = await fetch(appUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Container App: ${await createRes.text()}`);
  }

  const createData = await createRes.json();
  const resourceId = createData.id;

  // Poll for FQDN
  let fqdn = "";
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(appUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (statusRes.ok) {
      const statusData = await statusRes.json();
      fqdn = statusData.properties?.configuration?.ingress?.fqdn || "";
      if (fqdn) break;
    }
  }

  if (!fqdn) {
    throw new Error("Container App created but FQDN not available after polling");
  }

  return { fqdn: `https://${fqdn}`, resourceId };
}

export async function deleteContainerApp(
  appName: string,
  resourceGroup: string = "OchiengandCo"
): Promise<void> {
  const creds = getCredentials();
  const token = await getAccessToken(creds);

  const appUrl = `https://management.azure.com/subscriptions/${creds.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/containerApps/${appName}?api-version=2023-05-01`;

  const res = await fetch(appUrl, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete Container App: ${await res.text()}`);
  }
}
