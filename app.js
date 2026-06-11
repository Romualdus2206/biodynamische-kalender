// ===== Basisconfiguratie =====

const APP_VERSION = "1.0.10";
const VERSION_RELOAD_PARAM = "_rv";
const VERSION_CHECK_MAX_RELOADS = 2;

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
  "minder geschikt",
  "geschikt",
  "kan vlak zijn",
  "kan strenger smaken"
];

const DEFAULT_LOCATION = { name: "Rotterdam", lat: 51.9225, lon: 4.47917 };
const DEFAULT_PREFS = { year: 2026, month: 5, place: "Rotterdam" };
const DEFAULT_TIMEZONE = "Europe/Amsterdam";
const MONTH_NAMES_SHORT_LOWER = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec"
];
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
let dialRefreshTimer;
let viewMode = "month";
let selectedDay;
let selectedMonth;
let selectedYear;
let weekMonday;
let weekDayIndex = 0;
let weekSlotIndex = null;
let weekDisplayHour = null;
let dayClockHour = null;
let userTimezone = DEFAULT_TIMEZONE;
let dialPopupMode = "day";
let agendaPickMonday;
let agendaCalYear;
let agendaCalMonth;
let wineMomentOpen = false;

const WEEKDAY_NAMES_LONG = [
  "zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"
];
const WEEKDAY_NAMES_UPPER = [
  "ZONDAG", "MAANDAG", "DINSDAG", "WOENSDAG", "DONDERDAG", "VRIJDAG", "ZATERDAG"
];
const WEEKDAY_LABELS_DIAL = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];
const MONTH_NAMES_LONG = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"
];
const MONTH_NAMES_SHORT = [
  "JAN", "FEB", "MAA", "APR", "MEI", "JUN",
  "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"
];
const DIAL_HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

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
      { name: "Sancerre 2022", grape: "Sauvignon Blanc", region: "Loire", style: "sappig" },
      { name: "Provence Rosé 2023", grape: "Grenache", region: "Provence", style: "fruitig" },
      { name: "Chablis 2021", grape: "Chardonnay", region: "Bourgogne", style: "mineraal" }
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

function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function allTimezones() {
  try {
    if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch {
    /* fallback */
  }
  return [
    "Europe/Amsterdam", "Europe/Brussels", "Europe/Berlin", "Europe/London",
    "Europe/Paris", "Europe/Rome", "Europe/Madrid", "Europe/Zurich",
    "Europe/Vienna", "America/New_York", "America/Los_Angeles",
    "America/Chicago", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "UTC"
  ];
}

function loadTimezone() {
  const raw = storageGet("timezone");
  userTimezone = raw || deviceTimezone();
}

function saveTimezone() {
  storageSet("timezone", userTimezone);
}

function zonedTimeParts(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const parts = {};
  dtf.formatToParts(date).forEach(function (p) {
    if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
  });
  return parts;
}

function utcFromZoned(y, m, d, h, mi, s, tz) {
  let utc = Date.UTC(y, m, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const p = zonedTimeParts(new Date(utc), tz);
    const diff = Date.UTC(y, m, d, h, mi, s) -
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    utc += diff;
  }
  return new Date(utc);
}

function toDecimalHour(date) {
  const p = zonedTimeParts(date, userTimezone);
  return p.hour + p.minute / 60 + p.second / 3600;
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
  const dayStart = utcFromZoned(year, month, day, 0, 0, 0, userTimezone);
  const nextCal = new Date(year, month, day);
  nextCal.setDate(nextCal.getDate() + 1);
  const dayEnd = utcFromZoned(
    nextCal.getFullYear(),
    nextCal.getMonth(),
    nextCal.getDate(),
    0, 0, 0,
    userTimezone
  );

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

function isGoodWineType(type) {
  return type === "fruit" || type === "flower";
}

function typeShortLabel(type) {
  if (type === "fruit") return "VRUCHT";
  if (type === "flower") return "BLOEM";
  if (type === "leaf") return "BLAD";
  if (type === "root") return "WORTEL";
  return "—";
}

function isSameCalendarDate(y, m, d, date) {
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
}

function isToday(y, m, d) {
  const p = zonedTimeParts(new Date(), userTimezone);
  return p.year === y && p.month - 1 === m && p.day === d;
}

function activeHourForDate(y, m, d) {
  if (isToday(y, m, d)) {
    return toDecimalHour(new Date());
  }
  return 12;
}

function slotAtHour(slots, hour) {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const end = slot.end >= 24 ? 24 : slot.end;
    if (hour >= slot.start && hour < end) return { slot: slot, index: i };
  }
  return { slot: slots[slots.length - 1], index: slots.length - 1 };
}

function hourToDialAngle(hour) {
  return (hour / 24) * 360 - 90;
}

function polarToXY(cx, cy, radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  };
}

function angleRingSegmentPath(cx, cy, rOuter, rInner, startDeg, endDeg, gapDeg) {
  const gap = gapDeg || 0;
  const start = startDeg + gap / 2;
  const end = endDeg - gap / 2;
  const span = endDeg - startDeg;
  const largeArc = span > 180 ? 1 : 0;

  const oStart = polarToXY(cx, cy, rOuter, start);
  const oEnd = polarToXY(cx, cy, rOuter, end);
  const iEnd = polarToXY(cx, cy, rInner, end);
  const iStart = polarToXY(cx, cy, rInner, start);

  return (
    "M " + oStart.x + " " + oStart.y +
    " A " + rOuter + " " + rOuter + " 0 " + largeArc + " 1 " + oEnd.x + " " + oEnd.y +
    " L " + iEnd.x + " " + iEnd.y +
    " A " + rInner + " " + rInner + " 0 " + largeArc + " 0 " + iStart.x + " " + iStart.y +
    " Z"
  );
}

function ringSegmentPath(cx, cy, rOuter, rInner, startHour, endHour, gapDeg) {
  const gap = gapDeg || 0;
  const start = hourToDialAngle(startHour) + gap / 2;
  const endHourVal = endHour >= 24 ? 24 : endHour;
  const end = hourToDialAngle(endHourVal) - gap / 2;
  const span = endHourVal - startHour;
  const largeArc = span > 12 ? 1 : 0;

  const oStart = polarToXY(cx, cy, rOuter, start);
  const oEnd = polarToXY(cx, cy, rOuter, end);
  const iEnd = polarToXY(cx, cy, rInner, end);
  const iStart = polarToXY(cx, cy, rInner, start);

  return (
    "M " + oStart.x + " " + oStart.y +
    " A " + rOuter + " " + rOuter + " 0 " + largeArc + " 1 " + oEnd.x + " " + oEnd.y +
    " L " + iEnd.x + " " + iEnd.y +
    " A " + rInner + " " + rInner + " 0 " + largeArc + " 0 " + iStart.x + " " + iStart.y +
    " Z"
  );
}

