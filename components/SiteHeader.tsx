"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Slim header with the call to action. Hidden while the hero is on screen
 * (the hero has its own), then slides in for the rest of the page.
 */
export function SiteHeader() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      setShown(!entry.isIntersecting);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <header className={`site-header ${shown ? "is-shown" : ""}`} inert={!shown}>
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-3 md:px-10">
        <a href="#hero" aria-label="Rendaval, inicio" className="flex min-h-11 items-center">
          <Logo className="h-9" />
        </a>
        <a href="/app" className="btn-primary min-h-10 px-4 py-2 text-sm">
          Ingresar a Rendaval
        </a>
      </div>
    </header>
  );
}
