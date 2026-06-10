// ===== Basisconfiguratie =====

const CONCLUSIE_KEYWORDS = [
  "kan goed werken",
  "komt beter tot zijn recht",
  "sluit goed aan",
  "past beter",
  "aanbevolen",
  "het beste",
  "comfortwijnen",
  "geschikt",
  "werkt goed",
  "is ideaal",
  "is prettig",
  "is minder geschikt",
  "kan vlak zijn",
  "kan strenger smaken"
];

const DEFAULT_LOCATION = { name: "Rotterdam", lat: 51.9225, lon: 4.47917 };
const DEFAULT_PREFS = { year: 2026, month: 5, place: "Rotterdam" };
const FORECAST_MAX_DAYS = 14;
const WEEKDAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const RAINY_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
  71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99
]);

let wines = [];
let userLocation = { ...DEFAULT_LOCATION };
let currentYear;
let currentMonth;
let calendarRequestId = 0;
let locationRequestId = 0;
let renderDebounceTimer;
let locationDebounceTimer;

// ===== Opslag (veilig voor Safari) =====

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// ===== Wijnvoorraad (localStorage) =====

function loadWines() {
  const raw = storageGet("wines");
  if (!raw) {
    wines = [
      { name: "Pommard 2018", grape: "Pinot Noir", region: "Bourgogne", style: "tanninerijk" },
      { name: "Sancerre 2022", grape: "Sauvignon Blanc", region: "Loire", style: "aromatisch" },
      { name: "Provence Rosé 2023", grape: "Grenache", region: "Provence", style: "fris" },
      { name: "Chablis 2021", grape: "Chardonnay", region: "Bourgogne", style: "elegant" }
    ];
    saveWines();
    return;
  }
  try {
    wines = JSON.parse(raw);
  } catch {
    wines = [];
  }
}

function saveWines() {
  storageSet("wines", JSON.stringify(wines));
}

// ===== Voorkeuren (jaar, maand, plaats) =====

function loadPreferences() {
  const yearInput = document.getElementById("yearInput");
  const monthSelect = document.getElementById("monthSelect");
  const locationInput = document.getElementById("locationInput");
  const prefs = { ...DEFAULT_PREFS };

  const raw = storageGet("prefs");
  if (raw) {
    try {
      Object.assign(prefs, JSON.parse(raw));
    } catch {
      /* gebruik defaults */
    }
  }

  yearInput.value = String(prefs.year);
  monthSelect.value = String(prefs.month);
  locationInput.value = prefs.place;
}

function savePreferences() {
  const year = parseInt(document.getElementById("yearInput").value, 10);
  const month = parseInt(document.getElementById("monthSelect").value, 10);
  const place = document.getElementById("locationInput").value.trim();

  storageSet(
    "prefs",
    JSON.stringify({
      year: Number.isNaN(year) ? DEFAULT_PREFS.year : year,
      month: Number.isNaN(month) ? DEFAULT_PREFS.month : month,
      place: place || DEFAULT_PREFS.place
    })
  );
}

// ===== Locatie (localStorage + geocoding) =====

function loadLocation() {
  const raw = storageGet("location");
  if (!raw) {
    userLocation = { ...DEFAULT_LOCATION };
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
      userLocation = parsed;
    }
  } catch {
    userLocation = { ...DEFAULT_LOCATION };
  }
}

function saveLocation() {
  storageSet("location", JSON.stringify(userLocation));
}

async function geocodeLocation(name) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name,
      count: "1",
      language: "nl",
      format: "json"
    });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error("Geocoding mislukt");
  const data = await res.json();
  if (!data.results || !data.results.length) throw new Error("Plaats niet gevonden");

  const hit = data.results[0];
  return {
    name: hit.name,
    lat: hit.latitude,
    lon: hit.longitude
  };
}

function displayLocationName(loc) {
  if (!loc || !loc.name) return "Rotterdam";
  return loc.name.split(",")[0].trim() || "Rotterdam";
}

function unknownWeather() {
  return { unknown: true };
}