function typeDecorSvg(type) {
  const stroke = "#5c4a38";
  const fill = "#8a7358";
  const fillSoft = "#a89278";
  if (type === "fruit") {
    return '<g opacity="0.95">' +
      '<path d="M13 7 C12 9 11.5 11 12 13" stroke="' + stroke + '" fill="none" stroke-width="1" stroke-linecap="round"/>' +
      '<path d="M13 13 Q16 10 18.5 11.5 Q15.5 13 13 13" fill="' + fillSoft + '" stroke="' + stroke + '" stroke-width="0.7"/>' +
      '<circle cx="8.5" cy="19" r="4.2" fill="' + fill + '" opacity="0.45" stroke="' + stroke + '" stroke-width="0.9"/>' +
      '<circle cx="13.5" cy="16.5" r="4.4" fill="' + fill + '" opacity="0.5" stroke="' + stroke + '" stroke-width="0.9"/>' +
      '<circle cx="18" cy="19.5" r="4" fill="' + fill + '" opacity="0.45" stroke="' + stroke + '" stroke-width="0.9"/>' +
      '<circle cx="10.5" cy="25" r="3.8" fill="' + fill + '" opacity="0.4" stroke="' + stroke + '" stroke-width="0.9"/>' +
      '<circle cx="15.5" cy="26" r="3.7" fill="' + fill + '" opacity="0.4" stroke="' + stroke + '" stroke-width="0.9"/>' +
      '<path d="M13 24 L13 36" stroke="' + stroke + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      "</g>";
  }
  if (type === "flower") {
    return '<g opacity="0.95">' +
      '<path d="M13 36 L13 16" stroke="' + stroke + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="13" cy="12.5" rx="2.2" ry="3.2" fill="' + fillSoft + '" stroke="' + stroke + '" stroke-width="0.8"/>' +
      '<ellipse cx="9" cy="15.5" rx="2.4" ry="3.4" fill="' + fill + '" opacity="0.5" stroke="' + stroke + '" stroke-width="0.8" transform="rotate(-35 9 15.5)"/>' +
      '<ellipse cx="17" cy="15.5" rx="2.4" ry="3.4" fill="' + fill + '" opacity="0.5" stroke="' + stroke + '" stroke-width="0.8" transform="rotate(35 17 15.5)"/>' +
      '<ellipse cx="10" cy="19.5" rx="2.3" ry="3.2" fill="' + fill + '" opacity="0.45" stroke="' + stroke + '" stroke-width="0.8" transform="rotate(-70 10 19.5)"/>' +
      '<ellipse cx="16" cy="19.5" rx="2.3" ry="3.2" fill="' + fill + '" opacity="0.45" stroke="' + stroke + '" stroke-width="0.8" transform="rotate(70 16 19.5)"/>' +
      '<circle cx="13" cy="16.5" r="2.2" fill="' + fillSoft + '" stroke="' + stroke + '" stroke-width="0.7"/>' +
      '<path d="M11 30 Q8 28 9 25 Q11 27 13 28" fill="' + fillSoft + '" opacity="0.55" stroke="' + stroke + '" stroke-width="0.7"/>' +
      '<path d="M15 30 Q18 28 17 25 Q15 27 13 28" fill="' + fillSoft + '" opacity="0.55" stroke="' + stroke + '" stroke-width="0.7"/>' +
      "</g>";
  }
  if (type === "leaf") {
    return '<g opacity="0.95">' +
      '<path d="M13 36 Q6 30 5.5 21 Q6 12 13 8 Q20 12 20.5 21 Q20 30 13 36 Z" fill="' + fill + '" opacity="0.35" stroke="' + stroke + '" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M13 34 Q13 24 13 10" stroke="' + stroke + '" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
      '<path d="M13 28 Q17 24 19 20 M13 22 Q9 19 7 16 M13 16 Q16 13 18 11" stroke="' + stroke + '" stroke-width="0.7" fill="none" stroke-linecap="round" opacity="0.85"/>' +
      '<path d="M13 36 L13 38" stroke="' + stroke + '" stroke-width="1" stroke-linecap="round"/>' +
      "</g>";
  }
  if (type === "root") {
    return '<g opacity="0.95">' +
      '<line x1="4" y1="14" x2="22" y2="14" stroke="' + stroke + '" stroke-width="0.9" stroke-linecap="round"/>' +
      '<path d="M13 14 L13 5" stroke="' + stroke + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '<path d="M13 8 Q11 10 10 12 M13 8 Q15 10 16 12" stroke="' + stroke + '" stroke-width="0.75" fill="none" stroke-linecap="round" opacity="0.85"/>' +
      '<path d="M13 14 Q12.5 20 13 27 Q13 33 13 38" stroke="' + stroke + '" stroke-width="1" fill="none" stroke-linecap="round"/>' +
      '<path d="M13 17 Q8 21 6 27 Q4.5 32 6.5 37" stroke="' + stroke + '" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
      '<path d="M13 17 Q18 21 20 27 Q21.5 32 19.5 37" stroke="' + stroke + '" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
      '<path d="M13 21 Q9 25 8 31 M13 21 Q17 25 18 31" stroke="' + stroke + '" stroke-width="0.75" fill="none" stroke-linecap="round" opacity="0.85"/>' +
      '<path d="M13 25 Q10 29 9.5 35 M13 25 Q16 29 16.5 35" stroke="' + stroke + '" stroke-width="0.7" fill="none" stroke-linecap="round" opacity="0.8"/>' +
      "</g>";
  }
  return "";
}

function redWineGlassSvg(isGood, type) {
  const decor = typeDecorSvg(type);
  const decorCenterX = 13;
  const decorCenterY = 22;
  const leftDecorX = 14;
  const rightDecorX = 122;
  const decorScale = 1.45;
  const gx = 26;
  const wineFill = isGood
    ? '<path d="M' + (34 + gx) + ' 16 C' + (38 + gx) + " 15 " + (46 + gx) + " 15 " + (50 + gx) + ' 16 C' + (52 + gx) + " 24 " + (51 + gx) + " 32 " + (48 + gx) + " 37 C" + (45 + gx) + " 40 " + (39 + gx) + " 40 " + (36 + gx) + " 37 C" + (33 + gx) + " 32 " + (32 + gx) + " 24 " + (34 + gx) + ' 16 Z" fill="#7a2332"/>' +
      '<path d="M' + (35 + gx) + " 18 C" + (38 + gx) + " 17.5 " + (46 + gx) + " 17.5 " + (49 + gx) + " 18 C" + (50 + gx) + " 22 " + (49 + gx) + " 27 " + (46.5 + gx) + " 30 C" + (44 + gx) + " 32 " + (40 + gx) + " 32 " + (37.5 + gx) + " 30 C" + (35 + gx) + " 27 " + (34 + gx) + " 22 " + (35 + gx) + ' 18 Z" fill="#5c1828" opacity="0.85"/>'
    : "";

  function decorSideMarkup(flip) {
    const anchorX = flip ? rightDecorX : leftDecorX;
    const scaleX = flip ? -decorScale : decorScale;
    return (
      '<g transform="translate(' + anchorX + " " + decorCenterY + ") scale(" + scaleX + " " + decorScale + ") translate(" + -decorCenterX + " " + -decorCenterY + ')">' +
      decor +
      "</g>"
    );
  }

  return (
    '<svg viewBox="0 0 136 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    decorSideMarkup(false) +
    decorSideMarkup(true) +
    '<path d="M' + (34 + gx) + " 13 C" + (34 + gx) + " 11 " + (50 + gx) + " 11 " + (50 + gx) + " 13 C" + (52 + gx) + " 21 " + (51 + gx) + " 29 " + (48 + gx) + " 34 C" + (46 + gx) + " 37 " + (38 + gx) + " 37 " + (36 + gx) + " 34 C" + (33 + gx) + " 29 " + (32 + gx) + " 21 " + (34 + gx) + ' 13 Z" fill="#faf6ee" stroke="#1a1a1a" stroke-width="1" stroke-linejoin="round"/>' +
    wineFill +
    '<line x1="' + (42 + gx) + '" y1="37" x2="' + (42 + gx) + '" y2="52" stroke="#1a1a1a" stroke-width="1"/>' +
    '<ellipse cx="' + (42 + gx) + '" cy="55" rx="6.5" ry="2" fill="none" stroke="#1a1a1a" stroke-width="1"/>' +
    "</svg>"
  );
}

