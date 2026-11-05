// Loads a script that belongs to someone else (the sign-in libraries of Google and Apple) into the page, once, and only when it is
// wanted: the web build does not carry them around. Only the files of the web build use this; a phone has no page to load
// a script into.
const loading = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const known = loading.get(src);
  if (known) {
    return known;
  }

  const loaded = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('There is no page to load a script into'));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(script);
  });

  // A failure is not remembered: the next press asks again (the connection may have been down, or an ad blocker turned off).
  loaded.catch(() => loading.delete(src));
  loading.set(src, loaded);
  return loaded;
}
