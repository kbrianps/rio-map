import rioBoundary from './rio-boundary.json';
import { type Viewport, screenToLatLng, latLngToScreen } from './projection';
import { TileCache, visibleTiles, type RioBoundary } from './tiles';
import { render, type RenderLayers, type BaselineImage } from './renderer';
import { attachInteractions } from './interactions';
import { BASELINE_DATA_URI, BASELINE_BOUNDS } from './baseline';
import type { Bus, MapHandle, RioMapOpts } from './types';

export type { Bus, MapHandle, RioMapOpts, LatLng } from './types';

const RIO_CENTER: [number, number] = [-22.9083, -43.1964];
const RIO_BOUNDS = { minLat: -23.085, minLng: -43.81, maxLat: -22.74, maxLng: -43.09 };
const DEFAULT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.webp';

function loadBaseline(onReady: () => void): BaselineImage {
  const img = new Image();
  img.onload = onReady;
  img.src = BASELINE_DATA_URI;
  return { img, bounds: BASELINE_BOUNDS };
}
const DEFAULT_SUBDOMAINS = 'abcd';
const ANIM_DURATION_MS = 800;

function buildBoundaryRings(): { rings: number[][][]; bbox: RioBoundary['bbox'] } {
  const rings: number[][][] = [];
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const polygon of (rioBoundary as { coordinates: number[][][][] }).coordinates) {
    for (const ring of polygon) {
      const conv = ring.map(([lng, lat]) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        return [lat, lng] as [number, number];
      });
      rings.push(conv);
    }
  }
  return { rings, bbox: [minLat, minLng, maxLat, maxLng] };
}

interface AnimatedBus {
  current: { lat: number; lng: number };
  target: { lat: number; lng: number };
  startedAt: number;
  startFrom: { lat: number; lng: number };
  heading: number | null;
  stale: boolean;
  color?: string;
}

