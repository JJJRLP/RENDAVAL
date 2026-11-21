import Image from "next/image";
import logoInk from "@/public/brand/rendaval-logo.png";
import logoWhite from "@/public/brand/rendaval-logo-white.png";

type LogoProps = {
  /** "ink" for light backgrounds, "white" for ink or deep backgrounds. */
  tone?: "ink" | "white";
  /** Tailwind height class; the width follows the logo's proportions. */
  className?: string;
  /** Load eagerly. Use for the logo in the hero only. */
  priority?: boolean;
};

/** Rendaval logo: the RV monogram with its blue square, over the wordmark. */
export function Logo({ tone = "ink", className = "h-12", priority = false }: LogoProps) {
  return (
    <Image
      src={tone === "white" ? logoWhite : logoInk}
      alt="Rendaval"
      priority={priority}
      className={`w-auto ${className}`}
    />
  );
}
