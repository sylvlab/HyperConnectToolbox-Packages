import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw Error(`Missing value for ${name}`);
  return value;
}
const directory = option('--catalog', 'site/v1/stable');
const localAssets = option('--local-assets');
const bytes = await readFile(join(directory, 'index.json'));
const sig = await readFile(join(directory, 'index.sig'));
if (bytes.length > 2 * 1024 * 1024 || sig.length !== 64) throw Error('Catalog size invalid');
const index = JSON.parse(bytes);
const ring = JSON.parse(await readFile('trust/tool-trust.json'));
const keys = ring.keys.filter(k => k.keyId === index.signingKeyId);
if (keys.length !== 1) throw Error('Unknown signing key');
const key = keys[0];
if (key.status !== 'active' || key.publisher !== index.publisher || !key.purposes.includes('hct-tool-index')) throw Error('Unauthorized signing key');
const blob = Buffer.from(key.publicBlob, 'base64');
if (blob.length !== 72 || blob.readUInt32LE(0) !== 0x31534345 || blob.readUInt32LE(4) !== 32) throw Error('Invalid key');
const der = Buffer.concat([Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex'), blob.subarray(8)]);
if (createHash('sha256').update(der).digest('hex') !== index.signingKeyId) throw Error('Key identity mismatch');
if (!verify('sha256', bytes, { key: createPublicKey({ key: der, format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' }, sig)) throw Error('Invalid signature');
const expires = Date.parse(index.expires);
if (![1, 2].includes(index.schema) || index.purpose !== 'hct-tool-index' || !Number.isSafeInteger(index.revision) || index.revision < (index.schema === 2 ? 5 : 1) || !Number.isFinite(expires) || expires <= Date.now()) throw Error('Invalid or expired catalog');
const previous = option('--previous');
if (previous) {
  const priorBytes = await readFile(previous);
  const prior = JSON.parse(priorBytes);
  if (prior.revision > index.revision || (prior.revision === index.revision && !priorBytes.equals(bytes))) throw Error('Catalog rollback or same-revision conflict');
}
if (process.argv.includes('--renewal-check') && expires - Date.now() < 7 * 24 * 60 * 60 * 1000) throw Error('Catalog expires in less than seven days. Renew locally with the existing CNG key and increase the revision.');
if (!Array.isArray(index.packages) || index.packages.length > 1024) throw Error('Invalid package count');
const ids = new Set();
const permissions = {
  windows: ['RepairWindows', 'RepairApps'],
  service: ['InspectService', 'RepairService'],
  status: ['InspectClients', 'InspectRuntime'],
  device: ['ResolveProfiles', 'Inspect', 'ApplyCompatibility', 'RestoreModel'],
  camera: ['ResolveCamera', 'PreviewCamera', 'ApplyCamera', 'RestoreStoredCamera'],
  audio: ['ResolveAudio', 'PreviewAudio', 'ApplyAudio', 'RestoreStoredAudio'],
  mouse: ['ResolveMouse', 'PreviewMouse', 'ApplyMouse', 'RestoreStoredMouse'],
  plugin: ['TrustPlugin', 'InstallPlugin', 'UninstallPlugin'],
};
const version = /^\d+\.\d+\.\d+(\.\d+)?$/;
const hashPattern = /^[a-f0-9]{64}$/i;
const label = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\p{Cc}]/u.test(value);
if (index.schema === 2) {
  if (!Array.isArray(index.revocations) || index.revocations.length > 1024) throw Error('Invalid revocation list');
  const seen = new Set();
  for (const item of index.revocations) {
    const identity = `${item.id}/${item.version}/${String(item.sha256).toLowerCase()}`;
    if (!Object.hasOwn(permissions, item.id) || !version.test(item.version) || !hashPattern.test(item.sha256) || seen.has(identity)) throw Error('Invalid or repeated revocation');
    seen.add(identity);
  }
}
async function verifyBytes(stream, size, expected, id) {
  const hash = createHash('sha256');
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > size) throw Error(`Asset exceeds signed size: ${id}`);
    hash.update(chunk);
  }
  if (total !== size || hash.digest('hex') !== expected.toLowerCase()) throw Error(`Asset changed: ${id}`);
}
for (const p of index.packages) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || ids.has(p.id) || !/^[a-f0-9]{64}$/i.test(p.sha256) || !Number.isSafeInteger(p.size) || p.size <= 0 || p.size > 2 * 1024 ** 3) throw Error('Invalid package');
  if (!version.test(p.version) || !version.test(p.minHost) || p.architecture !== 'x64' || p.protocol !== 1) throw Error('Invalid compatibility metadata');
  ids.add(p.id);
  let url = new URL(p.url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/sylvlab/HyperConnectToolbox-Packages/releases/download/') || url.username || url.password || url.port || url.hash) throw Error('Unexpected package source');
  if (index.schema === 2) {
    const supported = Object.hasOwn(permissions, p.id) && permissions[p.id];
    const host = p.minHost.split('.').map(Number);
    if (!supported || p.packageSchema !== 2 || p.packageName !== `com.sylvlab.hyperconnect.${p.id}` ||
        !(host[0] > 0 || host[1] >= 6) || !label(p.name, 80) || !label(p.description, 320) || !label(p.category, 64) ||
        !Array.isArray(p.permissions) || p.permissions.length !== supported.length || !supported.every(item => p.permissions.includes(item)))
      throw Error(`Shared tool metadata invalid: ${p.id}`);
    const filename = `${p.id}-${p.version}.hctapp`;
    const parts = url.pathname.split('/');
    if (url.search || parts.length !== 7 || !/^[A-Za-z0-9._-]+$/.test(parts[5]) || parts[6] !== filename) throw Error('Release URL must identify a versioned tool attachment');
    const icon = p.icon;
    const iconFile = `${p.id}.png`;
    if (!icon || icon.url !== `https://sylvlab.github.io/HyperConnectToolbox-Packages/v2/stable/icons/${iconFile}` ||
        !Number.isSafeInteger(icon.size) || icon.size < 33 || icon.size > 128 * 1024 || !hashPattern.test(icon.sha256)) throw Error('Invalid icon metadata');
    const png = await readFile(join(directory, 'icons', iconFile));
    if (png.length !== icon.size || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        png.toString('ascii', 12, 16) !== 'IHDR' || [png.readUInt32BE(16), png.readUInt32BE(20)].some(n => n < 1 || n > 256))
      throw Error('Invalid PNG icon');
    await verifyBytes([png], icon.size, icon.sha256, iconFile);
    if (localAssets) await verifyBytes(createReadStream(join(localAssets, filename)), p.size, p.sha256, p.id);
  }
  if (!process.argv.includes('--download')) continue;
  let response;
  for (let hop = 0; hop < 6; hop++) {
    const githubAsset = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname);
    const officialRelease = url.hostname === 'github.com' && url.pathname.startsWith('/sylvlab/HyperConnectToolbox-Packages/releases/download/');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(githubAsset || officialRelease)) throw Error('Unexpected redirect');
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15 * 60 * 1000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw Error('Missing redirect');
      await response.body?.cancel();
      url = new URL(location, url);
      response = undefined;
      continue;
    }
    break;
  }
  if (!response?.ok) throw Error(`Release asset unavailable: ${p.id}`);
  await verifyBytes(response.body, p.size, p.sha256, p.id);
}
console.log(`Verified catalog revision ${index.revision}, ${ids.size} official packages`);
