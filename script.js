const slider = document.getElementById("yearSlider");
const yearDock = document.getElementById("yearDock");
const tooltip = document.getElementById("tooltip");
const svg = d3.select("#map");

const minYear = Number(slider.min);
const maxYear = Number(slider.max);

const conflicts = [
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
    const scale = 1 - Math.abs(offset) * 0.15;
    span.style.transform = `scale(${scale})`;
    span.style.opacity = `${1 - Math.abs(offset) * 0.2}`;
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
  projection = d3.geoMercator().fitSize([width, height], { type: "Sphere" });
  pathGenerator = d3.geoPath(projection);
  mapLayer.selectAll("path.country").attr("d", pathGenerator);
}

async function drawMap() {
  const response = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
  const world = await response.json();
  worldFeatures = topojson.feature(world, world.objects.countries).features;

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
    .on("mouseleave", hideTooltip);

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
void drawMap();
