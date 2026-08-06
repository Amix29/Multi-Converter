export type ImageResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageResizeResult extends ImageSize {
  /** Translation of the resized frame's top-left corner, in document pixels. */
  translateX: number;
  /** Translation of the resized frame's top-left corner, in document pixels. */
  translateY: number;
}

export interface ImageResizeModifiers {
  altKey: boolean;
  shiftKey: boolean;
}

const MINIMUM_SIZE_PX = 12;
const MAXIMUM_SAFE_SIZE_PX = 200_000;
export const MINIMUM_IMAGE_Z_INDEX = -100;
export const MAXIMUM_IMAGE_Z_INDEX = 100;

export function resizeImage(
  start: ImageSize,
  handle: ImageResizeHandle,
  delta: { x: number; y: number },
  modifiers: ImageResizeModifiers,
): ImageResizeResult {
  const horizontal = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const vertical = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const centerMultiplier = modifiers.altKey ? 2 : 1;
  let width = start.width + delta.x * horizontal * centerMultiplier;
  let height = start.height + delta.y * vertical * centerMultiplier;
  const isCorner = horizontal !== 0 && vertical !== 0;
  const keepRatio = isCorner ? !modifiers.shiftKey : modifiers.shiftKey;

  if (keepRatio && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height;
    if (horizontal === 0) {
      width = height * ratio;
    } else if (vertical === 0) {
      height = width / ratio;
    } else {
      const relativeWidth = Math.abs((width - start.width) / start.width);
      const relativeHeight = Math.abs((height - start.height) / start.height);
      if (relativeWidth >= relativeHeight) height = width / ratio;
      else width = height * ratio;
    }
  }

  const safeWidth = safeDimension(width);
  const safeHeight = safeDimension(height);
  return {
    width: safeWidth,
    height: safeHeight,
    translateX: resizeTranslation(start.width, safeWidth, horizontal, modifiers.altKey),
    translateY: resizeTranslation(start.height, safeHeight, vertical, modifiers.altKey),
  };
}

/**
 * Flex alignment can already move a flow image when its width changes. Return
 * only the additional translation required to keep the dragged edge under the
 * pointer. Floating images do not receive that automatic layout compensation.
 */
export function resizeOffsetForLayout(
  start: ImageSize,
  result: ImageResizeResult,
  layoutMode: "flow" | "floating",
  align: "left" | "center" | "right",
) {
  const automaticX = layoutMode === "flow"
    ? align === "center"
      ? (start.width - result.width) / 2
      : align === "right"
        ? start.width - result.width
        : 0
    : 0;
  return {
    x: result.translateX - automaticX,
    y: result.translateY,
  };
}

export function keyboardResizeDelta(
  handle: ImageResizeHandle,
  key: string,
  step: number,
): { x: number; y: number } | null {
  const horizontal = handle.includes("e") || handle.includes("w");
  const vertical = handle.includes("n") || handle.includes("s");
  if ((key === "ArrowLeft" || key === "ArrowRight") && horizontal) {
    return { x: key === "ArrowLeft" ? -step : step, y: 0 };
  }
  if ((key === "ArrowUp" || key === "ArrowDown") && vertical) {
    return { x: 0, y: key === "ArrowUp" ? -step : step };
  }
  return null;
}

export function finiteDocumentCoordinate(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100_000, Math.max(-100_000, parsed));
}

export function safeDimension(value: number) {
  if (!Number.isFinite(value)) return MINIMUM_SIZE_PX;
  return Math.min(MAXIMUM_SAFE_SIZE_PX, Math.max(MINIMUM_SIZE_PX, value));
}

export function safeImageZIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAXIMUM_IMAGE_Z_INDEX, Math.max(MINIMUM_IMAGE_Z_INDEX, Math.round(parsed)));
}

function resizeTranslation(start: number, next: number, direction: number, fromCenter: boolean) {
  if (start === next) return 0;
  if (fromCenter || direction === 0) return (start - next) / 2;
  return direction < 0 ? start - next : 0;
}