function daysFromToday(year, month, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(year, month, day);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function isFutureBeyondForecast(year, month, day) {
  return daysFromToday(year, month, day) > FORECAST_MAX_DAYS;
}

function buildLocalWeatherMap(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const map = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(year, month, day);
    if (isFutureBeyondForecast(year, month, day)) {
      map[key] = unknownWeather();
    } else {
      map[key] = { pending: true };
    }
  }
  return map;
}

// ===== Biodynamische kalender (Maria Thun-benadering) =====

const CONSTELLATION_NAMES = [
  "Ram", "Stier", "Tweelingen", "Kreeft", "Leeuw", "Maagd",
  "Weegschaal", "Schorpioen", "Boogschutter", "Steenbok", "Waterman", "Vissen"
];

// Grenzen langs de ecliptica (J2000, tropisch), afgeleid van IAU-constellatiegrenzen.
// Schorpioen omvat het Ophiuchus-tracé (12-sterrenbeeldensysteem van Thun).
const CONSTELLATION_BOUNDS_TROPICAL = [
  28.687, 53.417, 90.140, 117.988, 138.038, 173.851,
  217.810, 241.047, 266.238, 299.656, 327.488, 351.650
];

const CONSTELLATION_TYPES = [
  "fruit", "root", "flower", "leaf", "fruit", "root",
  "flower", "leaf", "fruit", "root", "flower", "leaf"
];

