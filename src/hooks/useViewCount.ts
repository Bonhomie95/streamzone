
import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_BASE ?? "";
const POLL_INTERVAL = 30_000;

export function useViewCount(id: string | number, autoIncrement = true) {
  const [count, setCount] = useState<number | null>(null);
  const incremented = useRef(false);

  useEffect(() => {
    if (!id) return;
    const strId = String(id);

    async function increment() {
      try {
        const res = await fetch(`${API}/views/${strId}`, { method: "POST" });
        const data = await res.json();
        setCount(data.count);
      } catch {
        /* noop — server may not be running locally */
      }
    }

    async function poll() {
      try {
        const res = await fetch(`${API}/views/${strId}`);
        const data = await res.json();
        setCount(data.count);
      } catch {
        /* noop */
      }
    }

    // Increment once when component mounts (user started watching)
    if (autoIncrement && !incremented.current) {
      incremented.current = true;
      increment();
    } else {
      poll();
    }

    // Poll every 30s to show count updating in real-time
    const t = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [String(id)]);

  return count;
}

/** Format count: 10234 → "10.2K", 1200000 → "1.2M" */
export function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Bulk-fetch counts for a list of IDs (for home page cards) */
export async function fetchBulkViewCounts(
  ids: (string | number)[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE ?? ""}/views?ids=${ids.join(",")}`,
    );
    return await res.json();
  } catch {
    return {};
  }
}
