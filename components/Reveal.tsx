"use client";

import { useEffect, useRef, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** "self" fades the wrapper in. "group" reveals its .reveal-step children in sequence. */
  variant?: "self" | "group";
};

/**
 * Adds "is-visible" once, the first time the element enters the viewport.
 * The hidden state lives in CSS under prefers-reduced-motion: no-preference,
 * so reduced-motion users always see the content immediately.
 */
export function Reveal({ children, className = "", variant = "self" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const base = variant === "group" ? "reveal-group" : "reveal";

  return (
    <div ref={ref} className={`${base} ${className}`}>
      {children}
    </div>
  );
}
