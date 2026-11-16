import type { ReactNode } from "react";

type EyebrowProps = {
  /** Section number, as shown: "01", "02"… */
  index: string;
  children: ReactNode;
  /** "dark" for sections with a dark background. */
  tone?: "light" | "dark";
};

/** Section marker above each title: number, short rule, label. */
export function Eyebrow({ index, children, tone = "light" }: EyebrowProps) {
  return (
    <p className={`eyebrow ${tone === "dark" ? "eyebrow-dark" : ""}`}>
      <span className="eyebrow-index" aria-hidden="true">
        {index}
      </span>
      <span className="eyebrow-rule" aria-hidden="true" />
      {children}
    </p>
  );
}
