import { useEffect, useState } from 'react';

/** The time now (in milliseconds), read again every `everyMs`: for what depends on how long ago something was. */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
