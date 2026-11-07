import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [outputArg, version] = process.argv.slice(2);
if (!outputArg || !/^[a-f0-9]{40}$/i.test(version || '')) {
  throw new Error('Usage: node scripts/prepare-pages.mjs OUTPUT_DIR COMMIT_SHA');
}
const output = resolve(outputArg);
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Output directory must be empty');

for (const item of ['index.html', '.nojekyll', 'src', 'assets']) {
  await cp(item, join(output, item), { recursive: true });
}

// Give all module URLs the same release identity, including shared imports.
const moduleReference = /(\b(?:from\s*|import\s*(?:\(\s*)?))(['"])(\.\.?\/[^'"\n]+?\.js)(?:\?[^'"\n]*)?\2/g;
async function versionModules(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await versionModules(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = await readFile(file, 'utf8');
      const result = source.replace(moduleReference, (_, prefix, quote, path) => `${prefix}${quote}${path}?v=${version}${quote}`);
      await writeFile(file, result);
    }
  }
}
await versionModules(join(output, 'src'));
const htmlFile = join(output, 'index.html');
const html = await readFile(htmlFile, 'utf8');
const assetReference = /((?:href|src)\s*=\s*['"])(\.\.?\/[^'"\n]+?\.(?:js|css))(?:\?[^'"\n]*)?(['"])/g;
await writeFile(htmlFile, html.replace(assetReference, (_, prefix, path, quote) => `${prefix}${path}?v=${version}${quote}`));
