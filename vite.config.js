import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Genera un precache verificable desde los archivos reales de la compilación.
function offlineBundle() {
  let outDir;
  return {
    name: 'offline-bundle',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      async function walk(directory, prefix = '') {
        const entries = await readdir(directory, { withFileTypes: true });
        const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(resolve(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
        return nested.flat();
      }
      const files = (await walk(outDir)).filter((file) => file !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const file of files) { hash.update(file); hash.update(await readFile(resolve(outDir, file))); }
      const version = hash.digest('hex').slice(0, 16);
      const template = await readFile(resolve('scripts/service-worker.js'), 'utf8');
      await writeFile(resolve(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlineBundle()],
  build: { rollupOptions: { input: { control: resolve('index.html'), display: resolve('display.html') } } },
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node' },
});
