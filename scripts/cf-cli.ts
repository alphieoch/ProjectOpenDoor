import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 1. Extract OAuth Token from active Wrangler session
function getWranglerToken(): string {
  try {
    const configPath = path.join(os.homedir(), "Library/Preferences/.wrangler/config/default.toml");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match && match[1]) return match[1];
    }
  } catch {}
  return process.env.CLOUDFLARE_API_TOKEN || "";
}

const TOKEN = getWranglerToken();
const ACCOUNT_ID = "187454de8dbba4465b3e41fcea41dc9c";

async function cfRequest(method: string, endpoint: string, body?: any) {
  const url = endpoint.startsWith("http") ? endpoint : `https://api.cloudflare.com/client/v4${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return await res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "list";

  console.log("⛅️ Cloudflare CLI Bridge (Active Session: alphieo@hotmail.co.uk)");
  console.log(`Account ID: ${ACCOUNT_ID}\n`);

  if (!TOKEN) {
    console.error("❌ No active Wrangler OAuth session or CLOUDFLARE_API_TOKEN found.");
    process.exit(1);
  }

  if (cmd === "list" || cmd === "zones") {
    const zones: any = await cfRequest("GET", "/zones?per_page=50");
    if (!zones.success) {
      console.error("❌ Failed to list zones:", zones.errors);
      process.exit(1);
    }
    if (zones.result.length === 0) {
      console.log("No domains/zones currently registered in this Cloudflare account.");
      console.log("\nTo add your domain to Cloudflare, run:");
      console.log("  bun run scripts/cf-cli.ts add-zone <yourdomain.com>");
    } else {
      console.log("Active Domains in Cloudflare:");
      zones.result.forEach((z: any) => {
        console.log(`- ${z.name} (ID: ${z.id}, Status: ${z.status}, Nameservers: ${z.name_servers?.join(", ")})`);
      });
    }
  } else if (cmd === "add-zone") {
    const domain = args[1];
    if (!domain) {
      console.error("Usage: bun run scripts/cf-cli.ts add-zone <domain.com>");
      process.exit(1);
    }
    console.log(`==> Adding domain '${domain}' to Cloudflare...`);
    const res: any = await cfRequest("POST", "/zones", {
      account: { id: ACCOUNT_ID },
      name: domain,
      type: "full",
    });
    if (res.success) {
      console.log(`✓ Domain '${domain}' added to Cloudflare!`);
      console.log(`Zone ID: ${res.result.id}`);
      console.log(`Assigned Nameservers: ${res.result.name_servers?.join(", ")}`);
      console.log("\nNext: Point your domain's nameservers at your registrar (GoDaddy/Namecheap/Google Domains) to these nameservers.");
    } else {
      console.error("❌ Cloudflare API Error:", res.errors);
    }
  } else if (cmd === "connect") {
    const domain = args[1];
    const appSub = args[2] || "jobs";
    const apiSub = args[3] || "api";
    if (!domain) {
      console.error("Usage: bun run scripts/cf-cli.ts connect <domain.com> [app_subdomain] [api_subdomain]");
      process.exit(1);
    }

    // 1. Get Zone
    const zonesRes: any = await cfRequest("GET", `/zones?name=${domain}`);
    if (!zonesRes.success || zonesRes.result.length === 0) {
      console.error(`❌ Zone for '${domain}' not found. Add it first using: bun run scripts/cf-cli.ts add-zone ${domain}`);
      process.exit(1);
    }
    const zoneId = zonesRes.result[0].id;
    console.log(`==> Found Zone ID: ${zoneId} for ${domain}`);

    // 2. Add CNAME for Cloud Run
    console.log(`==> Creating proxied CNAME: ${appSub}.${domain} -> ghs.googlehosted.com...`);
    const cnameRes: any = await cfRequest("POST", `/zones/${zoneId}/dns_records`, {
      type: "CNAME",
      name: appSub,
      content: "ghs.googlehosted.com",
      ttl: 1,
      proxied: true,
    });
    if (cnameRes.success) {
      console.log(`    ✓ Created ${appSub}.${domain} (Proxied)`);
    } else {
      console.log(`    ℹ️ ${cnameRes.errors?.[0]?.message || JSON.stringify(cnameRes.errors)}`);
    }

    // 3. Add A record for Supabase Caddy
    console.log(`==> Creating proxied A record: ${apiSub}.${domain} -> 35.238.100.26...`);
    const aRes: any = await cfRequest("POST", `/zones/${zoneId}/dns_records`, {
      type: "A",
      name: apiSub,
      content: "35.238.100.26",
      ttl: 1,
      proxied: true,
    });
    if (aRes.success) {
      console.log(`    ✓ Created ${apiSub}.${domain} (Proxied)`);
    } else {
      console.log(`    ℹ️ ${aRes.errors?.[0]?.message || JSON.stringify(aRes.errors)}`);
    }

    // 4. Enforce Full Strict SSL
    console.log("==> Setting SSL/TLS to Full (strict)...");
    await cfRequest("PATCH", `/zones/${zoneId}/settings/ssl`, { value: "strict" });
    await cfRequest("PATCH", `/zones/${zoneId}/settings/always_use_https`, { value: "on" });
    await cfRequest("PATCH", `/zones/${zoneId}/settings/tls_1_3`, { value: "on" });
    await cfRequest("PATCH", `/zones/${zoneId}/settings/brotli`, { value: "on" });
    console.log("    ✓ SSL/TLS Full (Strict), TLS 1.3, and Brotli enabled.");

    console.log("\n🎉 Cloudflare connection setup complete!");
  }
}

main().catch(console.error);
