const slider = document.getElementById("yearSlider");
const yearDock = document.getElementById("yearDock");
const tooltip = document.getElementById("tooltip");
const svg = d3.select("#map");

const minYear = Number(slider.min);
const maxYear = Number(slider.max);

const seedConflicts = [
  {
    name: "Roman–Parthian War",
    start: 58,
    end: 63,
    activeStart: 58,
    activeEnd: 63,
    type: "interstate",
    participants: ["Italy", "Iran"],
    source: "https://en.wikipedia.org/wiki/Roman%E2%80%93Parthian_War_of_58%E2%80%9363",
  },
  {
    name: "Hundred Years' War",
    start: 1337,
    end: 1453,
    activeStart: 1337,
    activeEnd: 1453,
    type: "interstate",
    participants: ["France", "United Kingdom"],
    source: "https://en.wikipedia.org/wiki/Hundred_Years%27_War",
  },
  {
    name: "English Civil War",
    start: 1642,
    end: 1651,
    activeStart: 1642,
    activeEnd: 1651,
    type: "civil",
    participants: ["United Kingdom"],
    source: "https://en.wikipedia.org/wiki/English_Civil_War",
  },
  {
    name: "World War II",
    start: 1939,
    end: 1945,
    activeStart: 1939,
    activeEnd: 1945,
    type: "interstate",
    participants: ["Germany", "France", "United Kingdom", "Italy", "Japan", "Russia", "China"],
    source: "https://en.wikipedia.org/wiki/World_War_II",
  },
  {
    name: "Vietnam War",
    start: 1955,
    end: 1975,
    activeStart: 1965,
    activeEnd: 1973,
    type: "interstate",
    participants: ["Vietnam", "United States of America"],
    source: "https://en.wikipedia.org/wiki/Vietnam_War",
  },
  {
    name: "Syrian Civil War",
    start: 2011,
    end: 2024,
    activeStart: 2012,
    activeEnd: 2024,
    type: "civil",
    participants: ["Syria"],
    source: "https://en.wikipedia.org/wiki/Syrian_civil_war",
  },
  {
    name: "Russo-Ukrainian War",
    start: 2014,
    end: 2024,
    activeStart: 2022,
    activeEnd: 2024,
    type: "interstate",
    participants: ["Ukraine", "Russia"],
    source: "https://en.wikipedia.org/wiki/Russo-Ukrainian_War",
  },
];

const participantAliases = new Map([
  ["United States", "United States of America"],
  ["USA", "United States of America"],
  ["USSR", "Russia"],
  ["Russian Federation", "Russia"],
  ["United Kingdom", "United Kingdom"],
  ["Republic of China", "Taiwan"],
  ["People's Republic of China", "China"],
  ["Viet Nam", "Vietnam"],
]);

const wikidataEndpoint = "https://query.wikidata.org/sparql";
const wikidataQuery = `
  SELECT ?war ?warLabel ?start ?end ?participantLabel ?article ?typeLabel WHERE {
    ?war wdt:P31/wdt:P279* wd:Q198 .
    OPTIONAL { ?war wdt:P580 ?start . }
    OPTIONAL { ?war wdt:P582 ?end . }
    OPTIONAL {
      ?war wdt:P710 ?participant .
      ?participant wdt:P31/wdt:P279* wd:Q6256 .
    }
    OPTIONAL { ?war wdt:P31 ?type . }
    OPTIONAL {
      ?article schema:about ?war ;
               schema:isPartOf <https://en.wikipedia.org/> .
    }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  LIMIT 600
`;

const colorMap = {
  civil: getComputedStyle(document.documentElement).getPropertyValue("--civil").trim(),
  interstate: getComputedStyle(document.documentElement).getPropertyValue("--interstate").trim(),
};

const opacityMap = {
  active: Number(getComputedStyle(document.documentElement).getPropertyValue("--active-opacity")) || 0.85,
  inactive: Number(getComputedStyle(document.documentElement).getPropertyValue("--inactive-opacity")) || 0.35,
};

let worldFeatures = [];
let projection = d3.geoMercator();
let pathGenerator = d3.geoPath(projection);
let currentYear = Number(slider.value);
let conflicts = [...seedConflicts];

const zoom = d3
  .zoom()
  .scaleExtent([1, 8])
  .on("zoom", (event) => {
    svg.select("g.map-layer").attr("transform", event.transform);
  });

svg.call(zoom);

const mapLayer = svg.append("g").attr("class", "map-layer");

function formatYear(year) {
  return `${year} CE`;
}

function updateYearDock(year) {
  yearDock.innerHTML = "";
  const range = [-3, -2, -1, 0, 1, 2, 3];
  range.forEach((offset) => {
    const value = year + offset;
    if (value < minYear || value > maxYear) {
      return;
    }
    const span = document.createElement("span");
    span.textContent = formatYear(value);
    const distance = Math.abs(offset);
    const scale = offset === 0 ? 2 : Math.max(0.8, 1.2 - distance * 0.15);
    span.style.transform = `scale(${scale})`;
    span.style.opacity = `${1 - distance * 0.2}`;
    span.style.fontWeight = offset === 0 ? "700" : "500";
    yearDock.appendChild(span);
  });
}

function conflictsForYear(year) {
  const activeConflicts = conflicts.filter((conflict) => year >= conflict.start && year <= conflict.end);
  const conflictByCountry = new Map();

  activeConflicts.forEach((conflict) => {
    const isActive = year >= conflict.activeStart && year <= conflict.activeEnd;
    const intensity = isActive ? "active" : "inactive";

    conflict.participants.forEach((country) => {
      if (!conflictByCountry.has(country)) {
        conflictByCountry.set(country, []);
      }
      conflictByCountry.get(country).push({
        ...conflict,
        intensity,
      });
    });
  });

  return conflictByCountry;
}

