export const palettes = { ember: ['#431d48', '#e45b67', '#ff9b58', '#ffe6a1'], lagoon: ['#123f54', '#237e98', '#49c5b6', '#cbffe1'], violet: ['#2c2353', '#7759bf', '#c68be8', '#ffe0ff'] };
export function createWorld({ seed = 42, width = 80, height = 32, blobs = 7, threshold = 1.2, palette = 'ember' } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be unsigned 32-bit');
  if (!Number.isInteger(width) || width < 24 || width > 120 || !Number.isInteger(height) || height < 12 || height > 60) throw new Error('width must be 24–120 and height 12–60');
  if (!Number.isInteger(blobs) || blobs < 2 || blobs > 16) throw new Error('blobs must be 2–16');
  if (!Number.isFinite(threshold) || threshold < 0.6 || threshold > 2.2) throw new Error('threshold must be between 0.6 and 2.2');
  if (!Object.hasOwn(palettes, palette)) throw new Error('palette must be ember, lagoon, or violet');
  let rng = seed; const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const particles = Array.from({ length: blobs }, () => { const radius = 0.085 + random() * 0.065; return { radius, x: radius + random() * (1.6 - radius * 2), y: radius + random() * (1 - radius * 2), vx: (random() < 0.5 ? -1 : 1) * (0.0008 + random() * 0.001), vy: (random() < 0.5 ? -1 : 1) * (0.0014 + random() * 0.0015) }; });
  return { seed, width, height, threshold, palette, frame: 0, particles };
}
export function step(world, count = 1) {
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error('step count must be 0–10000');
  for (let tick = 0; tick < count; tick++) {
    for (const p of world.particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < p.radius) { p.x = 2 * p.radius - p.x; p.vx = Math.abs(p.vx); }
      else if (p.x > 1.6 - p.radius) { p.x = 2 * (1.6 - p.radius) - p.x; p.vx = -Math.abs(p.vx); }
      if (p.y < p.radius) { p.y = 2 * p.radius - p.y; p.vy = Math.abs(p.vy); }
      else if (p.y > 1 - p.radius) { p.y = 2 * (1 - p.radius) - p.y; p.vy = -Math.abs(p.vy); }
    }
    world.frame++;
  }
  return world;
}
export function fieldAt(world, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('sample coordinates must be finite');
  let value = 0; for (const p of world.particles) value += p.radius * p.radius / ((x - p.x) ** 2 + (y - p.y) ** 2 + 0.001); return value;
}
export function analyze(world) {
  let filled = 0; for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (fieldAt(world, (x + 0.5) / world.width * 1.6, (y + 0.5) / world.height) >= world.threshold) filled++;
  return { seed: world.seed, width: world.width, height: world.height, frame: world.frame, blobs: world.particles.length, threshold: world.threshold, palette: world.palette, filledCells: filled, coverage: filled / (world.width * world.height), particles: world.particles.map(p => ({ ...p })) };
}
export function render(world, { color = false } = {}) {
  const ramp = ' .:-=+*#%@', rows = [], codes = world.palette === 'lagoon' ? [34, 36, 96, 97] : world.palette === 'violet' ? [34, 35, 95, 97] : [35, 31, 33, 93];
  for (let y = 0; y < world.height; y++) { let row = ''; for (let x = 0; x < world.width; x++) { const v = fieldAt(world, (x + 0.5) / world.width * 1.6, (y + 0.5) / world.height) / world.threshold, ch = v < 0.65 ? ' ' : ramp[Math.min(9, Math.max(1, Math.floor(v * 3)))]; row += color && ch !== ' ' ? `\x1b[${codes[Math.min(3, Math.floor(v))]}m${ch}\x1b[0m` : ch; } rows.push(row); }
  return rows.join('\n');
}
// Clip each triangle of a sampled grid against an isovalue. Linear edge
// interpolation yields continuous contours; subpaths share the same fill.
function contour(world, level, samples) {
  const paths = [], sx = 1.6 / samples, sy = 1 / Math.round(samples / 1.6), ny = Math.round(samples / 1.6);
  const values = Array.from({ length: ny + 1 }, (_, y) => Array.from({ length: samples + 1 }, (_, x) => ({ x: x * sx, y: y * sy, v: fieldAt(world, x * sx, y * sy) })));
  for (let y = 0; y < ny; y++) for (let x = 0; x < samples; x++) {
    const a = values[y][x], b = values[y][x + 1], c = values[y + 1][x + 1], d = values[y + 1][x];
    for (const triangle of [[a, b, c], [a, c, d]]) {
      const points = [];
      for (let edge = 0; edge < 3; edge++) {
        const p = triangle[edge], q = triangle[(edge + 1) % 3], inside = p.v >= level, nextInside = q.v >= level;
        if (inside) points.push(p);
        if (inside !== nextInside) { const t = (level - p.v) / (q.v - p.v); points.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
      }
      if (points.length > 2) paths.push('M' + points.map(p => `${(32 + p.x * 460).toFixed(2)},${(94 + p.y * 460).toFixed(2)}`).join('L') + 'Z');
    }
  }
  return paths.join('');
}
export function renderSVG(world) {
  const bands = [0.65, 1, 1.6, 2.8].map((n, i) => `<path d="${contour(world, n * world.threshold, 88)}" fill="${palettes[world.palette][i]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="620" viewBox="0 0 800 620"><rect width="800" height="620" rx="18" fill="#0d1525"/><rect x="32" y="94" width="736" height="460" rx="14" fill="#101b30"/>${bands}<g font-family="monospace"><text x="32" y="38" font-size="24" fill="#eff5ff">TERMINAL LAVA LAMP</text><text x="32" y="66" fill="#93a4bc">seed ${world.seed} / ${world.particles.length} blobs / frame ${world.frame} / ${world.palette}</text><text x="32" y="594" font-size="12" fill="#93a4bc">1 ember 2 lagoon 3 violet / [ ] density / p pause . step n seed r reset q quit</text></g></svg>\n`;
}
