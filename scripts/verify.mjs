import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';

const bytes = await readFile('site/v1/stable/index.json');
const sig = await readFile('site/v1/stable/index.sig');
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
if (index.schema !== 1 || index.purpose !== 'hct-tool-index' || !Number.isSafeInteger(index.revision) || index.revision < 1 || !Number.isFinite(expires) || expires <= Date.now()) throw Error('Invalid or expired catalog');
if (process.argv.includes('--renewal-check') && expires - Date.now() < 7 * 24 * 60 * 60 * 1000) throw Error('Catalog expires in less than seven days. Renew locally with the existing CNG key and increase the revision.');
if (!Array.isArray(index.packages) || index.packages.length > 1024) throw Error('Invalid package count');
const ids = new Set();
for (const p of index.packages) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || ids.has(p.id) || !/^[a-f0-9]{64}$/i.test(p.sha256) || !Number.isSafeInteger(p.size) || p.size <= 0 || p.size > 2 * 1024 ** 3) throw Error('Invalid package');
  if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(p.version) || !/^\d+\.\d+\.\d+(\.\d+)?$/.test(p.minHost) || p.architecture !== 'x64' || p.protocol !== 1) throw Error('Invalid compatibility metadata');
  ids.add(p.id);
  let url = new URL(p.url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/sylvlab/HyperConnectToolbox-Packages/releases/download/') || url.username || url.password || url.port || url.hash) throw Error('Unexpected package source');
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
  const hash = createHash('sha256');
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > p.size) throw Error('Release asset exceeds signed size');
    hash.update(chunk);
  }
  if (total !== p.size || hash.digest('hex') !== p.sha256.toLowerCase()) throw Error(`Release asset changed: ${p.id}`);
}
console.log(`Verified catalog revision ${index.revision}, ${ids.size} official packages`);
