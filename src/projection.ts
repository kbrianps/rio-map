export const TILE_SIZE = 256;

export function lngToWorldX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z) * TILE_SIZE;
}

export function latToWorldY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) /
    2 *
    Math.pow(2, z) *
    TILE_SIZE
  );
}

export function worldXToLng(x: number, z: number): number {
  return (x / (TILE_SIZE * Math.pow(2, z))) * 360 - 180;
}

export function worldYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface Viewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
}

export function latLngToScreen(
  lat: number,
  lng: number,
  v: Viewport,
): { x: number; y: number } {
  const cx = lngToWorldX(v.centerLng, v.zoom);
  const cy = latToWorldY(v.centerLat, v.zoom);
  const px = lngToWorldX(lng, v.zoom);
  const py = latToWorldY(lat, v.zoom);
  return { x: px - cx + v.width / 2, y: py - cy + v.height / 2 };
}

export function screenToLatLng(
  x: number,
  y: number,
  v: Viewport,
): { lat: number; lng: number } {
  const cx = lngToWorldX(v.centerLng, v.zoom);
  const cy = latToWorldY(v.centerLat, v.zoom);
  const wx = x - v.width / 2 + cx;
  const wy = y - v.height / 2 + cy;
  return { lat: worldYToLat(wy, v.zoom), lng: worldXToLng(wx, v.zoom) };
}
