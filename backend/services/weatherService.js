/**
 * Ride Smart 4.0 — Weather Service
 * Exports:
 *   fetchWeatherAt(lat, lng)  — used by earningsPrediction, recommendation, zones
 *   getChicagoWeather()       — legacy, kept for backward compat
 */
import axios from 'axios';

const CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function fetchWeatherAt(lat = 41.8781, lng = -87.6298) {
  const key = `${Math.round(lat * 10) / 10}_${Math.round(lng * 10) / 10}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return _fallback();

  try {
    const { data } = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      { params: { lat, lon: lng, appid: apiKey, units: 'imperial' }, timeout: 5000 }
    );
    const result = {
      temp:       Math.round(data.main?.temp        || 62),
      feelsLike:  Math.round(data.main?.feels_like  || 60),
      humidity:   data.main?.humidity               || 55,
      windSpeed:  Math.round(data.wind?.speed       || 0),
      desc:       data.weather?.[0]?.description    || 'Clear',
      icon:       data.weather?.[0]?.icon           || '01d',
      condition:  data.weather?.[0]?.main           || 'Clear',
      rain:       data.rain?.['1h']                 || 0,
      snow:       data.snow?.['1h']                 || 0,
      visibility: data.visibility                   || 10000,
    };
    // Demand score: 50 = normal, up to 100
    let score = 50;
    if (result.rain > 0.5)    score += 25;
    if (result.snow > 0.1)    score += 35;
    if (result.temp < 20)     score += 20;
    if (result.temp > 92)     score += 15;
    if (result.windSpeed > 25) score += 10;
    result.score = Math.min(100, score);
    result.demandBoost = score > 50 ? `+${score - 50}% demand` : 'Normal';
    result.rainIntensity = result.rain;

    CACHE.set(key, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.warn('[Weather]', e.message);
    return _fallback();
  }
}

// Legacy: kept so old imports don't break
export async function getChicagoWeather() {
  return fetchWeatherAt(41.8781, -87.6298);
}

function _fallback() {
  const h = new Date().getHours();
  return {
    temp: h >= 6 && h <= 18 ? 65 : 55,
    feelsLike: 62, humidity: 55, windSpeed: 8,
    desc: 'Clear', icon: '01d', condition: 'Clear',
    rain: 0, snow: 0, visibility: 10000,
    score: 50, demandBoost: 'Normal', rainIntensity: 0,
    isFallback: true,
  };
}
