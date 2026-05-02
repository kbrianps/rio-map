import { latLngToScreen, type Viewport } from './projection';
import type { TileCache } from './tiles';
import { visibleTiles, type RioBoundary } from './tiles';

export interface RenderLayers {
  /** Polygon rings of the Rio municipality (outer rings as [lat, lng] arrays). */
  riomask?: number[][][] | null;
  /** Route layers — one per logical line, each with its own color. */
  routes?: { shapes: number[][][]; color?: string; dashed?: boolean }[] | null;
  /** Animated bus markers (interpolated current positions). */
  buses?: {
    lat: number;
    lng: number;
    heading: number | null;
    stale: boolean;
    id: string;
    color?: string;
    pending?: boolean;
  }[];
  /** User location pin. */
  user?: { lat: number; lng: number } | null;
}

export interface BaselineImage {
  img: HTMLImageElement;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  viewport: Viewport;
  dpr: number;
  tileCache: TileCache;
  layers: RenderLayers;
  boundary?: RioBoundary;
  baseline?: BaselineImage | null;
  routeColor?: string;
  busColorFresh?: string;
  busColorStale?: string;
  userColor?: string;
  maskColor?: string;
}

export function render(opts: RenderOptions): void {
  const { ctx, viewport: v, dpr, tileCache, layers, boundary, baseline } = opts;
  const w = v.width;
  const h = v.height;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  drawBaseline(ctx, v, baseline);
  drawTiles(ctx, v, tileCache, boundary);
  drawMask(ctx, v, layers.riomask, opts.maskColor ?? '#f8fafc');
  drawRoutes(ctx, v, layers.routes, opts.routeColor ?? '#8b5cf6');
  drawBuses(
    ctx,
    v,
    layers.buses,
    opts.busColorFresh ?? '#0ea5e9',
    opts.busColorStale ?? '#94a3b8',
  );
  drawUser(ctx, v, layers.user, opts.userColor ?? '#dc2626');

  ctx.restore();
}

function drawBaseline(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  baseline: BaselineImage | null | undefined,
): void {
  if (!baseline || !baseline.img.complete || baseline.img.naturalWidth === 0) return;
  const tl = latLngToScreen(baseline.bounds.maxLat, baseline.bounds.minLng, v);
  const br = latLngToScreen(baseline.bounds.minLat, baseline.bounds.maxLng, v);
  const w = br.x - tl.x;
  const h = br.y - tl.y;
  if (w <= 0 || h <= 0) return;
  if (br.x < 0 || tl.x > v.width || br.y < 0 || tl.y > v.height) return;
  ctx.drawImage(baseline.img, tl.x, tl.y, w, h);
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  cache: TileCache,
  boundary?: RioBoundary,
): void {
  const tiles = visibleTiles(v, boundary);
  for (const t of tiles) {
    const img = cache.get(t.z, t.x, t.y);
    if (!img) continue;
    ctx.drawImage(img, t.screenX, t.screenY, t.size, t.size);
  }
}

function drawMask(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  rings: number[][][] | null | undefined,
  fill: string,
): void {
  if (!rings || rings.length === 0) return;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.rect(0, 0, v.width, v.height);
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = latLngToScreen(ring[i][0], ring[i][1], v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  ctx.fill('evenodd');
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 1.5;
  for (const ring of rings) {
    ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const p = latLngToScreen(ring[i][0], ring[i][1], v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoutes(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  routes:
    | { shapes: number[][][]; color?: string; dashed?: boolean }[]
    | null
    | undefined,
  defaultColor: string,
): void {
  if (!routes || routes.length === 0) return;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.6;
  for (const route of routes) {
    ctx.strokeStyle = route.color ?? defaultColor;
    if (route.dashed) ctx.setLineDash([10, 8]);
    else ctx.setLineDash([]);
    for (const shape of route.shapes) {
      if (shape.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < shape.length; i++) {
        const p = latLngToScreen(shape[i][0], shape[i][1], v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBuses(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  buses: RenderLayers['buses'],
  freshColor: string,
  staleColor: string,
): void {
  if (!buses || buses.length === 0) return;
  for (const b of buses) {
    const p = latLngToScreen(b.lat, b.lng, v);
    if (p.x < -30 || p.x > v.width + 30 || p.y < -30 || p.y > v.height + 30) continue;
    const color = b.stale ? staleColor : (b.color ?? freshColor);
    if (b.pending) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      drawTeardropPin(ctx, p.x, p.y, color, b.heading);
      ctx.restore();
    } else {
      drawTeardropPin(ctx, p.x, p.y, color, b.heading);
    }
  }
}

function drawUser(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  user: RenderLayers['user'],
  color: string,
): void {
  if (!user) return;
  const p = latLngToScreen(user.lat, user.lng, v);
  if (p.x < -30 || p.x > v.width + 30 || p.y < -30 || p.y > v.height + 30) return;
  drawTeardropPin(ctx, p.x, p.y, color, null, 1.25);
}

function drawTeardropPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  headingDeg: number | null,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (headingDeg !== null) {
    ctx.rotate((headingDeg * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-6, 10, -11, 5.5, -11, 0);
    ctx.bezierCurveTo(-11, -6, 0, -22, 0, -22);
    ctx.bezierCurveTo(0, -22, 11, -6, 11, 0);
    ctx.bezierCurveTo(11, 5.5, 6, 10, 0, 10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.bezierCurveTo(-6, -32, -11, -27.5, -11, -22);
    ctx.bezierCurveTo(-11, -16, 0, 0, 0, 0);
    ctx.bezierCurveTo(0, 0, 11, -16, 11, -22);
    ctx.bezierCurveTo(11, -27.5, 6, -32, 0, -32);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -22, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.restore();
}
