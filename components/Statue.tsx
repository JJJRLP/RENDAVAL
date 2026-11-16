"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import heroImage from "@/public/statues/hero.webp";
import problemImage from "@/public/statues/problem.webp";
import trustImage from "@/public/statues/trust.webp";

type Spot = { left: number; top: number };

type StatueData = {
  image: StaticImageData;
  /** Bar size and resting spots, as percentages of the image box. */
  bar: { width: number; height: number };
  eyes: Spot;
  mouth: Spot;
};

const STATUES: Record<string, StatueData> = {
  hero: {
    image: heroImage,
    bar: { width: 35.7, height: 8.2 },
    eyes: { left: 11.3, top: 26.3 },
    mouth: { left: 10.5, top: 42.7 },
  },
  problem: {
    image: problemImage,
    bar: { width: 33, height: 8.2 },
    eyes: { left: -1.5, top: 27.4 },
    mouth: { left: -1.5, top: 47.7 },
  },
  trust: {
    image: trustImage,
    bar: { width: 36.2, height: 8.1 },
    eyes: { left: 18.5, top: 22.5 },
    mouth: { left: 17.7, top: 37.2 },
  },
};

export type StatueName = keyof typeof STATUES;

type StatueProps = {
  name: StatueName;
  className?: string;
  /** Where the black bar rests before scrolling. It travels to the other spot. */
  start?: "eyes" | "mouth";
  /** Load eagerly. Use for the hero only. */
  priority?: boolean;
};

/**
 * Decorative marble bust with a black bar over the eyes. The bar slides to
 * the mouth (or back) once, when the figure passes the middle of the
 * viewport. Under reduced motion the bar stays where it starts.
 */
export function Statue({ name, className = "", start = "eyes", priority = false }: StatueProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reverse = start === "mouth";
  const { image, bar, eyes, mouth } = STATUES[name];

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight;
      const center = rect.top + rect.height / 2;
      // Begin when the figure is in the lower part of the screen, or at its
      // resting position if it is already above that line on load (the hero).
      const startLine = Math.min(viewport * 0.75, center + window.scrollY);
      const raw = (startLine - center) / (viewport * 0.5);
      // Two resting spots only: the bar is on the eyes or on the mouth, and
      // CSS animates the short trip between them.
      const moved = raw > 0.5;
      node.style.setProperty("--t", moved !== reverse ? "1" : "0");
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reverse]);

  const style = {
    "--t": reverse ? 1 : 0,
    "--ar": image.width / image.height,
    "--bar-w": `${bar.width}%`,
    "--bar-h": `${bar.height}%`,
    "--eyes-x": `${eyes.left}%`,
    "--eyes-y": `${eyes.top}%`,
    "--mouth-x": `${mouth.left}%`,
    "--mouth-y": `${mouth.top}%`,
  } as CSSProperties;

  return (
    <div ref={ref} aria-hidden="true" className={`statue ${className}`} style={style}>
      <Image
        src={image}
        alt=""
        priority={priority}
        sizes="(min-width: 64rem) 520px, 70vw"
        className="statue-image"
      />
      <span className="statue-bar" />
    </div>
  );
}
