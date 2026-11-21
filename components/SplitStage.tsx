import type { CSSProperties, ReactNode } from "react";
import { Statue, type StatueName } from "./Statue";

type SplitStageProps = {
  /** Heading level. The hero uses h1, every other section h2. */
  as: "h1" | "h2";
  titleId: string;
  title: string;
  titleClassName?: string;
  eyebrow?: ReactNode;
  /** Content under the title: paragraph, button. */
  children?: ReactNode;
  /** Optional card that overlaps the bottom of the colour block. */
  caption?: ReactNode;
  /** Which marble bust to show. */
  statue: StatueName;
  /**
   * "dark": white text on black, blue block.
   * "light": black text on white, black block.
   * "deep": white text on deep blue, black block.
   */
  tone: "dark" | "light" | "deep";
  /** Horizontal position of the block's left edge, as a share of the stage. */
  split?: string;
  start?: "eyes" | "mouth";
};

/**
 * Editorial composition: a flat colour block with a statue breaking out of
 * it, and a title that changes colour where it crosses the block's edge.
 * Below the lg breakpoint the block simply stacks under the copy.
 */
export function SplitStage({
  as: Heading,
  titleId,
  title,
  titleClassName = "",
  eyebrow,
  children,
  caption,
  tone,
  statue,
  split = "54%",
  start = "eyes",
}: SplitStageProps) {
  return (
    <div
      className={`split-stage split-${tone}`}
      style={{ "--split": split } as CSSProperties}
    >
      <div className="split-copy">
        {eyebrow}
        <Heading id={titleId} className={`split-title ${titleClassName}`}>
          {title}
        </Heading>
        {children && <div className="split-body">{children}</div>}
      </div>

      <div className="split-art">
        <div className="split-block" />
        <Statue
          name={statue}
          className="split-statue"
          start={start}
          priority={Heading === "h1"}
        />
      </div>

      {caption && <div className="split-caption">{caption}</div>}
    </div>
  );
}
