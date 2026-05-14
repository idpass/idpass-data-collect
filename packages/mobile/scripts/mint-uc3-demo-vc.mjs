#!/usr/bin/env node
/**
 * Mint a Claim-169 demo VC for the UC3 (widow-enrolment) Friday demo.
 *
 * Generates:
 *   uc3-demo-artifacts/
 *     issuer-ed25519.priv.b64      — issuer ed25519 private key (32 B base64). DO NOT COMMIT.
 *     issuer-ed25519.pub.b64       — issuer ed25519 public  key (32 B base64). Goes into tenant config trustedIssuers.
 *     issuer-ed25519.pub.hex       — same key, hex form (compat with claim169 service).
 *     amaka-okonkwo-vc.qr.png      — scannable QR for the demo (1MB-ish, ~12cm printed).
 *     amaka-okonkwo-vc.raw         — raw VC string for debugging / re-encoding.
 *     amaka-okonkwo-vc.json        — pretty-printed claim payload for reviewers.
 *
 * Re-runnable: overwrites artifacts on each invocation. Pass --regen-keys
 * to also rotate the issuer keypair (otherwise it reuses existing ones).
 *
 *   node scripts/mint-uc3-demo-vc.mjs [--regen-keys]
 *
 * Print the PNG (12cm wide is plenty) and place it on a table at the demo.
 * The mobile claim169Scanner reads it as a verifiable credential signed by
 * the issuer key listed in the tenant's trustedIssuers array.
 */

import { Encoder } from 'claim169';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Artifacts live at repo-root/scripts/uc3-demo-artifacts so the seed script
// + runbook can locate them without knowing this file's location.
const ARTIFACTS_DIR = join(__dirname, '..', '..', '..', 'scripts', 'uc3-demo-artifacts');
const ISSUER_ID = 'did:web:demo-issuer.farajaland.gov';
const REGEN_KEYS = process.argv.includes('--regen-keys');

mkdirSync(ARTIFACTS_DIR, { recursive: true });

// ---- 1. Load or mint issuer keypair ----------------------------------------
const privPath = join(ARTIFACTS_DIR, 'issuer-ed25519.priv.b64');
const pubPath = join(ARTIFACTS_DIR, 'issuer-ed25519.pub.b64');
const pubHexPath = join(ARTIFACTS_DIR, 'issuer-ed25519.pub.hex');

let privBytes; // Uint8Array of 32
let pubBytes;  // Uint8Array of 32

if (existsSync(privPath) && existsSync(pubPath) && !REGEN_KEYS) {
  privBytes = Buffer.from(readFileSync(privPath, 'utf8').trim(), 'base64');
  pubBytes = Buffer.from(readFileSync(pubPath, 'utf8').trim(), 'base64');
  console.log(`[mint-vc] Reusing issuer keypair from ${ARTIFACTS_DIR}`);
} else {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  // Node returns DER/PEM-wrapped keys. Extract raw 32-byte ed25519 scalars
  // via JWK export — `d` (private) and `x` (public) are URL-safe base64 of
  // the raw bytes per RFC 8037.
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  privBytes = Buffer.from(privJwk.d, 'base64url');
  pubBytes = Buffer.from(pubJwk.x, 'base64url');
  writeFileSync(privPath, Buffer.from(privBytes).toString('base64') + '\n', { mode: 0o600 });
  writeFileSync(pubPath, Buffer.from(pubBytes).toString('base64') + '\n');
  console.log(`[mint-vc] New issuer keypair written to ${ARTIFACTS_DIR}`);
}
writeFileSync(pubHexPath, Buffer.from(pubBytes).toString('hex') + '\n');

if (privBytes.length !== 32 || pubBytes.length !== 32) {
  console.error(`[mint-vc] FATAL: expected 32-byte ed25519 keys, got priv=${privBytes.length} pub=${pubBytes.length}`);
  process.exit(1);
}

// ---- 2. Mint the demo VC ---------------------------------------------------
// Claim payload for the on-stage scan target: Amaka Okonkwo, the widow the
// agent will register live during Beat 1 of the demo walkthrough.
const claim169Input = {
  id: 'FJ-2026-AMAKA-001',
  version: '1',
  language: 'en',
  fullName: 'Amaka Okonkwo',
  firstName: 'Amaka',
  lastName: 'Okonkwo',
  dateOfBirth: '1984-09-12',
  gender: 2,  // Female
  address: 'Plot 7, Maseno Lane, Farajaland — North',
};

const nowSec = Math.floor(Date.now() / 1000);
const cwtMetaInput = {
  issuer: ISSUER_ID,
  subject: claim169Input.id,
  issuedAt: nowSec,
  notBefore: nowSec,
  // 1 year — demo VCs don't need to live longer.
  expiresAt: nowSec + 365 * 24 * 60 * 60,
};

const qrData = new Encoder(claim169Input, cwtMetaInput)
  .signWithEd25519(new Uint8Array(privBytes))
  .skipBiometrics()
  .encode();

if (typeof qrData !== 'string' || qrData.length === 0) {
  console.error('[mint-vc] FATAL: Encoder returned empty payload');
  process.exit(1);
}

const rawPath = join(ARTIFACTS_DIR, 'amaka-okonkwo-vc.raw');
const jsonPath = join(ARTIFACTS_DIR, 'amaka-okonkwo-vc.json');
const qrPath = join(ARTIFACTS_DIR, 'amaka-okonkwo-vc.qr.png');

writeFileSync(rawPath, qrData);
writeFileSync(jsonPath, JSON.stringify({ claim169Input, cwtMetaInput }, null, 2));

// QR error-correction = 'M' (~15% damage tolerance) suits printed paper.
// 800px wide @ 300dpi ≈ 6.8cm; bump scale for bigger paper.
await QRCode.toFile(qrPath, qrData, {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 800,
  color: { dark: '#000000ff', light: '#ffffffff' },
});

console.log('');
console.log('[mint-vc] Done.');
console.log('  Tenant config: copy this into trustedIssuers[].publicKey.ed25519');
console.log(`    issuerId : ${ISSUER_ID}`);
console.log(`    ed25519  : ${Buffer.from(pubBytes).toString('base64')}`);
console.log('');
console.log(`  Files written under ${ARTIFACTS_DIR}/`);
console.log('    issuer-ed25519.priv.b64    (DO NOT COMMIT)');
console.log('    issuer-ed25519.pub.b64     (safe to share — goes in tenant config)');
console.log('    issuer-ed25519.pub.hex     (alt encoding)');
console.log('    amaka-okonkwo-vc.qr.png    (print this)');
console.log('    amaka-okonkwo-vc.raw       (raw VC payload for debugging)');
console.log('    amaka-okonkwo-vc.json      (claim payload for reviewers)');