function resolveFill(countryName, conflictByCountry) {
  const conflictsForCountry = conflictByCountry.get(countryName) || [];
  if (conflictsForCountry.length === 0) {
    return { fill: "var(--land)", conflicts: [] };
  }

  const sorted = [...conflictsForCountry].sort((a, b) => {
    if (a.intensity === b.intensity) {
      return 0;
    }
    return a.intensity === "active" ? -1 : 1;
  });

  const winner = sorted[0];
  const baseColor = d3.color(colorMap[winner.type] || "#666");
  baseColor.opacity = opacityMap[winner.intensity];

  return {
    fill: baseColor.formatRgb(),
    conflicts: conflictsForCountry,
  };
}

function updateMap(year) {
  const conflictByCountry = conflictsForYear(year);

  mapLayer
    .selectAll("path.country")
    .transition()
    .duration(300)
    .attr("fill", (d) => resolveFill(d.properties.name, conflictByCountry).fill);

  mapLayer.selectAll("path.country").each(function (d) {
    const info = resolveFill(d.properties.name, conflictByCountry);
    d.conflictInfo = info;
  });
}

function showTooltip(event, d) {
  const info = d.conflictInfo;
  if (!info || info.conflicts.length === 0) {
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
    return;
  }

  tooltip.innerHTML = `
    <h4>${d.properties.name}</h4>
    ${info.conflicts
      .map(
        (conflict) => `
        <div>
          <strong>${conflict.name}</strong><br />
          <span>${conflict.type === "civil" ? "Civil war" : "Inter-state war"} · ${conflict.intensity === "active" ? "Active" : "Limited"}</span><br />
          <a href="${conflict.source}" target="_blank" rel="noreferrer">Wikipedia</a>
        </div>
      `
      )
      .join("<hr />")}
  `;

  const { left, top } = svg.node().getBoundingClientRect();
  tooltip.style.left = `${event.clientX - left + 16}px`;
  tooltip.style.top = `${event.clientY - top + 16}px`;
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
}

function moveTooltip(event) {
  const { left, top } = svg.node().getBoundingClientRect();
  tooltip.style.left = `${event.clientX - left + 16}px`;
  tooltip.style.top = `${event.clientY - top + 16}px`;
}

function hideTooltip() {
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function resize() {
  const { width, height } = svg.node().getBoundingClientRect();
  const features = worldFeatures.filter((feature) => feature.properties.name !== "Antarctica");
  projection = d3.geoMercator().fitExtent(
    [
      [20, 20],
      [width - 20, height - 20],
    ],
    { type: "FeatureCollection", features }
  );
  projection.scale(projection.scale() * 1.08);
  pathGenerator = d3.geoPath(projection);
  mapLayer.selectAll("path.country").attr("d", pathGenerator);
}

function normalizeParticipant(name) {
  return participantAliases.get(name) || name;
}

function parseYear(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getUTCFullYear();
}

function isCivilConflict(name, typeLabel) {
  const normalized = `${name} ${typeLabel || ""}`.toLowerCase();
  return normalized.includes("civil war") || normalized.includes("insurgency");
}

async function loadConflictsFromWikidata() {
  try {
    const response = await fetch(
      `${wikidataEndpoint}?format=json&query=${encodeURIComponent(wikidataQuery)}`,
      {
        headers: {
          Accept: "application/sparql+json",
        },
      }
    );
    const data = await response.json();
    const warMap = new Map();

    data.results.bindings.forEach((row) => {
      const name = row.warLabel?.value;
      const participant = row.participantLabel?.value;
      const start = parseYear(row.start?.value);
      const end = parseYear(row.end?.value) ?? start;

      if (!name || !participant || !start || !end) {
        return;
      }
      if (end < minYear || start > maxYear) {
        return;
      }

      const key = row.war?.value ?? name;
      const entry = warMap.get(key) || {
        name,
        start,
        end,
        activeStart: start,
        activeEnd: end,
        type: isCivilConflict(name, row.typeLabel?.value) ? "civil" : "interstate",
        participants: new Set(),
        source: row.article?.value || row.war?.value || "",
      };

      entry.participants.add(normalizeParticipant(participant));
      warMap.set(key, entry);
    });

    const wikidataConflicts = Array.from(warMap.values()).map((entry) => ({
      ...entry,
      participants: Array.from(entry.participants),
    }));

    if (wikidataConflicts.length > 0) {
      conflicts = [...seedConflicts, ...wikidataConflicts];
      updateMap(currentYear);
    }
  } catch (error) {
    console.warn("Failed to load Wikidata conflicts", error);
  }
}

async function drawMap() {
  const response = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
  const world = await response.json();
  worldFeatures = topojson
    .feature(world, world.objects.countries)
    .features.filter((feature) => feature.properties.name !== "Antarctica");

  mapLayer
    .selectAll("path.country")
    .data(worldFeatures)
    .join("path")
    .attr("class", "country")
    .attr("fill", "var(--land)")
    .attr("stroke", "var(--border)")
    .attr("stroke-width", 0.6)
    .on("mousemove", moveTooltip)
    .on("mouseenter", showTooltip)
    .on("mouseleave", (event) => {
      if (tooltip.contains(event.relatedTarget)) {
        return;
      }
      hideTooltip();
    });

  resize();
  updateMap(currentYear);
}

slider.addEventListener("input", (event) => {
  currentYear = Number(event.target.value);
  updateYearDock(currentYear);
  updateMap(currentYear);
});

window.addEventListener("resize", resize);

updateYearDock(currentYear);
tooltip.addEventListener("mouseleave", hideTooltip);
tooltip.addEventListener("mouseenter", () => {
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
});

void loadConflictsFromWikidata();
void drawMap();