function mondayOfWeek(y, m, d) {
  const date = new Date(y, m, d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekDayDate(dayIndex) {
  const date = new Date(weekMonday);
  date.setDate(date.getDate() + dayIndex);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

function syncWeekFromSelectedDate() {
  weekMonday = mondayOfWeek(selectedYear, selectedMonth, selectedDay);
  weekDayIndex = (new Date(selectedYear, selectedMonth, selectedDay).getDay() + 6) % 7;
}

function formatWeekRangeLabel(monday) {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const left = monday.getDate() + " " + MONTH_NAMES_SHORT[monday.getMonth()];
  const right = sunday.getDate() + " " + MONTH_NAMES_SHORT[sunday.getMonth()];
  return left + " - " + right;
}

function formatClockFromHour(hour) {
  const total = ((hour % 24) + 24) % 24;
  return formatHour(total);
}

function formatDialDateTime(day, month, hour) {
  const total = ((hour % 24) + 24) % 24;
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60) % 60;
  const monthLabel = MONTH_NAMES_SHORT_LOWER[month] || "???";
  return day + " " + monthLabel + " " + h + ":" + String(m).padStart(2, "0");
}

const WEEK_DAY_GAP = 3.2;
const WEEK_DAY_SPAN = (360 - 7 * WEEK_DAY_GAP) / 7;

function weekSectorStartDial(dayIndex) {
  return dayIndex * (WEEK_DAY_SPAN + WEEK_DAY_GAP);
}

function weekDayAngle(dayIndex) {
  return weekSectorStartDial(dayIndex) + WEEK_DAY_SPAN / 2 - 90;
}

function weekDayStartAngle(dayIndex) {
  return weekSectorStartDial(dayIndex) - 90;
}

function dialPointerHit(event, wrap) {
  const rect = wrap.getBoundingClientRect();
  const clientX = event.clientX != null ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
  const clientY = event.clientY != null ? event.clientY : (event.touches && event.touches[0] ? event.touches[0].clientY : 0);
  const x = clientX - rect.left - rect.width / 2;
  const y = clientY - rect.top - rect.height / 2;
  const dist = Math.sqrt(x * x + y * y) / (rect.width / 2);
  let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
  if (angle < 0) angle += 360;
  return { dist: dist, angle: angle, hour: (angle / 360) * 24 };
}

function weekClickToSelection(angle) {
  const norm = ((angle % 360) + 360) % 360;
  let dayIndex = 0;
  let frac = 0;

  let found = false;
  for (let i = 0; i < 7; i++) {
    const start = weekSectorStartDial(i);
    const end = start + WEEK_DAY_SPAN;
    if (norm >= start && norm < end) {
      dayIndex = i;
      frac = (norm - start) / WEEK_DAY_SPAN;
      found = true;
      break;
    }
  }
  if (!found) {
    let bestDist = Infinity;
    for (let i = 0; i < 7; i++) {
      const center = weekSectorStartDial(i) + WEEK_DAY_SPAN / 2;
      let dist = Math.abs(norm - center);
      if (dist > 180) dist = 360 - dist;
      if (dist < bestDist) {
        bestDist = dist;
        dayIndex = i;
        frac = 0.5;
      }
    }
  }

  const day = weekDayDate(dayIndex);
  const slots = buildSlots(day.year, day.month, day.day);
  let acc = 0;

  for (let i = 0; i < slots.length; i++) {
    const dur = slots[i].end - slots[i].start;
    const endFrac = (acc + dur) / 24;
    if (frac <= endFrac || i === slots.length - 1) {
      const startFrac = acc / 24;
      const fracInSlot = Math.max(0, Math.min(1, (frac - startFrac) / (dur / 24 || 1)));
      const displayHour = slots[i].start + fracInSlot * dur;
      return {
        dayIndex: dayIndex,
        slotIndex: i,
        slot: slots[i],
        displayHour: displayHour
      };
    }
    acc += dur;
  }

  return {
    dayIndex: dayIndex,
    slotIndex: 0,
    slot: slots[0],
    displayHour: slots[0].start
  };
}

function defaultWeekSelection(dayIndex) {
  const day = weekDayDate(dayIndex);
  const slots = buildSlots(day.year, day.month, day.day);
  if (isToday(day.year, day.month, day.day)) {
    const hour = activeHourForDate(day.year, day.month, day.day);
    const picked = slotAtHour(slots, hour);
    return {
      slotIndex: picked.index,
      slot: picked.slot,
      displayHour: hour
    };
  }
  return {
    slotIndex: 0,
    slot: slots[0],
    displayHour: slots[0].start
  };
}

function hourToWeekAngle(dayIndex, hour) {
  const dayStart = weekDayStartAngle(dayIndex);
  return dayStart + (hour / 24) * WEEK_DAY_SPAN;
}

function slotAnglesInWeekDay(dayIndex, slots, slotIndex) {
  const dayStart = weekDayStartAngle(dayIndex);
  let acc = 0;
  for (let i = 0; i < slotIndex; i++) {
    acc += slots[i].end - slots[i].start;
  }
  const slot = slots[slotIndex];
  const dur = slot.end - slot.start;
  const startFrac = acc / 24;
  const endFrac = (acc + dur) / 24;
  const midFrac = startFrac + dur / 48;
  return {
    start: dayStart + startFrac * WEEK_DAY_SPAN,
    end: dayStart + endFrac * WEEK_DAY_SPAN,
    center: dayStart + midFrac * WEEK_DAY_SPAN
  };
}

const DIAL_RING_INNER = 108;
const DIAL_RING_OUTER = 132;
const DIAL_LABEL_RADIUS = 155;

function dialLabelRotation(angleDeg) {
  let rotate = angleDeg + 90;
  const norm = ((angleDeg % 360) + 360) % 360;
  if (norm >= 90 && norm < 270) rotate += 180;
  return rotate;
}

function dialLabelMarkup(cx, cy, radius, angleDeg, label, weight) {
  const pos = polarToXY(cx, cy, radius, angleDeg);
  const rotate = dialLabelRotation(angleDeg);
  return (
    '<text x="' + pos.x + '" y="' + pos.y +
    '" transform="rotate(' + rotate + " " + pos.x + " " + pos.y + ')"' +
    ' text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="' + (weight || 400) + '"' +
    ' fill="#1a1a1a" font-family="Georgia, serif">' + label + "</text>"
  );
}

function updateDialCenter(verdictEl, iconEl, typeEl, timeEl, slot, displayHour, day, month) {
  const isGood = isGoodWineType(slot.type);
  if (verdictEl) {
    verdictEl.textContent = isGood ? "JA" : "NEE";
    verdictEl.classList.toggle("is-good", isGood);
    verdictEl.classList.toggle("is-bad", !isGood);
  }
  if (iconEl) iconEl.innerHTML = redWineGlassSvg(isGood, slot.type);
  if (typeEl) typeEl.textContent = typeShortLabel(slot.type);
  if (timeEl) timeEl.textContent = formatDialDateTime(day, month, displayHour);
}

function renderInnerDialRing(svg, slots, activeHour, cx, cy, rOuter, rInner, rLabel, rPin, tan, good) {
  slots.forEach(function (slot) {
    const end = slot.end >= 24 ? 24 : slot.end;
    const fill = isGoodWineType(slot.type) ? good : tan;
    svg += '<path d="' + ringSegmentPath(cx, cy, rOuter, rInner, slot.start, end, 0.55) + '" fill="' + fill + '"/>';
  });

  const active = slotAtHour(slots, activeHour).slot;
  const activeEnd = active.end >= 24 ? 24 : active.end;
  const activeGood = isGoodWineType(active.type);
  const selStroke = activeGood ? "#f5efe4" : "#1a1a1a";
  svg += '<path d="' + ringSegmentPath(cx, cy, rOuter + 2, rInner - 2, active.start, activeEnd, 0.2) + '" fill="none" stroke="' + selStroke + '" stroke-width="3" opacity="0.95"/>';

  const pinAngle = hourToDialAngle(activeHour);
  const tickIn = polarToXY(cx, cy, rInner - 3, pinAngle);
  const tickOut = polarToXY(cx, cy, rOuter + 3, pinAngle);
  svg += '<line x1="' + tickIn.x + '" y1="' + tickIn.y + '" x2="' + tickOut.x + '" y2="' + tickOut.y + '" stroke="' + selStroke + '" stroke-width="2.5" stroke-linecap="round"/>';

  for (let hour = 0; hour < 24; hour++) {
    const a = hourToDialAngle(hour);
    const isMajor = DIAL_HOUR_LABELS.indexOf(hour) >= 0;
    const p1 = polarToXY(cx, cy, rInner - (isMajor ? 2 : 1), a);
    const p2 = polarToXY(cx, cy, rOuter + (isMajor ? 2 : 1), a);
    svg += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="#1a1a1a" stroke-width="' + (isMajor ? "0.55" : "0.3") + '"/>';
  }

  DIAL_HOUR_LABELS.forEach(function (hour) {
    const label = hour === 0 ? "0:00" : String(hour) + ":00";
    svg += dialLabelMarkup(cx, cy, rLabel, hourToDialAngle(hour), label, 400);
  });

  const pin = polarToXY(cx, cy, rPin, pinAngle);
  svg += dialPinMarkup(pin.x, pin.y, pinAngle, activeGood);
  svg += selectionDotMarkup(pin.x, pin.y, activeGood);
  return svg;
}

function renderWeekDialSvg(selectedDayIdx, selectedSlotIdx, displayHour) {
  const cx = 160;
  const cy = 160;
  const rOuter = DIAL_RING_OUTER;
  const rInner = DIAL_RING_INNER;
  const rLabel = DIAL_LABEL_RADIUS;
  const rPin = (rOuter + rInner) / 2;
  const tan = "#c1a98f";
  const good = "#6e2435";
  let svg = "";

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const day = weekDayDate(dayIdx);
    const slots = buildSlots(day.year, day.month, day.day);
    const dayStart = weekDayStartAngle(dayIdx);
    let acc = 0;

    slots.forEach(function (slot) {
      const dur = slot.end - slot.start;
      const startFrac = acc / 24;
      const endFrac = (acc + dur) / 24;
      acc += dur;
      const segStart = dayStart + startFrac * WEEK_DAY_SPAN;
      const segEnd = dayStart + endFrac * WEEK_DAY_SPAN;
      const fill = isGoodWineType(slot.type) ? good : tan;
      svg += '<path d="' + angleRingSegmentPath(cx, cy, rOuter, rInner, segStart, segEnd, 0.55) + '" fill="' + fill + '"/>';
    });
  }

  WEEKDAY_LABELS_DIAL.forEach(function (label, i) {
    const weight = i === selectedDayIdx ? 700 : 400;
    svg += dialLabelMarkup(cx, cy, rLabel, weekDayAngle(i), label, weight);
  });

  const selDay = weekDayDate(selectedDayIdx);
  const selSlots = buildSlots(selDay.year, selDay.month, selDay.day);
  const selSlot = selSlots[selectedSlotIdx] || selSlots[0];
  const selAngles = slotAnglesInWeekDay(selectedDayIdx, selSlots, selectedSlotIdx);
  const pinAngle = hourToWeekAngle(selectedDayIdx, displayHour);
  const activeGood = isGoodWineType(selSlot.type);
  const selStroke = activeGood ? "#f5efe4" : "#1a1a1a";
  svg += '<path d="' + angleRingSegmentPath(cx, cy, rOuter + 2, rInner - 2, selAngles.start, selAngles.end, 0.1) + '" fill="none" stroke="' + selStroke + '" stroke-width="3" opacity="0.95"/>';

  const tickIn = polarToXY(cx, cy, rInner - 3, pinAngle);
  const tickOut = polarToXY(cx, cy, rOuter + 3, pinAngle);
  svg += '<line x1="' + tickIn.x + '" y1="' + tickIn.y + '" x2="' + tickOut.x + '" y2="' + tickOut.y + '" stroke="' + selStroke + '" stroke-width="2.5" stroke-linecap="round"/>';

  const pin = polarToXY(cx, cy, rPin, pinAngle);
  svg += dialPinMarkup(pin.x, pin.y, pinAngle, activeGood);
  svg += selectionDotMarkup(pin.x, pin.y, activeGood);

  return svg;
}

function dialPinMarkup(x, y, angleDeg, onDark) {
  const fill = onDark ? "#f5efe4" : "#1a1a1a";
  const hole = onDark ? "#6e2435" : "#f0e6d6";
  return (
    '<g transform="translate(' + x + " " + y + ") rotate(" + (angleDeg + 90) + ')">' +
    '<path d="M0,-11 C4,-5 4,3 0,10 C-4,3 -4,-5 0,-11 Z" fill="' + fill + '" stroke="#1a1a1a" stroke-width="0.5"/>' +
    '<circle cx="0" cy="1" r="3.2" fill="' + hole + '" stroke="#1a1a1a" stroke-width="0.6"/>' +
    "</g>"
  );
}

function selectionDotMarkup(x, y, onDark) {
  const stroke = onDark ? "#f5efe4" : "#1a1a1a";
  const fill = onDark ? "#f5efe4" : "#1a1a1a";
  return (
    '<circle cx="' + x + '" cy="' + y + '" r="5" fill="none" stroke="' + stroke + '" stroke-width="1.2" opacity="0.85"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="2" fill="' + fill + '"/>'
  );
}

function renderDayDialSvg(slots, activeHour) {
  const cx = 160;
  const cy = 160;
  const rOuter = DIAL_RING_OUTER;
  const rInner = DIAL_RING_INNER;
  const rLabel = DIAL_LABEL_RADIUS;
  const rPin = (rOuter + rInner) / 2;
  const tan = "#c1a98f";
  const good = "#6e2435";
  let svg = "";

  svg = renderInnerDialRing(svg, slots, activeHour, cx, cy, rOuter, rInner, rLabel, rPin, tan, good);
  return svg;
}

function updateDayDateLabels(y, m, d) {
  const date = new Date(y, m, d);
  const weekdayEl = document.getElementById("dayWeekday");
  const dateShortEl = document.getElementById("dayDateShort");
  if (weekdayEl) weekdayEl.textContent = WEEKDAY_NAMES_LONG[date.getDay()];
  if (dateShortEl) dateShortEl.textContent = d + " " + MONTH_NAMES_LONG[m];
}

function formatDialCenterTime(y, m, d, activeSlot) {
  if (isToday(y, m, d)) {
    const now = new Date();
    return now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
  }
  const end = activeSlot.end >= 24 ? 0 : activeSlot.end;
  return formatHour(end);
}

function syncInputsToSelectedDate() {
  const yearInput = document.getElementById("yearInput");
  const monthSelect = document.getElementById("monthSelect");
  if (yearInput) yearInput.value = String(selectedYear);
  if (monthSelect) monthSelect.value = String(selectedMonth);
  savePreferences();
}

function setSelectedDate(y, m, d) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  selectedYear = y;
  selectedMonth = m;
  selectedDay = Math.max(1, Math.min(d, daysInMonth));
  syncInputsToSelectedDate();
}

