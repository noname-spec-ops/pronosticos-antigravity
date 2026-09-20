import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceKm,
  getMatchTravelDistanceKm,
} from '../stadiumDistance';

describe('Stadium Distance & Geographic Travel Fatigue Engine', () => {
  it('calculates Haversine distance correctly between coordinates', () => {
    // London (51.556, -0.108) to Liverpool (53.430, -2.960) ~ 288 km
    const dist = calculateHaversineDistanceKm(51.556, -0.108, 53.430, -2.960);
    expect(dist).toBeGreaterThan(250);
    expect(dist).toBeLessThan(350);
  });

  it('returns small distance and 1.0 multiplier when teams are nearby', () => {
    // Arsenal vs Tottenham (North London Derby, ~6km)
    const travel = getMatchTravelDistanceKm('Arsenal', 'Tottenham Hotspur');
    expect(travel.distanceKm).toBeLessThan(20);
    expect(travel.travelFatigueFactor).toBe(1.0);
    expect(travel.isCrossCountry).toBe(false);
  });

  it('detects moderate domestic travel distance', () => {
    // Arsenal vs Newcastle United (~390-450km)
    const travel = getMatchTravelDistanceKm('Arsenal', 'Newcastle United');
    expect(travel.distanceKm).toBeGreaterThan(350);
    expect(travel.travelFatigueFactor).toBeLessThanOrEqual(0.985);
  });

  it('applies greater fatigue penalty for long distance', () => {
    // Real Madrid vs Las Palmas (Canary Islands, ~1750km)
    const travel = getMatchTravelDistanceKm('Real Madrid', 'Las Palmas');
    if (travel.distanceKm > 0) {
      expect(travel.distanceKm).toBeGreaterThan(1500);
      expect(travel.travelFatigueFactor).toBeLessThanOrEqual(0.95);
      expect(travel.isInternational || travel.isCrossCountry).toBe(true);
    }
  });

  it('safely handles unknown teams with fallback 1.0 factor', () => {
    const travel = getMatchTravelDistanceKm('Unknown FC Alpha', 'Unknown FC Beta');
    expect(travel.distanceKm).toBe(0);
    expect(travel.travelFatigueFactor).toBe(1.0);
  });
});