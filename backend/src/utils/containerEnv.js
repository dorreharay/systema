import { readFileSync } from 'node:fs';

/**
 * A shell opened in a container from outside (`railway ssh`) does not always carry the variables of the service, while the server's own
 * process, the first one in the container, does. This fills in what is missing from there, for a script that is run by hand next to the
 * server (src/scripts/studio-interest.js). A variable that is already set is left alone, and where there is no /proc (a laptop) nothing happens.
 * Answers how many it added.
 */
export function fillMissingEnv(env = process.env, path = '/proc/1/environ') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return 0;
  }
  let added = 0;
  for (const entry of text.split('\0')) {
    const at = entry.indexOf('=');
    if (at > 0 && !(entry.slice(0, at) in env)) {
      env[entry.slice(0, at)] = entry.slice(at + 1);
      added++;
    }
  }
  return added;
}