function navigateSelectedDay(delta) {
  const date = new Date(selectedYear, selectedMonth, selectedDay + delta);
  setSelectedDate(date.getFullYear(), date.getMonth(), date.getDate());
  dayClockHour = null;
  if (wineMomentOpen) renderWineMomentView();
  else if (viewMode === "day") renderDayView();
}

function navigateWeek(delta) {
  if (!weekMonday) syncWeekFromSelectedDate();
  weekMonday.setDate(weekMonday.getDate() + delta * 7);
  weekSlotIndex = null;
  weekDisplayHour = null;
  const d = weekDayDate(weekDayIndex);
  setSelectedDate(d.year, d.month, d.day);
  if (wineMomentOpen) renderWineMomentView();
  else renderWeekDialView();
}

function setViewMode(mode) {
  if (mode !== "month" && mode !== "day" && mode !== "week") mode = "month";
  viewMode = mode;

  document.body.classList.remove("view-month", "view-day", "view-week");
  document.body.classList.add("view-" + mode);

  const footer = document.getElementById("dialViewFooter");
  const dayBtn = document.getElementById("viewDayBtn");
  const weekBtn = document.getElementById("viewWeekBtn");
  if (footer) footer.hidden = mode === "month";
  if (dayBtn) {
    dayBtn.classList.toggle("is-active", mode === "day");
    dayBtn.setAttribute("aria-pressed", mode === "day" ? "true" : "false");
  }
  if (weekBtn) {
    weekBtn.classList.toggle("is-active", mode === "week");
    weekBtn.setAttribute("aria-pressed", mode === "week" ? "true" : "false");
  }

  if (mode === "day") {
    dayClockHour = null;
    renderDayView();
    startDialRefresh();
  } else if (mode === "week") {
    syncWeekFromSelectedDate();
    weekSlotIndex = null;
    weekDisplayHour = null;
    renderWeekDialView();
    startDialRefresh();
  } else {
    stopDialRefresh();
    renderCalendar(selectedYear, selectedMonth);
  }
}

