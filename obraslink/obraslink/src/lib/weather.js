// Previsión del tiempo por dirección de obra.
// Usa servicios gratuitos sin clave: Nominatim (dirección → coordenadas)
// y Open-Meteo (previsión). Se guarda en caché 3 horas para no abusar.

const CACHE_KEY = 'xt_tiempo_v1'
const CACHE_HOURS = 3

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {} } catch { return {} }
}

export async function getForecast(address) {
  if (!address?.trim() || !navigator.onLine) return null
  const key = address.trim().toLowerCase()
  const cache = readCache()
  const hit = cache[key]
  if (hit && Date.now() - hit.at < CACHE_HOURS * 3600000) return hit.days

  try {
    // 1) Dirección → coordenadas
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(address)}`,
      { headers: { 'Accept-Language': 'es' } }
    )
    const geo = await geoRes.json()
    if (!geo?.[0]) return null
    const { lat, lon } = geo[0]

    // 2) Previsión 3 días
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=3`
    )
    const w = await wRes.json()
    if (!w?.daily?.time) return null

    const days = w.daily.time.map((date, i) => ({
      date,
      code: w.daily.weather_code[i],
      tmax: Math.round(w.daily.temperature_2m_max[i]),
      tmin: Math.round(w.daily.temperature_2m_min[i]),
      rain: w.daily.precipitation_probability_max[i] ?? 0,
    }))

    // guardar en caché (limitado a 20 direcciones)
    const entries = Object.entries(cache).slice(-19)
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ...Object.fromEntries(entries), [key]: { at: Date.now(), days },
    }))
    return days
  } catch {
    return null
  }
}

export function weatherEmoji(code) {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '❄️'
  return '⛈️'
}

export function weatherLabel(code) {
  if (code === 0) return 'Despejado'
  if (code <= 2) return 'Poco nuboso'
  if (code === 3) return 'Nublado'
  if (code <= 48) return 'Niebla'
  if (code <= 57) return 'Llovizna'
  if (code <= 67) return 'Lluvia'
  if (code <= 77) return 'Nieve'
  if (code <= 82) return 'Chubascos'
  if (code <= 86) return 'Nieve'
  return 'Tormenta'
}

export function dayName(dateStr, i) {
  if (i === 0) return 'Hoy'
  if (i === 1) return 'Mañana'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long' })
}
