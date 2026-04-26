import { initMap, type Bus } from '../src/index';

const map = initMap({ container: 'map' });

const fakeBuses: Bus[] = [
  { id: 'A1', lat: -22.9083, lng: -43.1964, heading: 45, stale: false },
  { id: 'A2', lat: -22.9183, lng: -43.2064, heading: 90, stale: false },
  { id: 'A3', lat: -22.8983, lng: -43.1864, heading: 270, stale: true },
  { id: 'A4', lat: -22.9283, lng: -43.1764, heading: null, stale: false },
];
map.setBuses(fakeBuses);
map.setUser(-22.9083, -43.1964);

const route: number[][][] = [[
  [-22.92, -43.22],
  [-22.91, -43.21],
  [-22.905, -43.20],
  [-22.90, -43.19],
  [-22.895, -43.185],
]];
map.setRoute(route);

document.getElementById('recenter')?.addEventListener('click', () => map.recenter());
document.getElementById('zoom-in')?.addEventListener('click', () => map.flyTo(-22.9083, -43.1964, 14));
document.getElementById('zoom-out')?.addEventListener('click', () => map.flyTo(-22.9083, -43.1964, 11));

const info = document.getElementById('info')!;
map.on('click', (lat, lng) => {
  info.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
});

setInterval(() => {
  for (const b of fakeBuses) {
    b.lat += (Math.random() - 0.5) * 0.001;
    b.lng += (Math.random() - 0.5) * 0.001;
    b.heading = (b.heading ?? 0) + Math.random() * 30 - 15;
  }
  map.setBuses(fakeBuses);
}, 2500);
