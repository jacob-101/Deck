/** Convert PDF gray/RGB/CMYK colors for UI display; never rewrites the source. */
export function annotationHex(color: number[]): string {
  const rgb =
    color.length === 1
      ? [color[0], color[0], color[0]]
      : color.length === 4
        ? color.slice(0, 3).map((value) => 1 - Math.min(1, value + color[3]))
        : color.length === 3
          ? color
          : [0.2, 0.2, 0.2];
  return (
    "#" +
    rgb
      .map((value) =>
        Math.round(
          Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 255,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const annotationName = (type: string) =>
  ({
    Text: "Sticky note",
    FreeText: "Text box",
    Square: "Rectangle",
    Circle: "Ellipse",
    Line: "Arrow / line",
    Ink: "Drawing",
    StrikeOut: "Strike through",
  })[type] ?? type;
