// How hospitals are ordered. Change the numbers here and the whole site follows.
const WEIGHTS = { freshness: 3, proximity: 2 }; // "credits"
const FRESH_WINDOW_H = 24; // data older than this earns 0 freshness points
const NEAR_WINDOW_KM = 25; // farther away than this earns 0 proximity points

// straight-line distance between two points on Earth, in km (haversine formula)
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// reads ?lat=..&lng=.. (or a request body); returns null if missing or invalid
function readLocation(src) {
  const lat = parseFloat(src && src.lat);
  const lng = parseFloat(src && src.lng);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

// score = 3 x freshness + 2 x proximity, each between 0 and 1. Highest score first.
function rank(list, where) {
  return list.map((h) => {
    const hours = Math.max(0, (Date.now() - new Date(h.last_updated)) / 36e5);
    const freshness = 1 - Math.min(hours, FRESH_WINDOW_H) / FRESH_WINDOW_H;

    let km = null, proximity = 0;
    if (where && h.lat != null && h.lng != null) {
      km = distanceKm(where.lat, where.lng, h.lat, h.lng);
      proximity = 1 - Math.min(km, NEAR_WINDOW_KM) / NEAR_WINDOW_KM;
    }
    return {
      ...h,
      distance_km: km === null ? null : Math.round(km * 10) / 10,
      score: WEIGHTS.freshness * freshness + WEIGHTS.proximity * proximity,
    };
  }).sort((a, b) => b.score - a.score);
}

module.exports = { rank, readLocation, distanceKm };