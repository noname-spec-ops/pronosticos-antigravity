/**
 * FlashStat — Open-Meteo 100% FREE Weather & Environmental Context Engine (services/weatherService.ts)
 * 
 * - Uses Open-Meteo (Completely Free, No API key needed, unlimited open public API).
 * - Maps city coordinates to calculate match rain probability, wind speed, temperature, and pitch conditions.
 * - Computes weather card & foul modifiers (+15% cards on heavy rain, +10% on high wind/heat).
 */

import { serverCache } from '../lib/cache';

export interface WeatherCondition {
  city: string;
  temperatureC: number;
  rainProbabilityPercent: number;
  windSpeedKmh: number;
  conditionDescription: string;
  isAdverseWeather: boolean;
  weatherFoulModifier: number; // e.g. 1.0 to 1.25
}

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'Madrid': { lat: 40.4168, lon: -3.7038 },
  'Barcelona': { lat: 41.3879, lon: 2.1699 },
  'London': { lat: 51.5074, lon: -0.1278 },
  'Manchester': { lat: 53.4808, lon: -2.2426 },
  'Liverpool': { lat: 53.4084, lon: -2.9916 },
  'Milan': { lat: 45.4642, lon: 9.1900 },
  'Rome': { lat: 41.9028, lon: 12.4964 },
  'Turin': { lat: 45.0703, lon: 7.6869 },
  'Munich': { lat: 48.1351, lon: 11.5820 },
  'Dortmund': { lat: 51.5136, lon: 7.4653 },
  'Berlin': { lat: 52.5200, lon: 13.4050 },
  'Paris': { lat: 48.8566, lon: 2.3522 },
  'Marseille': { lat: 43.2965, lon: 5.3698 },
  'Bucharest': { lat: 44.4268, lon: 26.1025 },
  'Cluj-Napoca': { lat: 46.7712, lon: 23.6236 },
  'Amsterdam': { lat: 52.3676, lon: 4.9041 },
  'Rotterdam': { lat: 51.9244, lon: 4.4777 },
  'Lisbon': { lat: 38.7223, lon: -9.1393 },
  'Porto': { lat: 41.1579, lon: -8.6291 },
  'Istanbul': { lat: 41.0082, lon: 28.9784 },
};

export class WeatherService {
  /**
   * Retrieves weather forecast for a match city using Open-Meteo (100% Free, no key required).
   */
  public static async getMatchWeather(cityName: string = 'London'): Promise<WeatherCondition> {
    const coords = CITY_COORDINATES[cityName] || CITY_COORDINATES['London'];
    const cacheKey = `weather:open_meteo:${coords.lat.toFixed(2)}:${coords.lon.toFixed(2)}`;

    const cached = serverCache.get<WeatherCondition>(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 FlashStat/2.0' },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const json = await res.json();
        const current = json.current || {};
        const temp = current.temperature_2m ?? 18;
        const rainProb = current.precipitation_probability ?? 10;
        const wind = current.wind_speed_10m ?? 12;

        let modifier = 1.0;
        if (rainProb > 50) modifier *= 1.12; // Wet surface = more slide tackles
        if (wind > 30) modifier *= 1.08; // High wind = errant passes and high presses
        if (temp > 30) modifier *= 1.06; // Heat fatigue = late reckless challenges

        const isAdverse = modifier > 1.08;
        const desc = rainProb > 50 ? 'Ploaie / Teren Alunecos' : wind > 25 ? 'Vânt Puternic' : temp > 28 ? 'Căldură Ridicată' : 'Condiții Optime de Joc';

        const result: WeatherCondition = {
          city: cityName,
          temperatureC: temp,
          rainProbabilityPercent: rainProb,
          windSpeedKmh: wind,
          conditionDescription: desc,
          isAdverseWeather: isAdverse,
          weatherFoulModifier: Number(modifier.toFixed(2)),
        };

        serverCache.set(cacheKey, result, 3600); // 1 hour cache
        return result;
      }
    } catch (err) {
      console.warn('[WeatherService] Open-Meteo lookup failed, using standard conditions:', err);
    }

    return {
      city: cityName,
      temperatureC: 18,
      rainProbabilityPercent: 10,
      windSpeedKmh: 12,
      conditionDescription: 'Condiții Standard',
      isAdverseWeather: false,
      weatherFoulModifier: 1.0,
    };
  }
}
