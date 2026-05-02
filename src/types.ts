export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bus {
  id: string;
  lat: number;
  lng: number;
  heading: number | null;
  stale: boolean;
  color?: string;
  pending?: boolean;
  offRoute?: boolean;
}

export interface RouteLayer {
  shapes: number[][][];
  color?: string;
}

export interface MapHandle {
  setUser: (lat: number, lng: number) => void;
  setBuses: (buses: Bus[]) => void;
  clearBuses: () => void;
  setRoutes: (routes: RouteLayer[] | null) => void;
  recenter: () => void;
  fitToBuses: (buses: { lat: number; lng: number }[]) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getCenter: () => { lat: number; lng: number; zoom: number };
  isInView: (lat: number, lng: number, paddingPx?: number) => boolean;
  latLngToContainer: (lat: number, lng: number) => { x: number; y: number };
  on: {
    (event: 'click', cb: (lat: number, lng: number) => void): void;
    (event: 'busclick', cb: (bus: Bus) => void): void;
  };
  destroy: () => void;
}

export interface RioMapOpts {
  container: string | HTMLElement;
  tileUrlTemplate?: string;
  tileSubdomains?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  showRioMask?: boolean;
  routeColor?: string;
  busColorFresh?: string;
  busColorStale?: string;
  userColor?: string;
}
