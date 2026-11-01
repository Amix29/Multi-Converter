export type StyleMap = Record<string, string | number | null | undefined>;
const unitless = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flexGrow",
  "flexShrink",
  "order",
]);
export function styleString(
  value: StyleMap | string | null | undefined,
): string | undefined {
  if (value == null || typeof value === "string") return value ?? undefined;
  return Object.entries(value)
    .filter(([, item]) => item != null)
    .map(([key, item]) => {
      const name = key.startsWith("--")
        ? key
        : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const unit =
        typeof item === "number" &&
        item !== 0 &&
        !unitless.has(key) &&
        !key.startsWith("--")
          ? "px"
          : "";
      return `${name}:${item}${unit}`;
    })
    .join(";");
}