function renderDayDialInto(ids, y, m, d, clockHour) {
  const dialEl = document.getElementById(ids.dial);
  if (!dialEl) return;

  const slots = buildSlots(y, m, d);
  const defaultHour = activeHourForDate(y, m, d);
  const displayHour = clockHour !== null && clockHour !== undefined ? clockHour : defaultHour;
  const active = slotAtHour(slots, displayHour).slot;

  if (ids.weekday) {
    const date = new Date(y, m, d);
    const weekdayEl = document.getElementById(ids.weekday);
    const dateShortEl = document.getElementById(ids.dateShort);
    if (weekdayEl) weekdayEl.textContent = WEEKDAY_NAMES_LONG[date.getDay()];
    if (dateShortEl) dateShortEl.textContent = d + " " + MONTH_NAMES_LONG[m];
  }

  dialEl.innerHTML = renderDayDialSvg(slots, displayHour);
  updateDialCenter(
    document.getElementById(ids.verdict),
    document.getElementById(ids.icon),
    document.getElementById(ids.type),
    document.getElementById(ids.time),
    active,
    displayHour,
    d,
    m
  );
}

function renderWeekDialInto(ids) {
  if (!weekMonday) syncWeekFromSelectedDate();

  const dialEl = document.getElementById(ids.dial);
  if (!dialEl) return;

  const defaults = defaultWeekSelection(weekDayIndex);
  const slotIndex = weekSlotIndex !== null ? weekSlotIndex : defaults.slotIndex;
  const displayHour = weekDisplayHour !== null ? weekDisplayHour : defaults.displayHour;
  const d = weekDayDate(weekDayIndex);
  const slots = buildSlots(d.year, d.month, d.day);
  const active = slots[slotIndex] || defaults.slot;

  if (ids.range) {
    const rangeEl = document.getElementById(ids.range);
    if (rangeEl) rangeEl.textContent = formatWeekRangeLabel(weekMonday);
  }

  dialEl.innerHTML = renderWeekDialSvg(weekDayIndex, slotIndex, displayHour);
  updateDialCenter(
    document.getElementById(ids.verdict),
    document.getElementById(ids.icon),
    document.getElementById(ids.type),
    document.getElementById(ids.time),
    active,
    displayHour,
    d.day,
    d.month
  );
}

const DAY_DIAL_IDS = {
  dial: "dayDial",
  verdict: "dialVerdict",
  icon: "dialIcon",
  type: "dialType",
  time: "dialNextTime",
  weekday: "dayWeekday",
  dateShort: "dayDateShort"
};

const WM_DAY_IDS = {
  dial: "wmDayDial",
  verdict: "wmDayVerdict",
  icon: "wmDayIcon",
  type: "wmDayType",
  time: "wmDayTime",
  weekday: "wmDayWeekday",
  dateShort: "wmDayDateShort"
};

const WEEK_DIAL_IDS = {
  dial: "weekDial",
  verdict: "weekDialVerdict",
  icon: "weekDialIcon",
  type: "weekDialType",
  time: "weekDialTime",
  range: "weekRangeText"
};

const WM_WEEK_IDS = {
  dial: "wmWeekDial",
  verdict: "wmWeekVerdict",
  icon: "wmWeekIcon",
  type: "wmWeekType",
  time: "wmWeekTime",
  range: "wmWeekRangeText"
};

function openWineMomentModal(mode) {
  dialPopupMode = mode === "week" ? "week" : "day";
  wineMomentOpen = true;
  dayClockHour = null;
  if (dialPopupMode === "week") {
    syncWeekFromSelectedDate();
    weekSlotIndex = null;
    weekDisplayHour = null;
  }
  setWineMomentPanel(dialPopupMode);
  renderWineMomentView();
  startDialRefresh();
  openBackdrop("wineMomentBackdrop");
}

function closeWineMomentModal() {
  wineMomentOpen = false;
  stopDialRefresh();
  closeBackdrop("wineMomentBackdrop");
}

function setWineMomentPanel(mode) {
  dialPopupMode = mode;
  const dayPanel = document.getElementById("wmDayPanel");
  const weekPanel = document.getElementById("wmWeekPanel");
  const dayBtn = document.getElementById("wmViewDayBtn");
  const weekBtn = document.getElementById("wmViewWeekBtn");
  if (dayPanel) {
    const show = mode === "day";
    dayPanel.hidden = !show;
    dayPanel.classList.toggle("is-active", show);
  }
  if (weekPanel) {
    const show = mode === "week";
    weekPanel.hidden = !show;
    weekPanel.classList.toggle("is-active", show);
  }
  if (dayBtn) {
    dayBtn.classList.toggle("is-active", mode === "day");
    dayBtn.setAttribute("aria-pressed", mode === "day" ? "true" : "false");
  }
  if (weekBtn) {
    weekBtn.classList.toggle("is-active", mode === "week");
    weekBtn.setAttribute("aria-pressed", mode === "week" ? "true" : "false");
  }
}

function renderWineMomentView() {
  if (dialPopupMode === "week") {
    renderWeekDialInto(WM_WEEK_IDS);
  } else {
    renderDayDialInto(WM_DAY_IDS, selectedYear, selectedMonth, selectedDay, dayClockHour);
  }
}

function openDialViewForSelectedDay() {
  openWineMomentModal("day");
}

function renderDayView() {
  renderDayDialInto(DAY_DIAL_IDS, selectedYear, selectedMonth, selectedDay, dayClockHour);
}

