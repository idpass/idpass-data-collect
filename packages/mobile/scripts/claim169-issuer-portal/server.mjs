#!/usr/bin/env node
/**
 * Claim-169 issuer portal — demo authority simulator.
 *
 * Stands up a small local web app at http://localhost:5180/ that lets you
 * mint a Claim-169 VC interactively (form → ed25519 sign → QR). Useful for
 * the UC3 widow-enrolment demo when you need to issue VCs for ad-hoc subjects
 * during a live walkthrough instead of pre-printing QRs.
 *
 * Trust model
 * -----------
 * The issuer ed25519 keypair lives in the same uc3-demo-artifacts directory
 * as the CLI mint script (`mint-uc3-demo-vc.mjs`). Anything the portal signs
 * will verify against the same trustedIssuers entry the tenant config already
 * lists, so QRs minted here are interchangeable with the pre-baked ones.
 *
 * Architecture
 * ------------
 * Pure Node stdlib HTTP server — no Express, no extra deps. Reuses the
 * `claim169` + `qrcode` packages already installed for the mobile workspace.
 *
 * Usage
 * -----
 *   node packages/mobile/scripts/claim169-issuer-portal/server.mjs
 *   # then open http://localhost:5180/
 */

import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Encoder } from 'claim169';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', '..', '..', 'scripts', 'uc3-demo-artifacts');
const ISSUER_ID = 'did:web:demo-issuer.example.gov';
const PORT = Number(process.env.CLAIM169_PORTAL_PORT || 5180);
const HOST = process.env.CLAIM169_PORTAL_HOST || '127.0.0.1';

// ---- Issuer keypair --------------------------------------------------------
mkdirSync(ARTIFACTS_DIR, { recursive: true });
const privPath = join(ARTIFACTS_DIR, 'issuer-ed25519.priv.b64');
const pubPath = join(ARTIFACTS_DIR, 'issuer-ed25519.pub.b64');
const pubHexPath = join(ARTIFACTS_DIR, 'issuer-ed25519.pub.hex');

let privBytes;
let pubBytes;

if (existsSync(privPath) && existsSync(pubPath)) {
  privBytes = Buffer.from(readFileSync(privPath, 'utf8').trim(), 'base64');
  pubBytes = Buffer.from(readFileSync(pubPath, 'utf8').trim(), 'base64');
  console.log(`[issuer-portal] Reusing issuer keypair from ${ARTIFACTS_DIR}`);
} else {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  privBytes = Buffer.from(privJwk.d, 'base64url');
  pubBytes = Buffer.from(pubJwk.x, 'base64url');
  writeFileSync(privPath, Buffer.from(privBytes).toString('base64') + '\n', { mode: 0o600 });
  writeFileSync(pubPath, Buffer.from(pubBytes).toString('base64') + '\n');
  console.log(`[issuer-portal] Generated new issuer keypair at ${ARTIFACTS_DIR}`);
}
writeFileSync(pubHexPath, Buffer.from(pubBytes).toString('hex') + '\n');

if (privBytes.length !== 32 || pubBytes.length !== 32) {
  console.error('[issuer-portal] FATAL: ed25519 key length mismatch');
  process.exit(1);
}

const issuerPubB64 = Buffer.from(pubBytes).toString('base64');

// ---- Subject presets (demo profiles) --------------------------------------
// Mirrors mint-uc3-demo-vc.mjs PROFILES so the portal's quick-pick chips
// match the CLI defaults. Free-form entry is always available too.
const PRESETS = {
  morgan: {
    id: 'IND-NSR-0004',
    firstName: 'Morgan',
    lastName: 'Cole',
    dateOfBirth: '1968-09-02',
    gender: 2,
    address: '7 Maseno Lane, South District',
  },
  rin: {
    id: 'IND-NSR-0009',
    firstName: 'Rin',
    lastName: 'Lee',
    dateOfBirth: '1953-05-30',
    gender: 2,
    address: '21 Tinka Road, Central District',
  },
  iris: {
    id: 'IND-NSR-0011',
    firstName: 'Iris',
    lastName: 'Brooks',
    dateOfBirth: '1957-11-12',
    gender: 2,
    address: '4 Olive Walk, North District',
  },
};

// ---- Minting ---------------------------------------------------------------
async function mintVc(input) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullName = `${input.firstName || ''} ${input.lastName || ''}`.trim();
  const claim169Input = {
    id: input.id,
    version: '1',
    language: input.language || 'en',
    fullName,
    firstName: input.firstName || '',
    lastName: input.lastName || '',
    dateOfBirth: input.dateOfBirth,
    gender: Number(input.gender),
    address: input.address || '',
  };
  const cwtMetaInput = {
    issuer: ISSUER_ID,
    subject: claim169Input.id,
    issuedAt: nowSec,
    notBefore: nowSec,
    expiresAt: nowSec + 365 * 24 * 60 * 60,
  };

  const qrData = new Encoder(claim169Input, cwtMetaInput)
    .signWithEd25519(new Uint8Array(privBytes))
    .skipBiometrics()
    .encode();

  if (typeof qrData !== 'string' || qrData.length === 0) {
    throw new Error('Encoder returned empty payload');
  }

  const qrPngDataUrl = await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 600,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });

  return { qrData, qrPngDataUrl, claim169Input, cwtMetaInput };
}

// ---- HTTP plumbing ---------------------------------------------------------
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => {
      chunks += c.toString('utf8');
      if (chunks.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

const INDEX_HTML_PATH = join(__dirname, 'index.html');

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = readFileSync(INDEX_HTML_PATH, 'utf8');
      return sendHtml(res, html);
    }

    if (req.method === 'GET' && req.url === '/issuer-info') {
      return sendJson(res, 200, {
        issuerId: ISSUER_ID,
        ed25519PubB64: issuerPubB64,
        presets: PRESETS,
      });
    }

    if (req.method === 'POST' && req.url === '/issue') {
      const raw = await readBody(req);
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' });
      }

      const missing = [];
      if (!input.id || typeof input.id !== 'string') missing.push('id');
      if (!input.firstName || typeof input.firstName !== 'string') missing.push('firstName');
      if (!input.lastName || typeof input.lastName !== 'string') missing.push('lastName');
      if (!input.dateOfBirth || typeof input.dateOfBirth !== 'string') missing.push('dateOfBirth');
      if (input.gender == null || Number.isNaN(Number(input.gender))) missing.push('gender');
      if (missing.length) {
        return sendJson(res, 400, { error: `Missing/invalid fields: ${missing.join(', ')}` });
      }

      try {
        const result = await mintVc(input);
        return sendJson(res, 200, {
          issuerId: ISSUER_ID,
          ed25519PubB64: issuerPubB64,
          ...result,
        });
      } catch (err) {
        console.error('[issuer-portal] Mint failed:', err);
        return sendJson(res, 500, { error: err?.message || 'Mint failed' });
      }
    }

    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error('[issuer-portal] Unhandled error:', err);
    sendJson(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('[issuer-portal] Listening on http://' + HOST + ':' + PORT + '/');
  console.log('[issuer-portal] Issuer DID  : ' + ISSUER_ID);
  console.log('[issuer-portal] ed25519 pub : ' + issuerPubB64);
  console.log('[issuer-portal] Presets     : ' + Object.keys(PRESETS).join(', '));
  console.log('');
  console.log('Open the URL in a browser to issue Claim-169 VCs interactively.');
});
