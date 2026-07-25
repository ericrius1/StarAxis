#!/usr/bin/env node
/**
 * Offline path-traced frame capture for the shot defined in src/cinema.ts.
 *
 * Drives a headless Chrome over the DevTools protocol (Node's built-in
 * WebSocket — no client library), stepping one video frame at a time. The page
 * renders each frame synchronously on demand, so the result does not depend on
 * how fast the machine is; a frame simply takes as long as its sample budget.
 *
 *   node build/capture-shot.mjs --url http://localhost:5183 --out out/frames \
 *        --samples 160 --bounces 4 --width 1920 --height 1080 [--frames N]
 *
 * Pass --still N to render a single frame (useful for reviewing lighting
 * changes without paying for the whole shot).
 *
 * Pass --plates 1 to render the still plates in src/plates.ts instead of the
 * shot. Each plate carries its own sample budget, so --samples is ignored
 * there; --plate N renders just one.
 *
 * Pass --clip N to render every frame of time-lapse clip N from
 * src/timelapse.ts. Sample budget comes from the clip.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:5183',
    out: 'out/frames',
    samples: 160,
    bounces: 4,
    width: 1920,
    height: 1080,
    frames: 0,
    still: -1,
    plates: 0,
    plate: -1,
    clip: -1,
    port: 9333,
  };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (!(key in args)) throw new Error(`unknown option --${key}`);
    args[key] = typeof args[key] === 'number' ? Number(value) : value;
  }
  return args;
}

/** Minimal CDP client: one websocket, promise per command id. */
class Devtools {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static async attach(port) {
    // Chrome needs a moment before /json/list answers.
    let targets = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        targets = await response.json();
        if (targets.some((t) => t.type === 'page')) break;
      } catch {
        /* not up yet */
      }
      await delay(200);
    }
    const page = targets?.find((t) => t.type === 'page');
    if (!page) throw new Error('no debuggable page target appeared');

    const client = new Devtools();
    await client.#connect(page.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    return client;
  }

  #connect(url) {
    return new Promise((resolve, reject) => {
      this.#socket = new WebSocket(url);
      this.#socket.addEventListener('open', () => resolve());
      this.#socket.addEventListener('error', (event) =>
        reject(new Error(`devtools socket error: ${event.message ?? 'unknown'}`)),
      );
      this.#socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id === undefined) return;
        const entry = this.#pending.get(message.id);
        if (!entry) return;
        this.#pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      });
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an async expression and return its resolved JSON value. */
  async evaluate(expression, timeoutMs = 600000) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(
        detail.exception?.description ?? detail.text ?? 'page evaluation failed',
      );
    }
    return result.result.value;
  }

  close() {
    this.#socket?.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.out);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const profile = path.join(outDir, '.chrome-profile');
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${args.port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${args.width},${args.height}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,WebGPUExperimentalFeatures',
      '--disable-frame-rate-limit',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const chromeErrors = [];
  chrome.stderr.on('data', (chunk) => chromeErrors.push(String(chunk)));

  let client;
  try {
    client = await Devtools.attach(args.port);
    // Pin the layout viewport before the app boots: the window size Chrome was
    // launched with includes browser chrome, so the canvas would come out a
    // few dozen pixels short of the requested frame height.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.navigate', { url: `${args.url}/?cinema=1` });

    // Wait for the module graph, the WebGPU device and the scene build.
    const booted = await client.evaluate(`(async () => {
      for (let i = 0; i < 400; i++) {
        if (window.__cinema && window.__runtime) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    })()`);
    if (!booted) {
      throw new Error(
        `page never exposed __cinema (chrome said: ${chromeErrors.join('').slice(-500)})`,
      );
    }

    const ready = await client.evaluate(
      `window.__cinema.begin({ samples: ${args.samples}, bounces: ${args.bounces} })`,
    );
    if (!ready) throw new Error('path tracer failed to initialise in the page');

    const clipMode = args.clip >= 0;
    const plateMode = !clipMode && (args.plates === 1 || args.plate >= 0);
    let indices;
    if (clipMode) {
      const info = JSON.parse(
        await client.evaluate(`JSON.stringify(window.__cinema.clipInfo(${args.clip}))`),
      );
      console.log(`clip ${info.id} — ${info.title}`);
      console.log(
        `  ${info.frames} frames at ${info.fps} fps, ${info.samples} spp, ` +
          `solar ${info.solar[0]} to ${info.solar[1]}`,
      );
      indices = [...Array(info.frames).keys()];
    } else if (plateMode) {
      const count = await client.evaluate('window.__cinema.plateCount');
      indices = args.plate >= 0 ? [args.plate] : [...Array(count).keys()];
    } else {
      const total = args.frames > 0
        ? args.frames
        : await client.evaluate('window.__cinema.frames');
      indices = args.still >= 0 ? [args.still] : [...Array(total).keys()];
    }

    console.log(
      `capturing ${indices.length} ${plateMode ? 'plate' : 'frame'}(s) at ` +
        `${args.width}x${args.height}` +
        (plateMode ? ' (per-plate sample budgets)' : `, ${args.samples} spp, ${args.bounces} bounces`),
    );

    const started = Date.now();
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      const frameStart = Date.now();
      const dataUrl = await client.evaluate(
        clipMode
          ? `window.__cinema.clip(${args.clip}, ${index})`
          : plateMode
            ? `window.__cinema.plate(${index})`
            : `window.__cinema.frame(${index})`,
      );
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      let name = `frame_${String(index).padStart(4, '0')}.png`;
      if (plateMode) {
        const info = JSON.parse(
          await client.evaluate(`JSON.stringify(window.__cinema.plateInfo(${index}))`),
        );
        name = `${info.id}.png`;
        console.log(
          `\n  ${info.id} — ${info.title}  (${info.samples} spp, ` +
            `sun ${info.sunElevation}°, moon ${info.moonIntensity})`,
        );
      }
      await writeFile(path.join(outDir, name), Buffer.from(base64, 'base64'));

      const elapsed = (Date.now() - started) / 1000;
      const each = (Date.now() - frameStart) / 1000;
      const remaining = ((indices.length - i - 1) * elapsed) / (i + 1);
      process.stdout.write(
        `\r  ${i + 1}/${indices.length}  ${each.toFixed(2)}s each  ` +
          `elapsed ${elapsed.toFixed(0)}s  eta ${remaining.toFixed(0)}s   `,
      );
    }
    process.stdout.write('\n');

    if (!plateMode && !clipMode) {
      const state = await client.evaluate(
        `JSON.stringify(window.__cinema.state(${indices[indices.length - 1]}))`,
      );
      console.log(`last frame state: ${state}`);
    }
    console.log(`written to ${outDir}`);
  } finally {
    client?.close();
    chrome.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(`capture failed: ${error.message}`);
  process.exit(1);
});
