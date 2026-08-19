import { useEffect, useState } from 'react';

/**
 * Debounce a value.
 *
 * Used for the two things on the booking form that hit the network as the user
 * types — serviceability lookups and the live quote — so a six-digit pincode
 * costs one request instead of six.
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