function renderWeekDialView() {
  renderWeekDialInto(WEEK_DIAL_IDS);
  const startEl = document.getElementById("weekStartName");
  const endEl = document.getElementById("weekEndName");
  if (startEl) startEl.textContent = "MAANDAG";
  if (endEl) endEl.textContent = "ZONDAG";
}

function populateTimezoneSelect() {
  const sel = document.getElementById("timezoneSelect");
  if (!sel) return;
  const zones = allTimezones();
  const device = deviceTimezone();
  sel.innerHTML = zones.map(function (z) {
    const label = z === device ? z + " (apparaat)" : z;
    return '<option value="' + z + '"' + (z === userTimezone ? " selected" : "") + ">" + label + "</option>";
  }).join("");
}

function openTimezoneModal() {
  populateTimezoneSelect();
  openBackdrop("timezoneBackdrop");
}

function isSameWeekMonday(y, m, d, monday) {
  const cellMonday = mondayOfWeek(y, m, d);
  return cellMonday.getTime() === monday.getTime();
}

function getAgendaMode() {
  if (wineMomentOpen) return dialPopupMode;
  if (viewMode === "week") return "week";
  return "day";
}

function renderAgendaCalendar() {
  const grid = document.getElementById("agendaCalGrid");
  const monthEl = document.getElementById("agendaCalMonth");
  const yearEl = document.getElementById("agendaCalYear");
  const hintEl = document.getElementById("agendaCalHint");
  if (!grid) return;

  const agendaMode = getAgendaMode();
  monthEl.textContent = MONTH_NAMES_LONG[agendaCalMonth];
  yearEl.textContent = String(agendaCalYear);

  const pickMonday = agendaMode === "week"
    ? (weekMonday ? new Date(weekMonday) : mondayOfWeek(selectedYear, selectedMonth, selectedDay))
    : mondayOfWeek(selectedYear, selectedMonth, selectedDay);

  if (hintEl) {
    hintEl.textContent = agendaMode === "week"
      ? "Tik een dag om die week te kiezen"
      : "Tik een dag om te kiezen";
  }

  const daysInMonth = new Date(agendaCalYear, agendaCalMonth + 1, 0).getDate();
  const startOffset = (new Date(agendaCalYear, agendaCalMonth, 1).getDay() + 6) % 7;
  grid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("span");
    empty.className = "agenda-cal-cell empty";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agenda-cal-cell";
    btn.textContent = String(d);

    const isSelected = d === selectedDay && agendaCalMonth === selectedMonth && agendaCalYear === selectedYear;
    const inWeek = agendaMode === "week" && isSameWeekMonday(agendaCalYear, agendaCalMonth, d, pickMonday);

    if (isSelected) btn.classList.add("is-selected");
    if (inWeek) btn.classList.add("in-week");

    btn.addEventListener("click", function () {
      pickAgendaDate(agendaCalYear, agendaCalMonth, d);
    });
    grid.appendChild(btn);
  }
}

function pickAgendaDate(y, m, d) {
  setSelectedDate(y, m, d);
  dayClockHour = null;
  weekSlotIndex = null;
  weekDisplayHour = null;
  syncWeekFromSelectedDate();

  const agendaMode = getAgendaMode();
  if (agendaMode === "week") {
    weekDayIndex = (new Date(y, m, d).getDay() + 6) % 7;
  }

  closeBackdrop("agendaBackdrop");

  if (wineMomentOpen) {
    setWineMomentPanel(agendaMode);
    renderWineMomentView();
  } else if (agendaMode === "week") {
    setViewMode("week");
  } else if (viewMode === "day") {
    renderDayView();
  }
  scheduleRender();
}

function openAgendaModal() {
  agendaCalYear = selectedYear;
  agendaCalMonth = selectedMonth;
  agendaPickMonday = weekMonday ? new Date(weekMonday) : mondayOfWeek(selectedYear, selectedMonth, selectedDay);
  renderAgendaCalendar();
  openBackdrop("agendaBackdrop");
}

function navigateAgendaMonth(delta) {
  agendaCalMonth += delta;
  if (agendaCalMonth < 0) {
    agendaCalMonth = 11;
    agendaCalYear -= 1;
  } else if (agendaCalMonth > 11) {
    agendaCalMonth = 0;
    agendaCalYear += 1;
  }
  renderAgendaCalendar();
}

function handleDayDialPointer(e, wrap) {
  if (!wrap) return;
  const hit = dialPointerHit(e, wrap);
  if (hit.dist < 0.74 || hit.dist > 0.9) return;
  dayClockHour = hit.hour;
  if (wineMomentOpen) renderWineMomentView();
  else renderDayView();
}

function handleWeekDialPointer(e, wrap) {
  if (!wrap) return;
  const hit = dialPointerHit(e, wrap);
  if (hit.dist < 0.78 || hit.dist > 0.94) return;
  const picked = weekClickToSelection(hit.angle);
  weekDayIndex = picked.dayIndex;
  weekSlotIndex = picked.slotIndex;
  weekDisplayHour = picked.displayHour;
  const day = weekDayDate(weekDayIndex);
  setSelectedDate(day.year, day.month, day.day);
  if (wineMomentOpen) renderWineMomentView();
  else renderWeekDialView();
}

function bindOneDialWrap(wrap, handler) {
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "1";
  wrap.style.cursor = "pointer";
  wrap.style.touchAction = "none";
  wrap.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    handler(e, wrap);
  });
}

function bindDialInteractions() {
  bindOneDialWrap(document.querySelector("#dayView .dial-wrap"), handleDayDialPointer);
  bindOneDialWrap(document.getElementById("weekDialWrap"), handleWeekDialPointer);
  bindOneDialWrap(document.getElementById("wmDayDialWrap"), handleDayDialPointer);
  bindOneDialWrap(document.getElementById("wmWeekDialWrap"), handleWeekDialPointer);
}

function refreshActiveDialView() {
  if (wineMomentOpen) renderWineMomentView();
  else if (viewMode === "day") renderDayView();
  else if (viewMode === "week") renderWeekDialView();
}

function startDialRefresh() {
  stopDialRefresh();
  dialRefreshTimer = setInterval(function () {
    if (wineMomentOpen) {
      if (dialPopupMode === "day" && dayClockHour === null && isToday(selectedYear, selectedMonth, selectedDay)) {
        renderWineMomentView();
      } else if (dialPopupMode === "week") {
        const d = weekDayDate(weekDayIndex);
        if (weekSlotIndex === null && weekDisplayHour === null && isToday(d.year, d.month, d.day)) {
          renderWineMomentView();
        }
      }
      return;
    }
    if (viewMode === "day") {
      if (dayClockHour === null && isToday(selectedYear, selectedMonth, selectedDay)) {
        renderDayView();
      }
    } else if (viewMode === "week") {
      const d = weekDayDate(weekDayIndex);
      if (weekSlotIndex === null && weekDisplayHour === null && isToday(d.year, d.month, d.day)) {
        renderWeekDialView();
      }
    }
  }, 1000);
}

function stopDialRefresh() {
  if (dialRefreshTimer) {
    clearInterval(dialRefreshTimer);
    dialRefreshTimer = null;
  }
}

function initSelectedDate(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (selectedYear === year && selectedMonth === month) {
    setSelectedDate(year, month, Math.min(selectedDay, daysInMonth));
    return;
  }
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() === month) {
    setSelectedDate(year, month, today.getDate());
  } else {
    setSelectedDate(year, month, 1);
  }
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

