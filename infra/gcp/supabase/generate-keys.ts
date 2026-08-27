#!/usr/bin/env bun
/**
 * Supabase Cryptographic Secret & JWT Generator
 * Generates RFC 7519 compliant HS256 JWTs for Supabase:
 * - JWT_SECRET (256-bit high-entropy secret)
 * - ANON_KEY (signed JWT for public client requests)
 * - SERVICE_ROLE_KEY (signed JWT with bypass RLS privileges)
 * - POSTGRES_PASSWORD (high-entropy DB password)
 * - DASHBOARD_PASSWORD (secure Studio web UI password)
 * - SECRET_KEY_BASE & VAULT_ENC_KEY
 */

import { randomBytes, createHmac } from 'node:crypto';

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const tokenData = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret)
    .update(tokenData)
    .digest();

  const encodedSignature = base64UrlEncode(signature);
  return `${tokenData}.${encodedSignature}`;
}

export function generateSupabaseSecrets() {
  const now = Math.floor(Date.now() / 1000);
  // Valid for 10 years
  const exp = now + 10 * 365 * 24 * 60 * 60;

  // 1. JWT Secret (64 character hex = 256 bits of entropy)
  const jwtSecret = randomBytes(32).toString('hex');

  // 2. Anon Key (public client token)
  const anonPayload = {
    role: 'anon',
    iss: 'supabase',
    iat: now,
    exp: exp,
  };
  const anonKey = signJwt(anonPayload, jwtSecret);

  // 3. Service Role Key (admin token)
  const serviceRolePayload = {
    role: 'service_role',
    iss: 'supabase',
    iat: now,
    exp: exp,
  };
  const serviceRoleKey = signJwt(serviceRolePayload, jwtSecret);

  // 4. Passwords and keys
  const postgresPassword = randomBytes(24).toString('base64').replace(/[/+=]/g, '').slice(0, 32);
  const dashboardUsername = 'admin';
  const dashboardPassword = randomBytes(16).toString('base64').replace(/[/+=]/g, '').slice(0, 24);
  const secretKeyBase = randomBytes(32).toString('hex');
  const vaultEncKey = randomBytes(16).toString('hex');
  const pgbouncerAuthToken = randomBytes(24).toString('hex');

  return {
    jwtSecret,
    anonKey,
    serviceRoleKey,
    postgresPassword,
    dashboardUsername,
    dashboardPassword,
    secretKeyBase,
    vaultEncKey,
    pgbouncerAuthToken,
  };
}

// CLI execution
if (import.meta.main || process.argv[1]?.endsWith('generate-keys.ts')) {
  const secrets = generateSupabaseSecrets();
  
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(secrets, null, 2));
  } else if (process.argv.includes('--env')) {
    console.log(`JWT_SECRET=${secrets.jwtSecret}`);
    console.log(`ANON_KEY=${secrets.anonKey}`);
    console.log(`SERVICE_ROLE_KEY=${secrets.serviceRoleKey}`);
    console.log(`POSTGRES_PASSWORD=${secrets.postgresPassword}`);
    console.log(`DASHBOARD_USERNAME=${secrets.dashboardUsername}`);
    console.log(`DASHBOARD_PASSWORD=${secrets.dashboardPassword}`);
    console.log(`SECRET_KEY_BASE=${secrets.secretKeyBase}`);
    console.log(`VAULT_ENC_KEY=${secrets.vaultEncKey}`);
  } else {
    console.log('=== Supabase Generated Cryptographic Secrets ===\n');
    console.log(`POSTGRES_PASSWORD   : ${secrets.postgresPassword}`);
    console.log(`JWT_SECRET          : ${secrets.jwtSecret}`);
    console.log(`ANON_KEY            : ${secrets.anonKey}`);
    console.log(`SERVICE_ROLE_KEY    : ${secrets.serviceRoleKey}`);
    console.log(`DASHBOARD_USERNAME  : ${secrets.dashboardUsername}`);
    console.log(`DASHBOARD_PASSWORD  : ${secrets.dashboardPassword}`);
    console.log(`SECRET_KEY_BASE     : ${secrets.secretKeyBase}`);
    console.log(`VAULT_ENC_KEY       : ${secrets.vaultEncKey}`);
    console.log('\nUse --env or --json flag for automated parsing.');
  }
}
