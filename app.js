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

let wines = [];
let currentYear;
let currentMonth;

// ===== Wijnvoorraad (localStorage) =====

function loadWines() {
  const raw = localStorage.getItem("wines");
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
  localStorage.setItem("wines", JSON.stringify(wines));
}

// ===== Eenvoudige “maan” → biodynamische dag =====
// Niet astronomisch perfect, maar deterministisch en stabiel.

function pseudoMoonType(date) {
  // Simpele cyclus van 4 dagen: fruit → flower → leaf → root
  const base = new Date(Date.UTC(2000, 0, 1));
  const diffDays = Math.floor((date - base) / 86400000);
  const idx = ((diffDays % 4) + 4) % 4;
  if (idx === 0) return "fruit";
  if (idx === 1) return "flower";
  if (idx === 2) return "leaf";
  return "root";
}

function typeLabel(type) {
  if (type === "fruit") return "Vruchtendag";
  if (type === "flower") return "Bloemdag";
  if (type === "leaf") return "Bladdag";
  if (type === "root") return "Worteldag";
  return "Onbekend";
}

function formatHour(h) {
  return String(h).padStart(2, "0") + ":00";
}

// Twee tijdvakken per dag: 00–11, 12–23 (zelfde type in deze simpele versie)
function buildSlots(date) {
  const type = pseudoMoonType(date);
  return [
    { type, start: 0, end: 11 },
    { type, start: 12, end: 23 }
  ];
}

// ===== Eenvoudige “weer” (mock) =====
// Geen API, maar een simpele pseudo-waarde op basis van datum.

function pseudoWeather(date) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;

  const pressure = 1005 + ((day * 3 + month * 7) % 20); // 1005–1024
  const temp = 6 + ((day * 2 + month * 5) % 18);        // 6–23
  const code = (day + month) % 3 === 0 ? 61 : 0;        // soms “regen”

  return { pressure, temp, code };
}

// ===== Advies genereren =====

