import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorld, step, fieldAt, analyze, render, renderSVG } from '../src/index.js';
const cli = args => spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
test('seeds reproduce and incremental updates equal batched steps', () => { const a = createWorld(), b = createWorld(); step(a, 300); for (let i = 0; i < 300; i++) step(b); assert.deepEqual(a, b); assert.notDeepEqual(a.particles, step(createWorld({ seed: 7 }), 300).particles); });
test('reflections preserve speeds and keep every blob inside the field', () => {
  for (const seed of [0, 42, 0xffffffff]) { const w = createWorld({ seed, blobs: 16 }), speeds = w.particles.map(p => Math.hypot(p.vx, p.vy)), radii = w.particles.map(p => p.radius); for (let k = 0; k < 30; k++) { step(w, 200); w.particles.forEach((p, i) => { assert.ok(p.x >= p.radius && p.x <= 1.6 - p.radius && p.y >= p.radius && p.y <= 1 - p.radius); assert.equal(Math.hypot(p.vx, p.vy), speeds[i]); assert.equal(p.radius, radii[i]); }); } }
});
test('field contributions add and coverage decreases as threshold increases', () => {
  const w = createWorld(); const expected = w.particles.reduce((sum, p) => sum + p.radius ** 2 / ((0.8 - p.x) ** 2 + (0.5 - p.y) ** 2 + 0.001), 0); assert.ok(Math.abs(fieldAt(w, 0.8, 0.5) - expected) < 1e-12);
  w.threshold = 0.6; const low = analyze(w).filledCells; w.threshold = 2.2; assert.ok(analyze(w).filledCells < low); const before = structuredClone(w.particles); w.palette = 'lagoon'; assert.deepEqual(w.particles, before); assert.throws(() => fieldAt(w, NaN, 0));
});
test('validation, no-op steps, and renderers', () => {
  for (const o of [{ seed: -1 }, { blobs: 1 }, { blobs: 17 }, { threshold: Infinity }, { threshold: 0.5 }, { palette: 'toString' }, { width: 0 }, { height: 100 }]) assert.throws(() => createWorld(o));
  const w = createWorld(), before = structuredClone(w); step(w, 0); assert.deepEqual(w, before); assert.throws(() => step(w, 0.1)); assert.throws(() => step(w, -1));
  const rows = render(w).split('\n'); assert.equal(rows.length, w.height); assert.ok(rows.every(row => row.length === w.width)); assert.ok(!render(w).includes('\x1b')); assert.match(render(w, { color: true }), /\x1b\[/);
  const svg = renderSVG(w); assert.match(svg, /<path d="M/); assert.ok(!/NaN|Infinity|undefined/.test(svg)); const other = createWorld({ width: 24, height: 12 }); assert.equal(renderSVG(other), svg);
});
test('CLI supports exports, custom options, and argument errors', () => {
  const r = cli(['--steps', '20', '--blobs', '4', '--threshold', '1.5', '--palette', 'violet', '--json']); assert.equal(r.status, 0, r.stderr); const data = JSON.parse(r.stdout); assert.equal(data.frame, 20); assert.equal(data.blobs, 4); assert.equal(data.threshold, 1.5); assert.equal(data.palette, 'violet');
  assert.ok(!cli(['--steps', '0']).stdout.includes('\x1b')); assert.equal(cli(['--help']).status, 0);
  for (const args of [['--seed'], ['--blobs', '0'], ['--threshold', '3'], ['--palette', 'bad'], ['--json', '--frames', '1'], ['--wat']]) assert.equal(cli(args).status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'lava-')); try { const file = join(dir, 'out.svg'), r = cli(['--steps', '0', '--svg', file, '--json']); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).frame, 0); assert.match(readFileSync(file, 'utf8'), /LAVA LAMP/); assert.equal(cli(['--svg', join(dir, 'missing', 'out.svg')]).status, 2); } finally { rmSync(dir, { recursive: true, force: true }); }
});
