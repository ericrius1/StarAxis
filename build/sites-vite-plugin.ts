import { access, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Packages the static Vite build as a Cloudflare Worker for Sites. */
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: 'sites',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const dist = resolve(root, 'dist');
      const metadataDir = resolve(dist, '.openai');
      const serverDir = resolve(dist, 'server');
      const hostingConfig = resolve(root, '.openai', 'hosting.json');
      const workerEntry = resolve(root, 'worker', 'index.js');

      await rm(metadataDir, { recursive: true, force: true });
      await mkdir(metadataDir, { recursive: true });
      await mkdir(serverDir, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(metadataDir, 'hosting.json'));
      }
      await cp(workerEntry, resolve(serverDir, 'index.js'));
    },
  };
}
