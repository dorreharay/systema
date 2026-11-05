// Lets plain Node load the TypeScript of the app: it strips the types by itself (Node 24), and this teaches it the two things
// the app's imports rely on that Node does not know: a path with no extension, and `@/` for `src/`. Used by the tests of the
// offline layer (`node scripts/test-offline.mjs`), which load that layer without React Native.
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isFile = (file) => existsSync(file) && statSync(file).isFile();

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target;
    if (specifier.startsWith('@/')) {
      target = path.join(root, 'src', specifier.slice(2));
    } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (target && !isFile(target)) {
      const found = [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts'), path.join(target, 'index.tsx')].find(isFile);
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }
    return nextResolve(specifier, context);
  },
});
