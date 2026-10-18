#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createWorld, step, analyze, render, renderSVG } from './index.js';
import { parse, integer, decimal, terminal } from './terminal.js';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: terminal-lava-lamp [--seed N] [--blobs N] [--threshold N] [--palette ember|lagoon|violet] [--width N] [--height N] [--steps N] [--frames N] [--json] [--svg FILE] [--no-color]\nControls: p pause, . step, 1/2/3 palettes, [/] density, n seed, r reset, +/- speed, q quit'); process.exit(0); }
try {
  const options = parse(args, ['--seed', '--blobs', '--threshold', '--palette', '--width', '--height', '--steps', '--frames', '--svg']);
  const live = !!(process.stdout.isTTY && process.stdin.isTTY && !options['--json'] && !options['--svg']);
  const width = integer(options, '--width', live ? Math.max(24, Math.min(100, (process.stdout.columns || 80) - 1)) : 80, 120);
  const height = integer(options, '--height', live ? Math.max(12, Math.min(40, (process.stdout.rows || 32) - 4)) : 32, 60);
  const blobs = integer(options, '--blobs', 7, 16), threshold = decimal(options, '--threshold', 1.2), palette = options['--palette'] || 'ember';
  let seed = integer(options, '--seed', 42, 0xffffffff), paused = false, delay = 50;
  const make = () => createWorld({ seed, width, height, blobs, threshold, palette }); let world = make();
  const frames = integer(options, '--frames', live ? Infinity : 1, 100000);
  if ((options['--json'] || options['--svg']) && options['--frames'] !== undefined) throw new Error('--frames is only for terminal output');
  step(world, integer(options, '--steps', live ? 0 : 180, 10000));
  if (options['--json'] || options['--svg']) {
    if (options['--svg']) await writeFile(options['--svg'], renderSVG(world));
    if (options['--json']) console.log(JSON.stringify(analyze(world), null, 2));
  } else await terminal({ live, frames, interval: () => delay,
    onKey: key => {
      if (key === 'p' || key === ' ') paused = !paused;
      else if (key === '.') { paused = true; step(world); }
      else if (key === 'n') { seed = (seed + 1) >>> 0; world = make(); }
      else if (key === 'r') world = make();
      else if (['1', '2', '3'].includes(key)) world.palette = ['ember', 'lagoon', 'violet'][Number(key) - 1];
      else if (key === '[' || key === ']') world.threshold = Number(Math.max(0.6, Math.min(2.2, world.threshold + (key === '[' ? -0.1 : 0.1))).toFixed(2));
      else if (key === '+' || key === '=') delay = Math.max(10, Math.floor(delay / 2));
      else if (key === '-') delay = Math.min(1000, delay * 2);
    }, onTick: () => { if (paused) return false; step(world); return true; },
    draw: () => `LAVA LAMP | seed ${seed} | frame ${world.frame} | ${world.palette} | threshold ${world.threshold.toFixed(2)}${paused ? ' PAUSED' : ''}\n${render(world, { color: live && !options['--no-color'] && !process.env.NO_COLOR })}\n1/2/3 palette [/] density p pause . step n seed r reset q quit`
  });
} catch (error) { console.error(`terminal-lava-lamp: ${error.message}`); process.exitCode = 2; }
