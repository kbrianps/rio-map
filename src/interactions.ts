import { screenToLatLng, type Viewport } from './projection';

export interface InteractionOpts {
  el: HTMLElement;
  state: { viewport: Viewport };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  minZoom: number;
  maxZoom: number;
  onChange: () => void;
  /** Animated zoom request used by wheel/pinch. Receives the target integer zoom and the cursor anchor. */
  requestZoom: (target: number, anchorX: number, anchorY: number) => void;
}

export function attachInteractions(opts: InteractionOpts): () => void {
  const { el, state, bounds, minZoom, maxZoom, onChange, requestZoom } = opts;

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

  let wheelAccum = 0;
  let wheelTimer: number | null = null;
  let wheelCursor = { x: 0, y: 0 };
  function flushWheel() {
    wheelTimer = null;
    if (wheelAccum === 0) return;
    const step = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;
    const target = Math.max(minZoom, Math.min(maxZoom, Math.round(state.viewport.zoom) + step));
    requestZoom(target, wheelCursor.x, wheelCursor.y);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    wheelCursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    wheelAccum += -Math.sign(e.deltaY);
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(flushWheel, 90);
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
        const rect = el.getBoundingClientRect();
        const cursorX = pinchCenter.x - rect.left;
        const cursorY = pinchCenter.y - rect.top;
        const targetZoom = Math.max(
          minZoom,
          Math.min(maxZoom, Math.round(state.viewport.zoom) + (factor > 1 ? 1 : -1)),
        );
        if (targetZoom !== state.viewport.zoom) {
          requestZoom(targetZoom, cursorX, cursorY);
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
