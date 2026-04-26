# @kbrianps/rio-map

Mapa minimalista do município do Rio de Janeiro renderizado em `<canvas>`. Tiles CartoCDN, máscara branca para áreas fora do município, suporte a marcadores/polylines/posição do usuário. **Zero dependências runtime, ~6.5 KB gzip.**

[Português](#português) · [English](#english)

---

## Português

### O problema

Web apps focados em uma única cidade brasileira herdam o peso do Leaflet (~38 KB gzip) e de bibliotecas que carregam abstrações úteis pra qualquer canto do mundo: rotação 3D, projeções alternativas, plugins, popups, controles de camadas. Pra um app que mostra **só Rio**, isso é overhead puro.

A visão "do Rio inteiro com tiles do mundo em volta" também desperdiça bandwidth — ao renderizar o mapa centrado no Rio, o Leaflet baixa tiles de Niterói, S. Gonçalo, Nova Iguaçu, etc. Esses tiles são imediatamente cobertos por uma máscara branca pra esconder áreas fora do município, mas já foram baixados e parsados.

### O que `rio-map` faz diferente

- **Apenas Web Mercator (EPSG:3857)**: 1 projeção, sem fallbacks pra polar/conformal/etc.
- **Apenas o município do Rio**: o tile loader **filtra requests pelo bounding box do município**. Tile fora do polígono não é nem requisitado.
- **Renderização em um único `<canvas>`**: tiles, máscara, polylines, marcadores e usuário desenhados na mesma surface. Sem DOM compositing, sem layers de divs absolutas.
- **Sem features que não usamos**: nada de popups, plugins, layer controls, rotação, zoom fracionário animado.
- **Zero deps runtime**: nada além do TS bundleado.

### Para quem é

- Tools, dashboards, monitores cívicos focados na cidade do Rio (rastreio de ônibus, trânsito, pontos turísticos, eventos, qualidade do ar, ciclovias, etc).
- Quem precisa de PWA leve onde cada KB conta.
- Quem aceita perder flexibilidade (outros mapas, plugins, zoom infinito) em troca de bundle 5x menor que Leaflet.

### Comparativo de bundle

| Stack | Bundle gzip | Tiles fora do Rio |
|---|---|---|
| Leaflet 1.9 + CSS | ~47 KB | ~6-8 tiles desperdiçados (200-300 KB) |
| `@kbrianps/rio-map` | **~6.5 KB** | **0 tiles desperdiçados** |

### Uso

```ts
import { initMap, type Bus } from '@kbrianps/rio-map';

const map = initMap({ container: 'map' });

map.setUser(-22.9083, -43.1964);

map.setBuses([
  { id: 'A1', lat: -22.91, lng: -43.20, heading: 45, stale: false },
  { id: 'A2', lat: -22.92, lng: -43.21, heading: 90, stale: false },
]);

map.setRoute([[
  [-22.92, -43.22],
  [-22.91, -43.21],
  [-22.90, -43.20],
]]);

map.fitToBuses([{ lat: -22.91, lng: -43.20 }, { lat: -22.92, lng: -43.21 }]);

map.on('click', (lat, lng) => {
  console.log('clicou em', lat, lng);
});
```

### API

```ts
function initMap(opts: RioMapOpts): MapHandle;

interface RioMapOpts {
  container: string | HTMLElement;
  tileUrlTemplate?: string;       // default: CartoCDN light_all
  tileSubdomains?: string;        // default: "abcd"
  initialCenter?: [number, number]; // default: [-22.9083, -43.1964]
  initialZoom?: number;           // default: 11
  minZoom?: number;               // default: 11
  maxZoom?: number;               // default: 18
  showRioMask?: boolean;          // default: true
  routeColor?: string;            // default: #8b5cf6 (roxo)
  busColorFresh?: string;         // default: #0ea5e9 (azul)
  busColorStale?: string;         // default: #94a3b8 (cinza)
  userColor?: string;             // default: #dc2626 (vermelho)
}

interface Bus {
  id: string;
  lat: number;
  lng: number;
  heading: number | null;
  stale: boolean;
}

interface MapHandle {
  setUser(lat: number, lng: number): void;
  setBuses(buses: Bus[]): void;
  clearBuses(): void;
  setRoute(shapes: number[][][] | null): void;
  recenter(): void;
  fitToBuses(buses: { lat: number; lng: number }[]): void;
  flyTo(lat: number, lng: number, zoom?: number): void;
  on(event: 'click', cb: (lat: number, lng: number) => void): void;
  destroy(): void;
}
```

### Interações suportadas

- **Pan**: arrastar com mouse ou um dedo (touch). Limitado às bordas do município (clamping em `RIO_BOUNDS`).
- **Zoom**: scroll do mouse, pinça (2 dedos), botões customizados via `flyTo(lat, lng, zoom)`.
- **Click**: callback recebe lat/lng do ponto clicado.
- **Resize**: `ResizeObserver` re-sincroniza canvas + tiles automaticamente.
- **Animação de marcadores**: `setBuses` interpola posições anteriores → novas com easing cúbico de 800 ms.

### Estrutura interna

```
src/
├── projection.ts     # Web Mercator: lat/lng <-> tile <-> screen
├── tiles.ts          # visibleTiles(viewport, bbox), TileCache LRU + retina
├── renderer.ts       # render(opts): pinta tiles, máscara, rotas, ônibus, usuário
├── interactions.ts   # attachInteractions: pan, wheel, pinch, clamp
├── types.ts          # MapHandle, Bus, RioMapOpts (públicos)
├── rio-boundary.json # polígono GeoJSON do município (3.8 KB, IBGE)
└── index.ts          # public entry: initMap()
```

### Desenvolvimento

```bash
npm install
npm run dev      # demo standalone em http://localhost:5174
npm test         # testes da projeção (Vitest)
npm run typecheck
npm run build    # gera dist/index.js (~6.5 KB gzip) + index.d.ts
```

A pasta `demo/` tem um app standalone que renderiza alguns ônibus fake animados em loop, útil pra dev sem precisar integrar em outro projeto.

### Escopo deliberadamente fora

- **Outros municípios**: a máscara é fixa em Rio (boundary IBGE embutido). Pra usar em outra cidade, é necessário swap do `rio-boundary.json` — cogitamos generalizar pra `@kbrianps/city-map<RJ|SP|BH|...>` no futuro, mas hoje não é o caso.
- **Rotação/heading do mapa**: não usamos. Mapas fixos (norte sempre pra cima) cobrem 99% dos casos urbanos.
- **Popups e tooltips**: marcadores aqui são informativos, não interativos. Use overlays HTML separados se precisar.
- **Plugins/layers genéricos**: tudo embutido (tiles + máscara + polyline + marcadores). Sem extensão pública.
- **Suporte a outras projeções/CRS**: só Web Mercator. Não vamos adicionar.

### Performance

Bundle gerado pelo build é **23.81 KB raw / 6.43 KB gzip**, com source map separado. Sem dependências runtime.

Renderização usa um único `<canvas>` com `requestAnimationFrame`. O loop só roda quando há mudanças (tile nova carregada, animação de marcador em curso, pan/zoom). Tiles são cacheadas em LRU de 200 imagens (substituível via `maxEntries` futuramente).

### Licença

GPL-3.0-or-later. Use livre, modifique livre, redistribua livre — desde que mantenha o código aberto sob mesma licença.

---

## English

### The problem

Web apps focused on a single city inherit the weight of Leaflet (~38 KB gzip) and libraries that carry abstractions useful for anywhere in the world: 3D rotation, alternative projections, plugins, popups, layer controls. For an app showing **Rio only**, that's pure overhead.

The "whole Rio with tiles around it" view also wastes bandwidth — when rendering the map centered on Rio, Leaflet downloads tiles of neighboring cities (Niterói, S. Gonçalo, Nova Iguaçu, etc.). Those tiles are immediately covered by a white mask to hide areas outside the municipality, but they were already downloaded and parsed.

### What `rio-map` does differently

- **Web Mercator only (EPSG:3857)**: 1 projection, no fallbacks for polar/conformal/etc.
- **Rio municipality only**: the tile loader **filters requests by the municipality's bounding box**. Tiles outside the polygon are never requested.
- **Single `<canvas>` rendering**: tiles, mask, polylines, markers and user pin all drawn on the same surface. No DOM compositing, no layered absolute divs.
- **No features we don't use**: no popups, plugins, layer controls, rotation, animated fractional zoom.
- **Zero runtime deps**: nothing beyond the bundled TS.

### Who it's for

- Tools, dashboards, civic monitors focused on Rio de Janeiro (bus tracking, traffic, tourist spots, events, air quality, bike lanes, etc).
- Anyone who needs a lightweight PWA where every KB matters.
- Anyone who's fine trading flexibility (other maps, plugins, infinite zoom) for a bundle 5x smaller than Leaflet.

### Bundle comparison

| Stack | Bundle gzip | Tiles outside Rio |
|---|---|---|
| Leaflet 1.9 + CSS | ~47 KB | ~6-8 wasted tiles (200-300 KB) |
| `@kbrianps/rio-map` | **~6.5 KB** | **0 wasted tiles** |

### Usage

```ts
import { initMap, type Bus } from '@kbrianps/rio-map';

const map = initMap({ container: 'map' });

map.setUser(-22.9083, -43.1964);

map.setBuses([
  { id: 'A1', lat: -22.91, lng: -43.20, heading: 45, stale: false },
  { id: 'A2', lat: -22.92, lng: -43.21, heading: 90, stale: false },
]);

map.setRoute([[
  [-22.92, -43.22],
  [-22.91, -43.21],
  [-22.90, -43.20],
]]);

map.fitToBuses([{ lat: -22.91, lng: -43.20 }, { lat: -22.92, lng: -43.21 }]);

map.on('click', (lat, lng) => {
  console.log('clicked at', lat, lng);
});
```

### API

```ts
function initMap(opts: RioMapOpts): MapHandle;

interface RioMapOpts {
  container: string | HTMLElement;
  tileUrlTemplate?: string;       // default: CartoCDN light_all
  tileSubdomains?: string;        // default: "abcd"
  initialCenter?: [number, number]; // default: [-22.9083, -43.1964]
  initialZoom?: number;           // default: 11
  minZoom?: number;               // default: 11
  maxZoom?: number;               // default: 18
  showRioMask?: boolean;          // default: true
  routeColor?: string;            // default: #8b5cf6 (purple)
  busColorFresh?: string;         // default: #0ea5e9 (blue)
  busColorStale?: string;         // default: #94a3b8 (grey)
  userColor?: string;             // default: #dc2626 (red)
}

interface Bus {
  id: string;
  lat: number;
  lng: number;
  heading: number | null;
  stale: boolean;
}

interface MapHandle {
  setUser(lat: number, lng: number): void;
  setBuses(buses: Bus[]): void;
  clearBuses(): void;
  setRoute(shapes: number[][][] | null): void;
  recenter(): void;
  fitToBuses(buses: { lat: number; lng: number }[]): void;
  flyTo(lat: number, lng: number, zoom?: number): void;
  on(event: 'click', cb: (lat: number, lng: number) => void): void;
  destroy(): void;
}
```

### Supported interactions

- **Pan**: drag with mouse or a single touch. Bounded to the municipality (clamped to `RIO_BOUNDS`).
- **Zoom**: mouse scroll, two-finger pinch, custom buttons via `flyTo(lat, lng, zoom)`.
- **Click**: callback receives lat/lng of clicked point.
- **Resize**: `ResizeObserver` re-syncs canvas and tiles automatically.
- **Marker animation**: `setBuses` interpolates previous → new positions with cubic easing over 800 ms.

### Internal layout

```
src/
├── projection.ts     # Web Mercator: lat/lng <-> tile <-> screen
├── tiles.ts          # visibleTiles(viewport, bbox), LRU TileCache + retina
├── renderer.ts       # render(opts): paints tiles, mask, routes, buses, user
├── interactions.ts   # attachInteractions: pan, wheel, pinch, clamp
├── types.ts          # MapHandle, Bus, RioMapOpts (public)
├── rio-boundary.json # municipality boundary GeoJSON (3.8 KB, IBGE)
└── index.ts          # public entry: initMap()
```

### Development

```bash
npm install
npm run dev      # standalone demo at http://localhost:5174
npm test         # projection tests (Vitest)
npm run typecheck
npm run build    # outputs dist/index.js (~6.5 KB gzip) + index.d.ts
```

The `demo/` folder runs a standalone app rendering a few fake buses animated in a loop, useful for dev without integrating into another project.

### Out-of-scope on purpose

- **Other municipalities**: the mask is fixed to Rio (IBGE boundary embedded). To use for another city, swap `rio-boundary.json`. We may generalize as `@kbrianps/city-map<RJ|SP|BH|...>` in the future, but not today.
- **Map rotation/heading**: we don't use it. Fixed maps (north always up) cover 99% of urban use cases.
- **Popups and tooltips**: markers here are informative, not interactive. Use separate HTML overlays if needed.
- **Generic plugins/layers**: everything baked in (tiles + mask + polylines + markers). No public extension API.
- **Other projections/CRS**: Web Mercator only. No plans to add.

### Performance

The build outputs **23.81 KB raw / 6.43 KB gzip** with separate source map. Zero runtime dependencies.

Rendering uses a single `<canvas>` driven by `requestAnimationFrame`. The loop only runs when there's something to do (a tile loaded, a marker animation in progress, pan/zoom). Tiles are cached in an LRU of 200 images (configurable via `maxEntries` later).

### License

GPL-3.0-or-later. Free to use, modify, and redistribute — provided you keep the source open under the same license.