export function initMap(opts: RioMapOpts): MapHandle {
  const containerEl = typeof opts.container === 'string'
    ? document.getElementById(opts.container)
    : opts.container;
  if (!containerEl) throw new Error('rio-map: container not found');
  const container: HTMLElement = containerEl;

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.style.touchAction = 'none';
  container.style.overflow = 'hidden';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) throw new Error('rio-map: 2D canvas not supported');
  const ctx: CanvasRenderingContext2D = rawCtx;

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const minZoom = opts.minZoom ?? 11;
  const maxZoom = opts.maxZoom ?? 15;
  const viewport: Viewport = {
    centerLat: opts.initialCenter?.[0] ?? RIO_CENTER[0],
    centerLng: opts.initialCenter?.[1] ?? RIO_CENTER[1],
    zoom: opts.initialZoom ?? 11,
    width: 0,
    height: 0,
  };

  const { rings: maskRings, bbox } = buildBoundaryRings();
  const boundary: RioBoundary = { bbox };

  const tileCache = new TileCache({
    maxEntries: 200,
    urlTemplate: opts.tileUrlTemplate ?? DEFAULT_TILE_URL,
    subdomains: opts.tileSubdomains ?? DEFAULT_SUBDOMAINS,
  });

  let routeLayers: { shapes: number[][][]; color?: string }[] | null = null;
  let userPos: { lat: number; lng: number } | null = null;
  const busAnims = new Map<string, AnimatedBus>();

  function syncSize() {
    const rect = container.getBoundingClientRect();
    viewport.width = Math.max(1, rect.width);
    viewport.height = Math.max(1, rect.height);
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
  }
  syncSize();

  let needsRender = true;
  function requestRender() {
    needsRender = true;
  }

  const baseline = loadBaseline(requestRender);

  let zoomAnimRaf: number | null = null;
  function animateZoomTo(target: number, anchorX?: number, anchorY?: number) {
    if (target === viewport.zoom) return;
    if (zoomAnimRaf !== null) cancelAnimationFrame(zoomAnimRaf);
    const start = viewport.zoom;
    const startLat = viewport.centerLat;
    const startLng = viewport.centerLng;
    let endLat = startLat;
    let endLng = startLng;
    if (anchorX !== undefined && anchorY !== undefined) {
      const before = screenToLatLng(anchorX, anchorY, viewport);
      const tmpZoom = viewport.zoom;
      viewport.zoom = target;
      const after = screenToLatLng(anchorX, anchorY, viewport);
      viewport.zoom = tmpZoom;
      endLat = startLat + (before.lat - after.lat);
      endLng = startLng + (before.lng - after.lng);
    }
    const startedAt = performance.now();
    const dur = 220;
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      viewport.zoom = start + (target - start) * eased;
      viewport.centerLat = startLat + (endLat - startLat) * eased;
      viewport.centerLng = startLng + (endLng - startLng) * eased;
      requestRender();
      if (t < 1) {
        zoomAnimRaf = requestAnimationFrame(step);
      } else {
        zoomAnimRaf = null;
        viewport.zoom = target;
        viewport.centerLat = endLat;
        viewport.centerLng = endLng;
        loadVisibleTiles();
        requestRender();
      }
    };
    loadVisibleTiles();
    zoomAnimRaf = requestAnimationFrame(step);
  }

  function loadVisibleTiles() {
    for (const t of visibleTiles(viewport, boundary)) {
      if (!tileCache.get(t.z, t.x, t.y)) {
        tileCache.load(t.z, t.x, t.y, requestRender);
      }
    }
  }

  function animateBuses(now: number) {
    let stillAnimating = false;
    for (const a of busAnims.values()) {
      const t = Math.min(1, (now - a.startedAt) / ANIM_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      a.current.lat = a.startFrom.lat + (a.target.lat - a.startFrom.lat) * eased;
      a.current.lng = a.startFrom.lng + (a.target.lng - a.startFrom.lng) * eased;
      if (t < 1) stillAnimating = true;
    }
    return stillAnimating;
  }

  function frame() {
    const now = performance.now();
    const animating = animateBuses(now);
    if (needsRender || animating) {
      const layers: RenderLayers = {
        riomask: opts.showRioMask === false ? null : maskRings,
        routes: routeLayers,
        buses: Array.from(busAnims.entries()).map(([id, a]) => ({
          id,
          lat: a.current.lat,
          lng: a.current.lng,
          heading: a.heading,
          stale: a.stale,
          color: a.color,
        })),
        user: userPos,
      };
      render({
        ctx,
        viewport,
        dpr,
        tileCache,
        layers,
        boundary,
        baseline,
        routeColor: opts.routeColor,
        busColorFresh: opts.busColorFresh,
        busColorStale: opts.busColorStale,
        userColor: opts.userColor,
      });
      needsRender = false;
    }
    rafId = requestAnimationFrame(frame);
  }
  let rafId = requestAnimationFrame(frame);

  loadVisibleTiles();

  attachInteractions({
    el: container,
    state: { viewport },
    bounds: RIO_BOUNDS,
    minZoom,
    maxZoom,
    onChange: () => {
      loadVisibleTiles();
      requestRender();
    },
    requestZoom: animateZoomTo,
  });

  const ro = new ResizeObserver(() => {
    syncSize();
    loadVisibleTiles();
    requestRender();
  });
  ro.observe(container);

  const clickCbs: Array<(lat: number, lng: number) => void> = [];
  const busClickCbs: Array<(bus: Bus) => void> = [];
  const BUS_CLICK_RADIUS_PX = 22;
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (busClickCbs.length > 0) {
      let closest: { id: string; dist: number; a: AnimatedBus } | null = null;
      for (const [id, a] of busAnims) {
        const p = latLngToScreen(a.current.lat, a.current.lng, viewport);
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist <= BUS_CLICK_RADIUS_PX && (!closest || dist < closest.dist)) {
          closest = { id, dist, a };
        }
      }
      if (closest) {
        const a = closest.a;
        const bus: Bus = {
          id: closest.id,
          lat: a.current.lat,
          lng: a.current.lng,
          heading: a.heading,
          stale: a.stale,
          color: a.color,
        };
        for (const cb of busClickCbs) cb(bus);
        return;
      }
    }
    const { lat, lng } = screenToLatLng(x, y, viewport);
    for (const cb of clickCbs) cb(lat, lng);
  });

  const handle: MapHandle = {
    setUser(lat, lng) {
      userPos = { lat, lng };
      requestRender();
    },
    setBuses(buses: Bus[]) {
      const seen = new Set<string>();
      const now = performance.now();
      for (const b of buses) {
        seen.add(b.id);
        const existing = busAnims.get(b.id);
        if (!existing) {
          busAnims.set(b.id, {
            current: { lat: b.lat, lng: b.lng },
            target: { lat: b.lat, lng: b.lng },
            startedAt: now,
            startFrom: { lat: b.lat, lng: b.lng },
            heading: b.heading,
            stale: b.stale,
            color: b.color,
          });
        } else {
          existing.startFrom = { lat: existing.current.lat, lng: existing.current.lng };
          existing.target = { lat: b.lat, lng: b.lng };
          existing.startedAt = now;
          existing.heading = b.heading;
          existing.stale = b.stale;
          existing.color = b.color;
        }
      }
      for (const id of busAnims.keys()) if (!seen.has(id)) busAnims.delete(id);
      requestRender();
    },
    clearBuses() {
      busAnims.clear();
      requestRender();
    },
    setRoutes(routes) {
      routeLayers = routes;
      requestRender();
    },
    recenter() {
      if (userPos) {
        viewport.centerLat = userPos.lat;
        viewport.centerLng = userPos.lng;
        viewport.zoom = Math.max(viewport.zoom, 14);
      } else {
        viewport.centerLat = RIO_CENTER[0];
        viewport.centerLng = RIO_CENTER[1];
        viewport.zoom = 11;
      }
      loadVisibleTiles();
      requestRender();
    },
    fitToBuses(buses) {
      if (!buses.length) return;
      let minLat = Infinity;
      let minLng = Infinity;
      let maxLat = -Infinity;
      let maxLng = -Infinity;
      for (const b of buses) {
        if (b.lat < minLat) minLat = b.lat;
        if (b.lat > maxLat) maxLat = b.lat;
        if (b.lng < minLng) minLng = b.lng;
        if (b.lng > maxLng) maxLng = b.lng;
      }
      if (userPos) {
        if (userPos.lat < minLat) minLat = userPos.lat;
        if (userPos.lat > maxLat) maxLat = userPos.lat;
        if (userPos.lng < minLng) minLng = userPos.lng;
        if (userPos.lng > maxLng) maxLng = userPos.lng;
      }
      minLat = Math.max(minLat, RIO_BOUNDS.minLat);
      maxLat = Math.min(maxLat, RIO_BOUNDS.maxLat);
      minLng = Math.max(minLng, RIO_BOUNDS.minLng);
      maxLng = Math.min(maxLng, RIO_BOUNDS.maxLng);
      viewport.centerLat = (minLat + maxLat) / 2;
      viewport.centerLng = (minLng + maxLng) / 2;
      const latSpan = Math.max(0.0001, maxLat - minLat);
      const lngSpan = Math.max(0.0001, maxLng - minLng);
      const span = Math.max(latSpan, lngSpan);
      const targetZoom = Math.max(minZoom, Math.min(15, Math.floor(Math.log2(360 / span)) - 1));
      viewport.zoom = targetZoom;
      loadVisibleTiles();
      requestRender();
    },
    flyTo(lat, lng, zoom) {
      viewport.centerLat = lat;
      viewport.centerLng = lng;
      if (zoom !== undefined) viewport.zoom = Math.max(minZoom, Math.min(maxZoom, zoom));
      loadVisibleTiles();
      requestRender();
    },
    zoomIn() {
      animateZoomTo(Math.min(maxZoom, Math.round(viewport.zoom) + 1));
    },
    zoomOut() {
      animateZoomTo(Math.max(minZoom, Math.round(viewport.zoom) - 1));
    },
    getCenter() {
      return { lat: viewport.centerLat, lng: viewport.centerLng, zoom: viewport.zoom };
    },
    isInView(lat, lng, paddingPx = 0) {
      const p = latLngToScreen(lat, lng, viewport);
      return (
        p.x >= -paddingPx &&
        p.x <= viewport.width + paddingPx &&
        p.y >= -paddingPx &&
        p.y <= viewport.height + paddingPx
      );
    },
    on(event: 'click' | 'busclick', cb: (...args: never[]) => void) {
      if (event === 'click') clickCbs.push(cb as (lat: number, lng: number) => void);
      else if (event === 'busclick') busClickCbs.push(cb as (bus: Bus) => void);
    },
    destroy() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      tileCache.clear();
      canvas.remove();
    },
  };

  return handle;
}
