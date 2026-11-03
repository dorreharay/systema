import { useEffect, useState } from 'react';

/** A value that follows another once it has held still for `ms`: for what is searched while it is being typed. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
