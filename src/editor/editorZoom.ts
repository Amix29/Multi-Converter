export const MINIMUM_EDITOR_ZOOM = 10;
export const DEFAULT_EDITOR_ZOOM = 100;
export const MAXIMUM_EDITOR_ZOOM = 500;

export function clampEditorZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_ZOOM;
  return Math.min(MAXIMUM_EDITOR_ZOOM, Math.max(MINIMUM_EDITOR_ZOOM, Math.round(value)));
}

// Give the familiar 100% view the centre of the slider, despite the asymmetric limits.
export function zoomToSlider(value: number): number {
  const zoom = clampEditorZoom(value);
  return zoom <= 100 ? (zoom - 10) / 90 * 50 : 50 + (zoom - 100) / 400 * 50;
}

export function sliderToZoom(value: number): number {
  const position = Math.min(100, Math.max(0, value));
  return clampEditorZoom(position <= 50 ? 10 + position / 50 * 90 : 100 + (position - 50) / 50 * 400);
}
