import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const policy = await fs.readFile(path.join(root, 'src-tauri/src/converters/media/streams.rs'), 'utf8');
const protocols = policy.match(/const INPUT_PROTOCOLS: &str = "([^"]+)"/u)?.[1];
assert.equal(protocols, 'file,pipe', 'Review protocol changes before allowing network input');
const target = process.platform === 'win32' ? 'x86_64-pc-windows-msvc.exe'
  : process.platform === 'darwin' && process.arch === 'arm64' ? 'aarch64-apple-darwin'
  : process.platform === 'linux' && process.arch === 'x64' ? 'x86_64-unknown-linux-gnu' : null;
assert.ok(target, 'Run media privacy checks on a supported native host');
const binary = (name) => path.join(root, 'src-tauri', 'binaries', `${name}-${target}`);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-media-offline-'));
const requests = [];
let server;
try {
  const segment = path.join(temporary, 'segment.ts');
  const fixture = spawnSync(binary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i',
    'color=size=96x64:rate=12:duration=0.4', '-codec:v', 'libx264', '-threads', '1', '-f', 'mpegts', segment],
    { timeout: 30_000, encoding: 'utf8', windowsHide: true });
  assert.equal(fixture.status, 0, fixture.stderr || fixture.error?.message);
  const bytes = await fs.readFile(segment);
  server = http.createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { 'Content-Type': 'video/mp2t' });
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const playlist = path.join(temporary, 'remote.m3u8');
  const url = `http://127.0.0.1:${server.address().port}/segment.ts`;
  await fs.writeFile(playlist, `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:0.4,\n${url}\n#EXT-X-ENDLIST\n`);
  const before = hash(await fs.readFile(playlist));
  const unrestricted = await run(binary('ffprobe'), ['-v', 'error', '-protocol_whitelist',
    'file,http,tcp,crypto,data', '-show_streams', '-of', 'json', playlist]);
  assert.equal(unrestricted.code, 0, unrestricted.stderr);
  assert.ok(requests.length > 0, 'The control must demonstrate a real HTTP request');
  const controlRequests = requests.length;
  requests.length = 0;
  const results = [];
  for (const name of ['ffmpeg', 'ffprobe']) {
    const options = name === 'ffmpeg' ? ['-i', playlist, '-f', 'null', '-'] : ['-show_streams', '-of', 'json', playlist];
    const result = await run(binary(name), ['-v', 'error', '-protocol_whitelist', protocols, ...options]);
    assert.notEqual(result.code, 0, `${name} must reject the remote stream`);
    assert.equal(requests.length, 0, `${name} must not contact HTTP`);
    results.push({ tool: name, rejected: true, requests: 0 });
  }
  assert.equal(hash(await fs.readFile(playlist)), before, 'Source playlist must remain unchanged');
  const report = { schemaVersion: 1, platform: process.platform, arch: process.arch,
    controlRequests, restricted: results, sourceUnchanged: true };
  const output = path.join(root, 'test-results', 'phase-6');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'media-offline.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Media offline protocols passed: HTTP control observed; FFmpeg and ffprobe blocked it with zero requests; source unchanged.');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(temporary, { recursive: true, force: true });
}

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    child.stdout.resume();
    child.stderr.on('data', (data) => { stderr = (stderr + data.toString('utf8')).slice(-65_536); });
    const deadline = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30_000);
    child.on('error', (error) => { clearTimeout(deadline); reject(error); });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (timedOut) reject(new Error('Media privacy fixture timed out'));
      else resolve({ code, stderr });
    });
  });
}
