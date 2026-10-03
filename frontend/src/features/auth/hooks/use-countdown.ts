import { useCallback, useEffect, useState } from 'react';

/** Seconds remaining until a resend is allowed; restart() begins a new window */
export function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const restart = useCallback((seconds = initialSeconds) => setRemaining(seconds), [initialSeconds]);

  return { remaining, isRunning: remaining > 0, restart };
}
