import { describe, it, expect } from 'vitest';
import {
  lngToWorldX,
  latToWorldY,
  worldXToLng,
  worldYToLat,
  latLngToScreen,
  screenToLatLng,
} from '../src/projection';

describe('Web Mercator projection', () => {
  it('lng <-> worldX roundtrip', () => {
    const z = 12;
    for (const lng of [-179, -43.19, 0, 43.19, 179]) {
      expect(worldXToLng(lngToWorldX(lng, z), z)).toBeCloseTo(lng, 6);
    }
  });

  it('lat <-> worldY roundtrip', () => {
    const z = 12;
    for (const lat of [-85, -22.91, 0, 22.91, 85]) {
      expect(worldYToLat(latToWorldY(lat, z), z)).toBeCloseTo(lat, 6);
    }
  });

  it('screen <-> latLng roundtrip with non-trivial center', () => {
    const v = { centerLat: -22.9083, centerLng: -43.1964, zoom: 13, width: 800, height: 600 };
    const samples = [
      [v.centerLat, v.centerLng],
      [-22.95, -43.25],
      [-22.86, -43.15],
    ];
    for (const [lat, lng] of samples) {
      const s = latLngToScreen(lat, lng, v);
      const r = screenToLatLng(s.x, s.y, v);
      expect(r.lat).toBeCloseTo(lat, 5);
      expect(r.lng).toBeCloseTo(lng, 5);
    }
  });

  it('center maps to viewport middle', () => {
    const v = { centerLat: -22.9083, centerLng: -43.1964, zoom: 11, width: 1024, height: 768 };
    const s = latLngToScreen(v.centerLat, v.centerLng, v);
    expect(s.x).toBeCloseTo(v.width / 2, 6);
    expect(s.y).toBeCloseTo(v.height / 2, 6);
  });
});
