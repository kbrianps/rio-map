import {
  TILE_SIZE,
  lngToWorldX,
  latToWorldY,
  type Viewport,
} from './projection';

export interface TileCoord {
  x: number;
  y: number;
  z: number;
  /** Top-left position on screen (px, fractional). */
  screenX: number;
  screenY: number;
}

export interface RioBoundary {
  /** [minLat, minLng, maxLat, maxLng] — bounding box used to skip out-of-Rio tile fetches. */
  bbox: [number, number, number, number];
}

/**
 * Computes which tiles intersect the current viewport, optionally filtered by a bounding box
 * (so we never request tiles entirely outside the Rio municipality).
 */
export function visibleTiles(v: Viewport, boundary?: RioBoundary): TileCoord[] {
  const z = Math.floor(v.zoom);
  const cx = lngToWorldX(v.centerLng, z);
  const cy = latToWorldY(v.centerLat, z);
  const left = cx - v.width / 2;
  const top = cy - v.height / 2;
  const right = cx + v.width / 2;
  const bottom = cy + v.height / 2;

  const minTileX = Math.floor(left / TILE_SIZE);
  const maxTileX = Math.floor(right / TILE_SIZE);
  const minTileY = Math.floor(top / TILE_SIZE);
  const maxTileY = Math.floor(bottom / TILE_SIZE);

  let tileBox: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  if (boundary) {
    const [minLat, minLng, maxLat, maxLng] = boundary.bbox;
    const bMinX = Math.floor(lngToWorldX(minLng, z) / TILE_SIZE);
    const bMaxX = Math.floor(lngToWorldX(maxLng, z) / TILE_SIZE);
    const bMinY = Math.floor(latToWorldY(maxLat, z) / TILE_SIZE);
    const bMaxY = Math.floor(latToWorldY(minLat, z) / TILE_SIZE);
    tileBox = { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY };
  }

  const tiles: TileCoord[] = [];
  const max = Math.pow(2, z);
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    if (ty < 0 || ty >= max) continue;
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const wrappedX = ((tx % max) + max) % max;
      if (
        tileBox &&
        (tx < tileBox.minX || tx > tileBox.maxX || ty < tileBox.minY || ty > tileBox.maxY)
      ) {
        continue;
      }
      tiles.push({
        x: wrappedX,
        y: ty,
        z,
        screenX: tx * TILE_SIZE - left,
        screenY: ty * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

interface CachedTile {
  img: HTMLImageElement;
  loaded: boolean;
}

export class TileCache {
  private cache = new Map<string, CachedTile>();
  private inFlight = new Map<string, Promise<HTMLImageElement>>();
  private readonly maxEntries: number;
  private readonly urlBuilder: (z: number, x: number, y: number, retina: boolean) => string;
  private readonly retina: boolean;

  constructor(opts: {
    maxEntries: number;
    urlTemplate: string;
    subdomains: string;
    retina?: boolean;
  }) {
    this.maxEntries = opts.maxEntries;
    this.retina = opts.retina ?? (typeof devicePixelRatio === 'number' && devicePixelRatio > 1);
    const subs = opts.subdomains.split('');
    this.urlBuilder = (z, x, y, r) => {
      const s = subs[(x + y) % subs.length];
      const rPart = r ? '@2x' : '';
      return opts.urlTemplate
        .replace('{s}', s)
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
        .replace('{r}', rPart);
    };
  }

  key(z: number, x: number, y: number): string {
    return `${z}/${x}/${y}`;
  }

  get(z: number, x: number, y: number): HTMLImageElement | null {
    const k = this.key(z, x, y);
    const hit = this.cache.get(k);
    if (hit && hit.loaded) {
      this.cache.delete(k);
      this.cache.set(k, hit);
      return hit.img;
    }
    return null;
  }

  load(
    z: number,
    x: number,
    y: number,
    onReady: () => void,
    onError?: (err: unknown) => void,
  ): void {
    const k = this.key(z, x, y);
    if (this.cache.get(k)?.loaded) return;
    if (this.inFlight.has(k)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const entry: CachedTile = { img, loaded: false };
    this.cache.set(k, entry);
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        entry.loaded = true;
        this.evictIfNeeded();
        resolve(img);
        onReady();
      };
      img.onerror = (e) => {
        this.cache.delete(k);
        this.inFlight.delete(k);
        reject(e);
        onError?.(e);
      };
    });
    this.inFlight.set(k, p);
    p.finally(() => this.inFlight.delete(k));
    img.src = this.urlBuilder(z, x, y, this.retina);
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}