const WINE_STYLE_LABELS = {
  fruitig: "Fruitig",
  aromatisch: "Aromatisch",
  elegant: "Elegant",
  fris: "Fris & licht",
  sappig: "Sappig & groen",
  mineraal: "Mineraal & strak",
  tanninerijk: "Tanninerijk & krachtig"
};

const DAY_GOOD_STYLES = {
  root: ["mineraal", "tanninerijk"],
  leaf: ["fris", "sappig"],
  flower: ["elegant", "aromatisch"],
  fruit: ["fruitig", "aromatisch", "fris"]
};

const DAY_AVOID_STYLES = {
  root: ["fruitig", "aromatisch"],
  leaf: ["tanninerijk", "elegant"],
  flower: ["mineraal", "tanninerijk"],
  fruit: ["mineraal"]
};

function wineStyleLabel(style) {
  return WINE_STYLE_LABELS[style] || style;
}

function dayTypeWineGuidance(type) {
  if (type === "root") {
    return {
      profile: "Minder goed wijnmoment voor alle wijnsoorten. Wijnen ruiken en smaken geslotener; fruit valt weg — strakker, zuurder, hoekiger. Rood dunner; wit strakker; rosé wateriger; mousserend scherper; port minder zoet/fruitig.",
      good: "Mineraal/strak: Chablis, Muscadet, strakke Grüner Veltliner, Sylvaner, Soave Classico, Fino, Extra Brut, minerale Riesling trocken. Structuur: Nebbiolo, oudere Bordeaux, serieuze Rioja.",
      avoid: "Fruitgedreven en aromatisch: Sauvignon Blanc Marlborough, Verdejo, fris-aromatische Pinot Grigio, Gewürztraminer, Muscat, fruitige Provence-rosé, Beaujolais, fruitige Pinot Noir, fruit-forward Malbec."
    };
  }
  if (type === "leaf") {
    return {
      profile: "Minder goed wijnmoment voor alle wijnsoorten. Groene, vegetale tonen versterkt; grassiger, bitterder of harder. Rood: hardere tannines; wit: groene tonen; rosé: minder fruit; mousserend: minder elegant; port: minder rond.",
      good: "Sauvignon Blanc Loire, Vinho Verde, aromatischer Grüner Veltliner, Albariño, Vermentino, Pinot Blanc. Lichte, frisse rode wijnen.",
      avoid: "Houtgerijpte Chardonnay, rijke Rhône-blends, aromatische Gewürztraminer, zware tanninerijke rode wijnen."
    };
  }
  if (type === "flower") {
    return {
      profile: "Goed wijnmoment voor alle wijnsoorten. Aromatisch, elegant, met florale lift.",
      good: "Elegante Pinot Noir, Champagne Brut, Viognier, Gewürztraminer, Moscato d'Asti, feinherbe Riesling.",
      avoid: "Superstrakke wijnen (Chablis, Muscadet), zware tanninerijke wijnen, zeer houtgedreven wijnen."
    };
  }
  if (type === "fruit") {
    return {
      profile: "Goed wijnmoment voor alle wijnsoorten. Maximale fruitexpressie; rond, open en sappig. Ideale dag om te proeven.",
      good: "Provence-rosé, Beaujolais, fruitige Pinot Noir, fruit-forward Malbec, Zinfandel, aromatische witte wijnen.",
      avoid: "Superstrakke wijnen, zeer minerale wijnen, Fino/Manzanilla."
    };
  }
  return { profile: "", good: "", avoid: "" };
}

function weatherAdviceText(type, weather) {
  if (!hasWeatherData(weather)) return "";

  let advice = "";
  const pressure = weather.pressure;
  const temp = weather.temp;

  if (pressure > 1015) advice += "Hoge luchtdruk: wijn opent makkelijker. ";
  else if (pressure < 1005) advice += "Lage luchtdruk: wijn blijft vaker gesloten. ";
  else advice += "Gemiddelde luchtdruk: neutrale invloed. ";

  if (temp > 22) {
    if (type === "fruit" || type === "leaf") advice += "Warm weer: lichte, frisse wijn sluit goed aan. ";
    else if (type === "flower") advice += "Warm weer: elegante witte of lichte rode wijn kan prettig zijn. ";
    else advice += "Warm weer: kies liever mineraal/strak dan fruitige rosé. ";
  } else if (temp < 10) {
    if (type === "root" || type === "flower") advice += "Koud weer: structuur en body komen goed tot hun recht. ";
    else advice += "Koud weer: vollere wijn kan prettig zijn. ";
  } else {
    advice += "Gemiddelde temperatuur: neutrale invloed. ";
  }

  if (isRainy(weather)) {
    advice += "Regenachtig weer: comfortwijnen kunnen extra prettig zijn. ";
  }

  return advice.trim();
}

function wineAdviceLong(type, weather) {
  const g = dayTypeWineGuidance(type);
  let advice = typeLabel(type) + ". " + g.profile + " Geschikt: " + g.good + " Minder geschikt: " + g.avoid + ".";
  const weatherPart = weatherAdviceText(type, weather);
  if (weatherPart) advice += " " + weatherPart;
  return advice.trim();
}

