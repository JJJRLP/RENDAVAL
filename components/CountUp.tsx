"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

const DURATION_MS = 450;

type CountUpProps = {
  value: number;
  decimals?: number;
};

/**
 * Counts from 0 to `value` the first time it enters the viewport, then glides
 * from the number on screen to the new one whenever `value` changes.
 * Under reduced motion it simply renders `value`.
 */
export function CountUp({ value, decimals = 0 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  /** The number currently on screen, and whether it has been revealed yet. */
  const shown = useRef(value);
  const seen = useRef(false);
  const latest = useRef(value);
  const frame = useRef(0);
  const [animated, setAnimated] = useState<number | null>(null);

  // Layout effect: the tween takes over before the new value is painted.
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = (from: number, to: number) => {
      cancelAnimationFrame(frame.current);
      shown.current = from;
      setAnimated(from);
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / DURATION_MS, 1);
        if (progress >= 1) {
          shown.current = to;
          setAnimated(null);
          return;
        }
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out
        shown.current = from + (to - from) * eased;
        setAnimated(shown.current);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    };

    const changed = latest.current !== value;
    latest.current = value;

    if (reduced || !("IntersectionObserver" in window)) {
      shown.current = value;
      return;
    }

    if (seen.current) {
      if (changed) run(shown.current, value);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        seen.current = true;
        run(0, latest.current);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return <span ref={ref}>{formatNumber(animated ?? value, decimals)}</span>;
}