function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function faganBradleyAyanamsa(date) {
  const T = (toJulianDate(date) - 2451545.0) / 36525;
  return 24.7403 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

function moonEclipticLongitude(date) {
  const JD = toJulianDate(date);
  const T = (JD - 2451545.0) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;

  const L0 = normalizeDegrees(
    218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - (T2 * T2) / 65194000
  );
  const D = normalizeDegrees(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 538841 - (T2 * T2) / 65194000
  );
  const M = normalizeDegrees(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = normalizeDegrees(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - (T2 * T2) / 14712000
  );
  const F = normalizeDegrees(
    93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + (T2 * T2) / 863310000
  );

  const Dr = (D * Math.PI) / 180;
  const Mr = (M * Math.PI) / 180;
  const Mpr = (Mp * Math.PI) / 180;
  const Fr = (F * Math.PI) / 180;

  const lambda =
    L0 +
    6.288774 * Math.sin(Mpr) +
    1.274027 * Math.sin(2 * Dr - Mpr) +
    0.658314 * Math.sin(2 * Dr) +
    0.213618 * Math.sin(2 * Mpr) -
    0.185116 * Math.sin(Mr) -
    0.114332 * Math.sin(2 * Fr) +
    0.058793 * Math.sin(2 * Dr - 2 * Mpr) +
    0.057066 * Math.sin(2 * Dr - Mr - Mpr) +
    0.053322 * Math.sin(2 * Dr + Mpr) +
    0.045758 * Math.sin(2 * Dr - Mr) -
    0.040998 * Math.sin(Mr - Mpr) -
    0.034718 * Math.sin(Dr) -
    0.030465 * Math.sin(Mr + Mpr) +
    0.015326 * Math.sin(2 * Dr - 2 * Fr) -
    0.012528 * Math.sin(2 * Fr + Mpr) -
    0.010980 * Math.sin(2 * Fr - Mpr) +
    0.010674 * Math.sin(4 * Dr - Mpr) +
    0.010034 * Math.sin(3 * Mpr);

  return normalizeDegrees(lambda);
}

function moonSiderealLongitude(date) {
  return normalizeDegrees(moonEclipticLongitude(date) - faganBradleyAyanamsa(date));
}

function siderealConstellationBounds(date) {
  const ay = faganBradleyAyanamsa(date);
  return CONSTELLATION_BOUNDS_TROPICAL.map(function (bound) {
    return normalizeDegrees(bound - ay);
  });
}

function constellationIndex(siderealLon, bounds) {
  const lon = normalizeDegrees(siderealLon);

  if (lon >= bounds[11] || lon < bounds[0]) {
    return 11;
  }

  for (let i = 10; i >= 0; i--) {
    if (lon >= bounds[i]) return i;
  }

  return 0;
}

function typeFromConstellation(index) {
  return CONSTELLATION_TYPES[index];
}

function constellationName(index) {
  return CONSTELLATION_NAMES[index] || "Onbekend";
}

function typeLabel(type) {
  if (type === "fruit") return "Vruchtendag";
  if (type === "flower") return "Bloemdag";
  if (type === "leaf") return "Bladdag";
  if (type === "root") return "Worteldag";
  return "Onbekend";
}

function toDecimalHour(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function formatHour(h) {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

function formatSlotEnd(endHour) {
  if (endHour >= 24 || endHour >= 23.99) return "23:59";
  return formatHour(endHour);
}

function formatSlotRange(slot) {
  return `${formatHour(slot.start)}–${formatSlotEnd(slot.end)}`;
}

function findTransitionTime(from, to, constellationBefore) {
  let lo = from.getTime();
  let hi = to.getTime();

  while (hi - lo > 60000) {
    const mid = (lo + hi) / 2;
    const midDate = new Date(mid);
    const bounds = siderealConstellationBounds(midDate);
    const idx = constellationIndex(moonSiderealLongitude(midDate), bounds);
    if (idx !== constellationBefore) hi = mid;
    else lo = mid;
  }

  return new Date(hi);
}

function buildSlots(year, month, day) {
  const dayStart = new Date(year, month, day, 0, 0, 0);
  const dayEnd = new Date(year, month, day + 1, 0, 0, 0);

  const slots = [];
  let slotStart = dayStart;
  const startBounds = siderealConstellationBounds(dayStart);
  let currentConst = constellationIndex(moonSiderealLongitude(dayStart), startBounds);
  let currentType = typeFromConstellation(currentConst);

  let probe = new Date(dayStart.getTime() + 30 * 60000);

  while (probe <= dayEnd) {
    const probeBounds = siderealConstellationBounds(probe);
    const idx = constellationIndex(moonSiderealLongitude(probe), probeBounds);
    if (idx !== currentConst) {
      const transition = findTransitionTime(slotStart, probe, currentConst);
      slots.push({
        type: currentType,
        constellation: constellationName(currentConst),
        start: toDecimalHour(slotStart),
        end: toDecimalHour(transition)
      });
      slotStart = transition;
      const transBounds = siderealConstellationBounds(transition);
      currentConst = constellationIndex(moonSiderealLongitude(transition), transBounds);
      currentType = typeFromConstellation(currentConst);
    }
    probe = new Date(probe.getTime() + 30 * 60000);
  }

  slots.push({
    type: currentType,
    constellation: constellationName(currentConst),
    start: toDecimalHour(slotStart),
    end: 24
  });

  return slots;
}

function dominantType(slots) {
  let best = slots[0];
  let bestDuration = 0;

  for (const slot of slots) {
    const duration = slot.end - slot.start;
    if (duration > bestDuration) {
      bestDuration = duration;
      best = slot;
    }
  }

  return best.type;
}

// ===== Weer (Open-Meteo + fallback) =====

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isRainy(weather) {
  if (!weather || weather.unknown || weather.pending) return false;
  if (weather.precipitation > 0) return true;
  return RAINY_WEATHER_CODES.has(weather.code);
}

function hasWeatherData(weather) {
  return weather && !weather.unknown && !weather.pending && !weather.unavailable;
}

function parseDailyWeather(data) {
  const map = {};
  const daily = data.daily;
  if (!daily || !daily.time) return map;

  const maxArr = daily.temperature_2m_max || [];
  const minArr = daily.temperature_2m_min || [];
  const pressureArr = daily.surface_pressure_mean || [];
  const codeArr = daily.weathercode || [];
  const precipArr = daily.precipitation_sum || [];

  daily.time.forEach(function (iso, i) {
    const max = maxArr[i];
    const min = minArr[i];
    const pressure = pressureArr[i];
    const code = codeArr[i] != null ? codeArr[i] : 0;
    const precipitation = precipArr[i] != null ? precipArr[i] : 0;
    let temp = 15;
    if (max != null && min != null) temp = (max + min) / 2;
    else if (max != null) temp = max;
    else if (min != null) temp = min;

    map[iso] = {
      temp: temp,
      pressure: pressure != null ? pressure : 1013,
      code: code,
      precipitation: precipitation,
      estimated: false
    };
  });

  return map;
}

function clickOnId(target, id) {
  let el = target;
  while (el) {
    if (el.id === id) return true;
    el = el.parentElement;
  }
  return false;
}

async function fetchOpenMeteo(url, lat, lon, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "surface_pressure_mean",
      "precipitation_sum",
      "weathercode"
    ].join(","),
    timezone: "auto"
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(`${url}?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error("Weer-API mislukt");
  return res.json();
}

async function fetchWeatherForMonth(year, month, lat, lon) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const forecastStart = new Date(today);
  forecastStart.setDate(forecastStart.getDate() - 92);
  const forecastEnd = new Date(today);
  forecastEnd.setDate(forecastEnd.getDate() + FORECAST_MAX_DAYS);

  const archiveCutoff = new Date(today);
  archiveCutoff.setDate(archiveCutoff.getDate() - 5);

  const result = {};
  const fetches = [];

  if (firstDay <= archiveCutoff) {
    const aStart = formatISODate(firstDay);
    const aEnd = formatISODate(lastDay < archiveCutoff ? lastDay : archiveCutoff);
    fetches.push(
      fetchOpenMeteo(
        "https://archive-api.open-meteo.com/v1/archive",
        lat,
        lon,
        aStart,
        aEnd
      )
    );
  }

  if (lastDay >= forecastStart && firstDay <= forecastEnd) {
    const fStart = formatISODate(firstDay > forecastStart ? firstDay : forecastStart);
    const fEnd = formatISODate(lastDay < forecastEnd ? lastDay : forecastEnd);
    if (fStart <= fEnd) {
      fetches.push(
        fetchOpenMeteo(
          "https://api.open-meteo.com/v1/forecast",
          lat,
          lon,
          fStart,
          fEnd
        )
      );
    }
  }

  if (fetches.length) {
    const responses = await Promise.allSettled(fetches);
    for (const response of responses) {
      if (response.status === "fulfilled") {
        Object.assign(result, parseDailyWeather(response.value));
      }
    }
  }

  let liveCount = 0;
  let unknownCount = 0;
  let unavailableCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(year, month, day);
    if (isFutureBeyondForecast(year, month, day)) {
      result[key] = unknownWeather();
      unknownCount++;
    } else if (result[key]) {
      liveCount++;
    } else {
      result[key] = { unavailable: true };
      unavailableCount++;
    }
  }

  return { weather: result, liveCount, unknownCount, unavailableCount };
}

function weatherLine(weather) {
  if (!weather || weather.unknown) return "Weer: nog niet bekend";
  if (weather.pending) return "Weer: laden…";
  if (weather.unavailable) return "Weer: niet beschikbaar";
  return (
    "Luchtdruk " + weather.pressure.toFixed(0) + " hPa, ca. " +
    weather.temp.toFixed(1) + " °C"
  );
}

function weatherDetail(weather) {
  if (!weather || weather.unknown) {
    return "Weer en luchtdruk: nog niet bekend (voorspelling max. " + FORECAST_MAX_DAYS + " dagen vooruit)";
  }
  if (weather.pending) return "Weer: wordt opgehaald…";
  if (weather.unavailable) return "Weer: niet beschikbaar via Open-Meteo";
  return (
    "Luchtdruk: " + weather.pressure.toFixed(0) + " hPa, " +
    "Temperatuur: " + weather.temp.toFixed(1) + " °C, " +
    "Weer: " + (isRainy(weather) ? "regenachtig" : "droog") + " (Open-Meteo)"
  );
}

// ===== Advies genereren =====

function wineAdviceLong(type, weather) {
  let advice = "";

  if (type === "fruit") advice += "Vruchtendag – aromatische en fruitige wijnen openen vaak mooier. ";
  if (type === "flower") advice += "Bloemdag – elegante, verfijnde wijnen tonen meer nuance. ";
  if (type === "leaf") advice += "Bladdag – frisse wijnen kunnen wat vlakker overkomen. ";
  if (type === "root") advice += "Worteldag – tanninerijke wijnen kunnen strenger smaken. ";

  if (!hasWeatherData(weather)) {
    return advice.trim();
  }

  const pressure = weather.pressure;
  const temp = weather.temp;

  if (pressure > 1015) advice += "Hoge luchtdruk: wijn opent makkelijker. ";
  else if (pressure < 1005) advice += "Lage luchtdruk: wijn blijft vaker gesloten. ";
  else advice += "Gemiddelde luchtdruk: neutrale invloed. ";

  if (temp > 22) advice += "Warm weer: rosé of frisse witte wijn past beter. ";
  else if (temp < 10) advice += "Koud weer: vollere rode wijn sluit beter aan. ";
  else advice += "Gemiddelde temperatuur: zowel wit als rood kan goed werken. ";

  if (isRainy(weather)) {
    advice += "Regenachtig weer: comfortwijnen kunnen extra prettig zijn. ";
  }

  return advice.trim();
}

function extractConclusionSentence(text) {
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const lower = s.toLowerCase();
    for (const kw of CONCLUSIE_KEYWORDS) {
      if (lower.includes(kw)) {
        return cleanConclusionSentence(s.trim());
      }
    }
  }
  return cleanConclusionSentence(sentences[sentences.length - 1].trim());
}

function cleanConclusionSentence(sentence) {
  let s = sentence;
  s = s.replace(/^.*temperatuur:\s*/i, "");
  s = s.replace(/^.*weer:\s*/i, "");
  s = s.replace(/^hoge luchtdruk:\s*/i, "");
  s = s.replace(/^lage luchtdruk:\s*/i, "");
  s = s.replace(/^regenachtig.*?:\s*/i, "");
  s = s.replace(/^warm weer:\s*/i, "");
  s = s.replace(/^koud weer:\s*/i, "");
  s = s.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ===== Wijnmatch =====

function matchWines(type, weather) {
  const temp = hasWeatherData(weather) ? weather.temp : null;

  return wines.filter(function (w) {
    if (type === "fruit" && w.style === "aromatisch") return true;
    if (type === "flower" && w.style === "elegant") return true;
    if (type === "leaf" && w.style === "fris") return true;
    if (type === "root" && w.style === "tanninerijk") return true;

    if (temp != null && temp > 22 && w.style === "fris") return true;
    if (temp != null && temp < 10 && w.style === "tanninerijk") return true;

    return false;
  });
}

// ===== Modals =====

function openBackdrop(id) {
  document.getElementById(id).style.display = "flex";
}

function closeBackdrop(id) {
  document.getElementById(id).style.display = "none";
}

// ===== Voorraad UI =====

function renderInventoryList() {
  const list = document.getElementById("inventoryList");
  if (!wines.length) {
    list.innerHTML = "<em>Geen flessen toegevoegd.</em>";
    return;
  }

  list.innerHTML = "";
  wines.forEach((w, index) => {
    const row = document.createElement("div");
    row.className = "inventory-item";

    const label = document.createElement("span");
    label.textContent = `${w.name} – ${w.grape} (${w.region}) – ${w.style}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inventory-remove";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      wines.splice(index, 1);
      saveWines();
      renderInventoryList();
      renderCalendar(currentYear, currentMonth);
    });

    row.appendChild(label);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// ===== Kalender renderen =====

function setWeatherStatus(text) {
  const el = document.getElementById("weatherStatus");
  if (el) el.textContent = text;
}

function renderCalendarDOM(year, month, weatherMap) {
  const container = document.getElementById("weeksContainer");
  container.innerHTML = "";

  const monthGrid = document.createElement("div");
  monthGrid.className = "month-grid";

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = startOffset + daysInMonth;

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";

    if (cellIndex < startOffset || cellIndex >= startOffset + daysInMonth) {
      cell.classList.add("empty-cell");
      const empty = document.createElement("div");
      empty.className = "day empty";
      cell.appendChild(empty);
      monthGrid.appendChild(cell);
      continue;
    }

    const day = cellIndex - startOffset + 1;
    const slots = buildSlots(year, month, day);
    const weather = weatherMap[dateKey(year, month, day)] || unknownWeather();
    const mainType = dominantType(slots);

    const dayDiv = document.createElement("div");
    dayDiv.className = "day " + mainType;

    let html =
      '<div class="day-number"><strong>' + day + "</strong></div>" +
      '<div class="day-content">' +
      '<div class="day-weather">' + weatherLine(weather) + "</div>";

    slots.forEach(function (slot) {
      const range = formatSlotRange(slot);
      const adviceFull = wineAdviceLong(slot.type, weather);
      const conclusion = extractConclusionSentence(adviceFull);
      const matched = matchWines(slot.type, weather);
      const winesHtml = matched.length
        ? matched.map(function (wi) { return "• " + wi.name + " (" + wi.style + ")"; }).join("<br>")
        : "Geen specifieke flessen.";

      html +=
        '<div class="slot-block">' +
        '<div class="slot-title">' + range + " " + typeLabel(slot.type) + "</div>" +
        '<div class="slot-conclusion">' + conclusion + "</div>" +
        '<div class="slot-wines">' + winesHtml + "</div>" +
        "</div>";
    });

    html += "</div>";
    dayDiv.innerHTML = html;

    (function (d, m, y, s, w) {
      dayDiv.addEventListener("click", function () {
        openDayModal(d, m, y, s, w);
      });
    })(day, month, year, slots, weather);

    cell.appendChild(dayDiv);
    monthGrid.appendChild(cell);
  }

  container.appendChild(monthGrid);
}

function updateWeatherStatus(stats) {
  const place = displayLocationName(userLocation);
  const parts = ["Weer: " + place];

  if (stats.liveCount > 0) {
    parts.push(stats.liveCount + " dagen via Open-Meteo");
  }
  if (stats.unknownCount > 0) {
    parts.push(stats.unknownCount + " dagen nog niet bekend (>" + FORECAST_MAX_DAYS + " dgn)");
  }
  if (stats.unavailableCount > 0) {
    parts.push(stats.unavailableCount + " niet beschikbaar");
  }

  setWeatherStatus(parts.join(" · "));
}

async function renderCalendar(year, month) {
  currentYear = year;
  currentMonth = month;
  const requestId = ++calendarRequestId;

  const localMap = buildLocalWeatherMap(year, month);
  renderCalendarDOM(year, month, localMap);
  setWeatherStatus("Kalender geladen – weer bijwerken…");

  try {
    const result = await fetchWeatherForMonth(year, month, userLocation.lat, userLocation.lon);
    if (requestId !== calendarRequestId) return;
    renderCalendarDOM(year, month, result.weather);
    updateWeatherStatus(result);
  } catch {
    if (requestId !== calendarRequestId) return;
    updateWeatherStatus({
      liveCount: 0,
      unknownCount: Object.keys(localMap).filter(function (k) {
        return localMap[k].unknown;
      }).length,
      unavailableCount: Object.keys(localMap).filter(function (k) {
        return localMap[k].pending;
      }).length
    });
  }
}

// ===== Dagdetail modal =====

function openDayModal(day, month, year, slots, weather) {
  const titleEl = document.getElementById("dayModalTitle");
  const weatherEl = document.getElementById("dayModalWeather");
  const slotsEl = document.getElementById("dayModalSlots");
  const adviceEl = document.getElementById("dayModalAdvice");
  const winesEl = document.getElementById("dayModalWines");

  titleEl.textContent = `Dag ${day}-${month + 1}-${year}`;
  weatherEl.textContent = weatherDetail(weather);

  slotsEl.innerHTML = slots
    .map(function (s) {
      const name = s.constellation || "";
      return formatSlotRange(s) + ": " + name + " · " + typeLabel(s.type);
    })
    .join("<br>");

  adviceEl.innerHTML = slots
    .map(s => {
      const range = formatSlotRange(s);
      const adv = wineAdviceLong(s.type, weather);
      return `<strong>${range}</strong><br>${adv}`;
    })
    .join("<br><br>");

  winesEl.innerHTML = slots
    .map(s => {
      const range = formatSlotRange(s);
      const matched = matchWines(s.type, weather);

      if (!matched.length) {
        return `<strong>${range}</strong><br>Geen specifieke flessen uit jouw voorraad.`;
      }

      const list = matched.map(w => `• ${w.name} – ${w.style}`).join("<br>");
      return `<strong>${range}</strong><br>${list}`;
    })
    .join("<br><br>");

  openBackdrop("dayModalBackdrop");
}

// ===== Init & events =====

function getSelectedYearMonth() {
  const yearInput = document.getElementById("yearInput");
  const monthSelect = document.getElementById("monthSelect");
  const year = parseInt(yearInput.value, 10);
  const month = parseInt(monthSelect.value, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || year < 2000 || year > 2100) {
    return null;
  }
  return { year, month };
}

function scheduleRender() {
  savePreferences();
  clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(function () {
    const selected = getSelectedYearMonth();
    if (selected) renderCalendar(selected.year, selected.month);
  }, 200);
}

async function applyLocation() {
  const locationInput = document.getElementById("locationInput");
  const name = locationInput.value.trim();
  if (!name) return;

  savePreferences();
  const reqId = ++locationRequestId;
  setWeatherStatus("Plaats zoeken…");

  try {
    const resolved = await geocodeLocation(name);
    if (reqId !== locationRequestId) return;
    userLocation = resolved;
    saveLocation();
    locationInput.value = displayLocationName(userLocation);
    savePreferences();
    scheduleRender();
  } catch {
    if (reqId !== locationRequestId) return;
    setWeatherStatus("Plaats niet gevonden – Rotterdam blijft actief");
  }
}

function scheduleLocationApply() {
  savePreferences();
  clearTimeout(locationDebounceTimer);
  locationDebounceTimer = setTimeout(applyLocation, 700);
}

function initEventListeners() {
  const yearInput = document.getElementById("yearInput");
  const monthSelect = document.getElementById("monthSelect");
  const locationInput = document.getElementById("locationInput");

  yearInput.addEventListener("input", scheduleRender);
  yearInput.addEventListener("change", scheduleRender);
  monthSelect.addEventListener("change", scheduleRender);
  locationInput.addEventListener("input", scheduleLocationApply);
  locationInput.addEventListener("change", applyLocation);
  locationInput.addEventListener("blur", applyLocation);

  document.body.addEventListener("click", function (e) {
    const target = e.target;

    if (clickOnId(target, "helpBtn")) {
      openBackdrop("helpBackdrop");
      return;
    }
    if (target.id === "helpClose") {
      closeBackdrop("helpBackdrop");
      return;
    }
    if (target.id === "helpBackdrop") {
      closeBackdrop("helpBackdrop");
      return;
    }

    if (clickOnId(target, "inventoryBtn")) {
      renderInventoryList();
      openBackdrop("inventoryBackdrop");
      return;
    }
    if (target.id === "inventoryClose") {
      closeBackdrop("inventoryBackdrop");
      return;
    }
    if (target.id === "inventoryBackdrop") {
      closeBackdrop("inventoryBackdrop");
      return;
    }

    if (target.id === "dayModalClose") {
      closeBackdrop("dayModalBackdrop");
      return;
    }
    if (target.id === "dayModalBackdrop") {
      closeBackdrop("dayModalBackdrop");
      return;
    }

    if (target.id === "addWineBtn") {
      const name = document.getElementById("wineNameInput").value.trim();
      const grape = document.getElementById("wineGrapeInput").value.trim();
      const region = document.getElementById("wineRegionInput").value.trim();
      const style = document.getElementById("wineStyleInput").value;

      if (!name || !grape || !region) {
        alert("Vul naam, druif en regio in.");
        return;
      }

      wines.push({ name: name, grape: grape, region: region, style: style });
      saveWines();
      document.getElementById("wineNameInput").value = "";
      document.getElementById("wineGrapeInput").value = "";
      document.getElementById("wineRegionInput").value = "";
      document.getElementById("wineStyleInput").value = "aromatisch";
      renderInventoryList();
      renderCalendar(currentYear, currentMonth);
    }
  });
}

function bootApp() {
  loadWines();
  loadLocation();
  loadPreferences();
  initEventListeners();

  const selected = getSelectedYearMonth();
  if (selected) {
    renderCalendar(selected.year, selected.month);
  }

  const placeInput = document.getElementById("locationInput").value.trim();
  if (placeInput && placeInput.toLowerCase() !== displayLocationName(userLocation).toLowerCase()) {
    applyLocation();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}
