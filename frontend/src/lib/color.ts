/**
 * Pick a readable foreground (black or white) for content placed on top of a
 * solid background colour, using the WCAG relative-luminance heuristic. This
 * keeps the white-label brand mark legible even when the admin chooses a light
 * brand colour (a white icon on a pale background would otherwise vanish).
 *
 * Accepts `#rgb` / `#rrggbb`; falls back to white for anything unparseable.
 */
export function readableTextColor(background: string): "#000000" | "#ffffff" {
  const hex = (background || "").trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return "#ffffff";

  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * linearize(channel(0)) +
    0.7152 * linearize(channel(2)) +
    0.0722 * linearize(channel(4));

  return luminance > 0.5 ? "#000000" : "#ffffff";
}
