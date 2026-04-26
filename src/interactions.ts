import { screenToLatLng, type Viewport } from './projection';

export interface InteractionOpts {
  el: HTMLElement;
  state: { viewport: Viewport };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  minZoom: number;
  maxZoom: number;
  onChange: () => void;
}

export function attachInteractions(opts: InteractionOpts): () => void {
  const { el, state, bounds, minZoom, maxZoom, onChange } = opts;

  function clampViewport() {
    const v = state.viewport;
    v.zoom = Math.max(minZoom, Math.min(maxZoom, v.zoom));
    v.centerLat = Math.max(bounds.minLat, Math.min(bounds.maxLat, v.centerLat));
    v.centerLng = Math.max(bounds.minLng, Math.min(bounds.maxLng, v.centerLng));
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    panBy(dx, dy);
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture(e.pointerId);
    el.style.cursor = '';
  }

  function panBy(dxPx: number, dyPx: number) {
    const v = state.viewport;
    const center = screenToLatLng(v.width / 2 - dxPx, v.height / 2 - dyPx, v);
    v.centerLat = center.lat;
    v.centerLng = center.lng;
    clampViewport();
    onChange();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const v = state.viewport;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const before = screenToLatLng(cursorX, cursorY, v);
    const delta = -Math.sign(e.deltaY);
    v.zoom = Math.max(minZoom, Math.min(maxZoom, Math.round(v.zoom + delta)));
    const after = screenToLatLng(cursorX, cursorY, v);
    v.centerLat += before.lat - after.lat;
    v.centerLng += before.lng - after.lng;
    clampViewport();
    onChange();
  }

  let pinchDist = 0;
  let pinchCenter = { x: 0, y: 0 };
  const activePointers = new Map<number, { x: number; y: number }>();

  function onPointerDownPinch(e: PointerEvent) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      dragging = false;
      const [a, b] = Array.from(activePointers.values());
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  function onPointerMovePinch(e: PointerEvent) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const [a, b] = Array.from(activePointers.values());
      const newDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist === 0) {
        pinchDist = newDist;
        return;
      }
      const factor = newDist / pinchDist;
      if (Math.abs(factor - 1) > 0.05) {
        const v = state.viewport;
        const rect = el.getBoundingClientRect();
        const cursorX = pinchCenter.x - rect.left;
        const cursorY = pinchCenter.y - rect.top;
        const before = screenToLatLng(cursorX, cursorY, v);
        const targetZoom = Math.max(
          minZoom,
          Math.min(maxZoom, Math.round(v.zoom + (factor > 1 ? 1 : -1))),
        );
        if (targetZoom !== v.zoom) {
          v.zoom = targetZoom;
          const after = screenToLatLng(cursorX, cursorY, v);
          v.centerLat += before.lat - after.lat;
          v.centerLng += before.lng - after.lng;
          clampViewport();
          onChange();
        }
        pinchDist = newDist;
      }
    }
  }

  function onPointerUpPinch(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchDist = 0;
  }

  el.addEventListener('pointerdown', (e) => {
    onPointerDownPinch(e);
    if (activePointers.size === 1) onPointerDown(e);
  });
  el.addEventListener('pointermove', (e) => {
    onPointerMovePinch(e);
    if (activePointers.size <= 1) onPointerMove(e);
  });
  el.addEventListener('pointerup', (e) => {
    onPointerUpPinch(e);
    onPointerUp(e);
  });
  el.addEventListener('pointercancel', (e) => {
    onPointerUpPinch(e);
    onPointerUp(e);
  });
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return () => {
    el.style.cursor = '';
  };
}