function wineAdviceHtml(type, weather) {
  const g = dayTypeWineGuidance(type);
  let html =
    "<p><strong>" + typeLabel(type) + ".</strong> " + g.profile + "</p>" +
    "<p>✔ <strong>Geschikt:</strong> " + g.good + "</p>" +
    "<p>✖ <strong>Minder geschikt:</strong> " + g.avoid + "</p>";
  const weatherPart = weatherAdviceText(type, weather);
  if (weatherPart) html += "<p>" + weatherPart + "</p>";
  return html;
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

function matchWines(type) {
  const good = DAY_GOOD_STYLES[type] || [];
  return wines.filter(function (w) {
    return good.indexOf(w.style) >= 0;
  });
}

function avoidWines(type) {
  const avoid = DAY_AVOID_STYLES[type] || [];
  return wines.filter(function (w) {
    return avoid.indexOf(w.style) >= 0;
  });
}

function formatWineList(items) {
  if (!items.length) return "";
  return items.map(function (w) {
    return "• " + w.name + " (" + wineStyleLabel(w.style) + ")";
  }).join("<br>");
}

// ===== Modals =====

function isBackdropOpen(id) {
  const el = document.getElementById(id);
  return el && el.style.display === "flex";
}

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
    label.textContent = w.name + " – " + w.grape + " (" + w.region + ") – " + wineStyleLabel(w.style);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inventory-remove";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      wines.splice(index, 1);
      saveWines();
      renderInventoryList();
      if (viewMode === "month") {
        renderCalendar(currentYear, currentMonth);
      } else if (viewMode === "week") {
        renderWeekDialView();
      } else {
        renderDayView();
      }
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
      const matched = matchWines(slot.type);
      const avoided = avoidWines(slot.type);
      let winesHtml = matched.length ? formatWineList(matched) : "Geen passende flessen in je voorraad.";
      if (avoided.length) {
        winesHtml += '<br><span class="slot-wines-avoid">Minder geschikt: ' + formatWineList(avoided) + "</span>";
      }

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
        setSelectedDate(y, m, d);
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
    .map(function (s) {
      const range = formatSlotRange(s);
      return "<strong>" + range + "</strong>" + wineAdviceHtml(s.type, weather);
    })
    .join("<hr class=\"modal-slot-divider\">");

  winesEl.innerHTML = slots
    .map(function (s) {
      const range = formatSlotRange(s);
      const matched = matchWines(s.type);
      const avoided = avoidWines(s.type);
      let html = "<strong>" + range + "</strong><br>";
      html += matched.length
        ? "✔ " + formatWineList(matched)
        : "Geen passende flessen in je voorraad.";
      if (avoided.length) {
        html += "<br>✖ Minder geschikt: " + formatWineList(avoided);
      }
      return html;
    })
    .join("<hr class=\"modal-slot-divider\">");

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
    if (!selected) return;
    initSelectedDate(selected.year, selected.month);
    if (wineMomentOpen) {
      renderWineMomentView();
    }
    if (viewMode === "month") {
      renderCalendar(selected.year, selected.month);
    } else if (viewMode === "week") {
      syncWeekFromSelectedDate();
      renderWeekDialView();
    } else if (viewMode === "day") {
      renderDayView();
    }
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

  const timezoneSelect = document.getElementById("timezoneSelect");
  if (timezoneSelect) {
    timezoneSelect.addEventListener("change", function () {
      userTimezone = timezoneSelect.value;
      saveTimezone();
      refreshActiveDialView();
      scheduleRender();
    });
  }

  document.body.addEventListener("click", function (e) {
    const target = e.target;

    if (clickOnId(target, "helpBtn") || clickOnId(target, "dayHelpBtn") || clickOnId(target, "weekHelpBtn") || clickOnId(target, "wmHelpBtn")) {
      openBackdrop("helpBackdrop");
      return;
    }
    if (clickOnId(target, "dayInventoryBtn") || clickOnId(target, "weekInventoryBtn") || clickOnId(target, "wmTimezoneBtn")) {
      openTimezoneModal();
      return;
    }
    if (clickOnId(target, "dayWeekBtn") || clickOnId(target, "weekMonthBtn") || clickOnId(target, "wmAgendaBtn")) {
      openAgendaModal();
      return;
    }
    if (clickOnId(target, "wineMomentClose")) {
      closeWineMomentModal();
      return;
    }
    if (target.id === "wineMomentBackdrop") {
      closeWineMomentModal();
      return;
    }
    if (clickOnId(target, "wmViewDayBtn")) {
      setWineMomentPanel("day");
      renderWineMomentView();
      return;
    }
    if (clickOnId(target, "wmViewWeekBtn")) {
      syncWeekFromSelectedDate();
      setWineMomentPanel("week");
      renderWineMomentView();
      return;
    }
    if (clickOnId(target, "wmPrevDayBtn")) {
      navigateSelectedDay(-1);
      return;
    }
    if (clickOnId(target, "wmNextDayBtn")) {
      navigateSelectedDay(1);
      return;
    }
    if (clickOnId(target, "wmPrevWeekBtn")) {
      navigateWeek(-1);
      return;
    }
    if (clickOnId(target, "wmNextWeekBtn")) {
      navigateWeek(1);
      return;
    }
    if (target.id === "timezoneClose" || target.id === "timezoneBackdrop") {
      closeBackdrop("timezoneBackdrop");
      return;
    }
    if (target.id === "agendaClose" || target.id === "agendaBackdrop") {
      closeBackdrop("agendaBackdrop");
      return;
    }
    if (clickOnId(target, "agendaPrevMonth")) {
      navigateAgendaMonth(-1);
      return;
    }
    if (clickOnId(target, "agendaNextMonth")) {
      navigateAgendaMonth(1);
      return;
    }
    if (clickOnId(target, "weekMonthBtn")) {
      setViewMode("month");
      return;
    }
    if (clickOnId(target, "prevWeekBtn")) {
      navigateWeek(-1);
      return;
    }
    if (clickOnId(target, "nextWeekBtn")) {
      navigateWeek(1);
      return;
    }
    if (clickOnId(target, "openDialViewBtn")) {
      openDialViewForSelectedDay();
      return;
    }
    if (clickOnId(target, "viewWeekBtn")) {
      if (wineMomentOpen) {
        syncWeekFromSelectedDate();
        setWineMomentPanel("week");
        renderWineMomentView();
      } else {
        setViewMode("week");
      }
      return;
    }
    if (clickOnId(target, "viewDayBtn")) {
      if (wineMomentOpen) {
        setWineMomentPanel("day");
        renderWineMomentView();
      } else {
        setViewMode("day");
      }
      return;
    }
    if (clickOnId(target, "prevDayBtn")) {
      navigateSelectedDay(-1);
      return;
    }
    if (clickOnId(target, "nextDayBtn")) {
      navigateSelectedDay(1);
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
      if (isBackdropOpen("wineMomentBackdrop")) closeWineMomentModal();
      closeBackdrop("dayModalBackdrop");
      return;
    }
    if (target.id === "dayModalBackdrop" && !isBackdropOpen("wineMomentBackdrop")) {
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
      document.getElementById("wineStyleInput").value = "fruitig";
      renderInventoryList();
      if (viewMode === "month") {
        renderCalendar(currentYear, currentMonth);
      } else if (viewMode === "week") {
        renderWeekDialView();
      } else {
        renderDayView();
      }
    }
  });
}

function applyAppVersion() {
  const label = "(v" + APP_VERSION + ")";
  document.title = "Biodynamische kalender " + label;
  const versionEl = document.querySelector(".app-version");
  if (versionEl) versionEl.textContent = label;
  document.querySelectorAll(".app-version-inline").forEach(function (el) {
    el.textContent = "v" + APP_VERSION;
  });
}

function parseVersionFromIndexHtml(html) {
  const assetMatch = html.match(/(?:app\.js|style\.css)\?v=([\d.]+)/);
  if (assetMatch) return assetMatch[1];
  const titleMatch = html.match(/\(v([\d.]+)\)/);
  return titleMatch ? titleMatch[1] : null;
}

function cleanVersionReloadParam() {
  const url = new URL(location.href);
  if (!url.searchParams.has(VERSION_RELOAD_PARAM)) return;
  url.searchParams.delete(VERSION_RELOAD_PARAM);
  const next = url.pathname + url.search + url.hash;
  history.replaceState(null, "", next || url.pathname);
}

async function checkAppVersionUpdate() {
  const url = new URL(location.href);
  if (url.searchParams.get(VERSION_RELOAD_PARAM) === APP_VERSION) {
    sessionStorage.removeItem("cv-reloads");
    cleanVersionReloadParam();
    return false;
  }

  const reloads = parseInt(sessionStorage.getItem("cv-reloads") || "0", 10);
  if (reloads >= VERSION_CHECK_MAX_RELOADS) return false;

  try {
    const res = await fetch("index.html?_cv=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!res.ok) return false;

    const remoteVersion = parseVersionFromIndexHtml(await res.text());
    if (!remoteVersion || remoteVersion === APP_VERSION) return false;

    sessionStorage.setItem("cv-reloads", String(reloads + 1));
    url.searchParams.set(VERSION_RELOAD_PARAM, remoteVersion);
    location.replace(url.toString());
    return true;
  } catch (err) {
    return false;
  }
}

function startVersionWatch() {
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      checkAppVersionUpdate();
    }
  });
}

async function bootApp() {
  if (await checkAppVersionUpdate()) return;

  applyAppVersion();
  loadWines();
  loadLocation();
  loadTimezone();
  loadPreferences();
  populateTimezoneSelect();
  initEventListeners();
  bindDialInteractions();

  const selected = getSelectedYearMonth();
  if (selected) {
    initSelectedDate(selected.year, selected.month);
    syncWeekFromSelectedDate();
    setViewMode("month");
  }

  const placeInput = document.getElementById("locationInput").value.trim();
  if (placeInput && placeInput.toLowerCase() !== displayLocationName(userLocation).toLowerCase()) {
    applyLocation();
  }

  startVersionWatch();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}