function wineAdviceLong(type, pressure, temp, code) {
  let advice = "";

  if (type === "fruit") advice += "Vruchtendag – aromatische en fruitige wijnen openen vaak mooier. ";
  if (type === "flower") advice += "Bloemdag – elegante, verfijnde wijnen tonen meer nuance. ";
  if (type === "leaf") advice += "Bladdag – frisse wijnen kunnen wat vlakker overkomen. ";
  if (type === "root") advice += "Worteldag – tanninerijke wijnen kunnen strenger smaken. ";

  if (pressure > 1015) advice += "Hoge luchtdruk: wijn opent makkelijker. ";
  else if (pressure < 1005) advice += "Lage luchtdruk: wijn blijft vaker gesloten. ";
  else advice += "Gemiddelde luchtdruk: neutrale invloed. ";

  if (temp > 22) advice += "Warm weer: rosé of frisse witte wijn past beter. ";
  else if (temp < 10) advice += "Koud weer: vollere rode wijn sluit beter aan. ";
  else advice += "Gemiddelde temperatuur: zowel wit als rood kan goed werken. ";

  if (code === 61) {
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

function matchWines(type, temp) {
  return wines.filter(w => {
    if (type === "fruit" && w.style === "aromatisch") return true;
    if (type === "flower" && w.style === "elegant") return true;
    if (type === "leaf" && w.style === "fris") return true;
    if (type === "root" && w.style === "tanninerijk") return true;

    if (temp > 22 && w.style === "fris") return true;
    if (temp < 10 && w.style === "tanninerijk") return true;

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

function renderCalendar(year, month) {
  currentYear = year;
  currentMonth = month;

  const container = document.getElementById("weeksContainer");
  container.innerHTML = "";

  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startOffset = (firstDay.getUTCDay() + 6) % 7; // maandag=0

  let week = document.createElement("div");
  week.className = "week";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty";
    week.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const slots = buildSlots(date);
    const weather = pseudoWeather(date);
    const mainType = slots[0].type;

    const dayDiv = document.createElement("div");
    dayDiv.className = `day ${mainType}`;

    const pressureText = `${weather.pressure.toFixed(0)} hPa`;
    const weatherLine = `Luchtdruk ${pressureText}, ca. ${weather.temp.toFixed(1)} °C`;

    let html = `
      <div class="day-number"><strong>${day}</strong></div>
      <div class="day-content">
        <div class="day-weather">${weatherLine}</div>
    `;

    slots.forEach(slot => {
      const start = formatHour(slot.start);
      const adviceFull = wineAdviceLong(slot.type, weather.pressure, weather.temp, weather.code);
      const conclusion = extractConclusionSentence(adviceFull);
      const matched = matchWines(slot.type, weather.temp);

      const winesHtml = matched.length
        ? matched.map(w => `• ${w.name} (${w.style})`).join("<br>")
        : "Geen specifieke flessen.";

      html += `
        <div class="slot-block">
          <div class="slot-title">${start} ${typeLabel(slot.type)}</div>
          <div class="slot-conclusion">${conclusion}</div>
          <div class="slot-wines">${winesHtml}</div>
        </div>
      `;
    });

    html += "</div>";
    dayDiv.innerHTML = html;

    dayDiv.addEventListener("click", () => {
      openDayModal(day, month, year, slots, weather);
    });

    week.appendChild(dayDiv);

    if ((startOffset + day) % 7 === 0 || day === daysInMonth) {
      container.appendChild(week);
      if (day !== daysInMonth) {
        week = document.createElement("div");
        week.className = "week";
      }
    }
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

  const weatherText =
    `Luchtdruk: ${weather.pressure.toFixed(0)} hPa, ` +
    `Temperatuur: ${weather.temp.toFixed(1)} °C, ` +
    `Weer: ${weather.code === 61 ? "regenachtig" : "droog"}`;

  weatherEl.textContent = weatherText;

  slotsEl.innerHTML = slots.map(s => {
    const start = formatHour(s.start);
    const end = s.end === 23 ? "23:59" : formatHour(s.end + 1);
    return `${start}–${end}: ${typeLabel(s.type)}`;
  }).join("<br>");

  adviceEl.innerHTML = slots.map(s => {
    const start = formatHour(s.start);
    const end = s.end === 23 ? "23:59" : formatHour(s.end + 1);
    const adv = wineAdviceLong(s.type, weather.pressure, weather.temp, weather.code);
    return `<strong>${start}–${end}</strong><br>${adv}`;
  }).join("<br><br>");

  winesEl.innerHTML = slots.map(s => {
    const start = formatHour(s.start);
    const end = s.end === 23 ? "23:59" : formatHour(s.end + 1);
    const matched = matchWines(s.type, weather.temp);

    if (!matched.length) {
      return `<strong>${start}–${end}</strong><br>Geen specifieke flessen uit jouw voorraad.`;
    }

    const list = matched.map(w => `• ${w.name} – ${w.style}`).join("<br>");
    return `<strong>${start}–${end}</strong><br>${list}`;
  }).join("<br><br>");

  openBackdrop("dayModalBackdrop");
}

// ===== Init & events =====

function initControls() {
  const now = new Date();
  const yearInput = document.getElementById("yearInput");
  const monthSelect = document.getElementById("monthSelect");

  yearInput.value = now.getFullYear();
  monthSelect.value = String(now.getMonth());

  document.getElementById("renderBtn").addEventListener("click", () => {
    const y = parseInt(yearInput.value, 10);
    const m = parseInt(monthSelect.value, 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return;
    renderCalendar(y, m);
  });

  document.getElementById("dayModalClose").addEventListener("click", () => {
    closeBackdrop("dayModalBackdrop");
  });
  document.getElementById("dayModalBackdrop").addEventListener("click", e => {
    if (e.target.id === "dayModalBackdrop") closeBackdrop("dayModalBackdrop");
  });

  document.getElementById("helpBtn").addEventListener("click", () => {
    openBackdrop("helpBackdrop");
  });
  document.getElementById("helpClose").addEventListener("click", () => {
    closeBackdrop("helpBackdrop");
  });
  document.getElementById("helpBackdrop").addEventListener("click", e => {
    if (e.target.id === "helpBackdrop") closeBackdrop("helpBackdrop");
  });

  document.getElementById("inventoryBtn").addEventListener("click", () => {
    renderInventoryList();
    openBackdrop("inventoryBackdrop");
  });
  document.getElementById("inventoryClose").addEventListener("click", () => {
    closeBackdrop("inventoryBackdrop");
  });
  document.getElementById("inventoryBackdrop").addEventListener("click", e => {
    if (e.target.id === "inventoryBackdrop") closeBackdrop("inventoryBackdrop");
  });

  document.getElementById("addWineBtn").addEventListener("click", () => {
    const name = document.getElementById("wineNameInput").value.trim();
    const grape = document.getElementById("wineGrapeInput").value.trim();
    const region = document.getElementById("wineRegionInput").value.trim();
    const style = document.getElementById("wineStyleInput").value;

    if (!name || !grape || !region) {
      alert("Vul naam, druif en regio in.");
      return;
    }

    wines.push({ name, grape, region, style });
    saveWines();
    document.getElementById("wineNameInput").value = "";
    document.getElementById("wineGrapeInput").value = "";
    document.getElementById("wineRegionInput").value = "";
    document.getElementById("wineStyleInput").value = "aromatisch";

    renderInventoryList();
    renderCalendar(currentYear, currentMonth);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadWines();
  initControls();
  const now = new Date();
  renderCalendar(now.getFullYear(), now.getMonth());
});
