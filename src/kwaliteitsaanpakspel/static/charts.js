// Kleine lijngrafieken met één reeks, zoals het beschikbare budget per release, eventueel met een target als tweede,
// minder opvallende lijn.

const SVG_NS = "http://www.w3.org/2000/svg";

// De afmetingen van een grafiek, in pixels.
export const CHART_SIZE = {width: 280, height: 140, margin: {top: 10, right: 16, bottom: 20, left: 48}};

// Een rond stapgrootte voor de y-as, zodat er hoogstens maxTicks stappen zijn: 1, 2, 2,5 of 5 maal een macht van 10.
export function niceStep(range, maxTicks = 5) {
  let magnitude = 10 ** Math.floor(Math.log10(range / maxTicks));
  for (;;) {
    for (const factor of [1, 2, 2.5, 5]) {
      if (range / (factor * magnitude) <= maxTicks) return factor * magnitude;
    }
    magnitude *= 10;
  }
}

// De waarden op de y-as: van 0 (of lager als er negatieve waarden zijn) tot boven de hoogste waarde, in ronde stappen.
// Ontbrekende waarden (null) tellen niet mee.
export function yTicks(values) {
  const present = values.filter(value => value !== null);
  const min = Math.min(0, ...present);
  const max = Math.max(0, ...present);
  const step = niceStep(max - min || 1);
  const ticks = [];
  for (let tick = Math.floor(min / step) * step; tick <= Math.ceil(max / step) * step; tick += step) ticks.push(tick);
  return ticks;
}

// De posities van de punten en de waarden op de y-as in een grafiek. De y-as past bij de waarden en de extra waarden,
// zoals een target. Een ontbrekende waarde (null) heeft geen y.
export function lineChartGeometry(values, {width, height, margin} = CHART_SIZE, extraValues = []) {
  const ticks = yTicks([...values, ...extraValues]);
  const [low, high] = [ticks[0], ticks.at(-1)];
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = index => margin.left + (values.length > 1 ? (index * plotWidth) / (values.length - 1) : plotWidth / 2);
  const y = value => margin.top + ((high - value) / (high - low)) * plotHeight;
  return {
    points: values.map((value, index) => ({x: x(index), y: value === null ? null : y(value), value})),
    y,
    ticks: ticks.map(value => ({value, y: y(value)})),
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
    band: values.length > 1 ? plotWidth / (values.length - 1) : plotWidth,
  };
}

function svgElement(tagName, attributes = {}) {
  const result = document.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, String(value));
  return result;
}

function svgText(text, attributes) {
  const result = svgElement("text", attributes);
  result.textContent = text;
  return result;
}

// Een polyline door de punten die een waarde hebben.
function polyline(className, points) {
  const coordinates = points.filter(({y}) => y !== null).map(({x, y}) => `${x},${y}`).join(" ");
  return svgElement("polyline", {class: className, points: coordinates});
}

// Teken een lijngrafiek in een svg, width pixels breed en height pixels hoog. Labels zijn de namen op de x-as en
// axisLabel wat die namen zijn; de x-as toont alleen de namen, de tooltip beide, bijvoorbeeld "Release 1". Een
// ontbrekende waarde (null) krijgt geen punt. Target is een optionele tweede lijn.
// Format maakt de waarden in de tooltip op en tickFormat de waarden op de y-as. De tooltip is een HTML-element naast de
// svg dat bij aanwijzen of focus de waarden en het label toont.
export function renderLineChart(
  svg, tooltip, {
    values, target = null, labels, axisLabel, format = String, tickFormat = format, width = CHART_SIZE.width,
    height = CHART_SIZE.height,
  },
) {
  const key = JSON.stringify([values, target, width, height]);
  if (svg.dataKey === key) return;  // Niets veranderd: laat de grafiek (en een open tooltip) staan.
  svg.dataKey = key;
  const size = {...CHART_SIZE, width, height};
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const geometry = lineChartGeometry(values, size, target ?? []);
  const targetPoints = (target ?? []).map((value, index) => ({x: geometry.points[index].x, y: geometry.y(value)}));
  const children = [];
  for (const {value, y} of geometry.ticks) {
    const gridClass = value === 0 ? "chart-baseline" : "chart-grid";
    children.push(svgElement("line", {class: gridClass, x1: geometry.left, x2: geometry.right, y1: y, y2: y}));
    const tick = {class: "chart-tick", x: geometry.left - 6, y, "text-anchor": "end", "dominant-baseline": "middle"};
    children.push(svgText(tickFormat(value), tick));
  }
  geometry.points.forEach(({x}, index) => {
    children.push(svgText(labels[index], {class: "chart-tick", x, y: geometry.bottom + 14, "text-anchor": "middle"}));
  });
  const crosshair = svgElement("line", {class: "chart-crosshair", y1: geometry.top, y2: geometry.bottom});
  crosshair.setAttribute("visibility", "hidden");
  children.push(crosshair);
  if (target) children.push(polyline("chart-target-line", targetPoints));
  children.push(polyline("chart-line", geometry.points));
  for (const {x, y} of geometry.points.filter(({y}) => y !== null)) {
    children.push(svgElement("circle", {class: "chart-marker", cx: x, cy: y, r: 4}));
  }
  // Het aanwijsgebied is de hele band rond een punt, niet alleen het punt zelf.
  geometry.points.forEach(({x, y, value}, index) => {
    const parts = [value === null ? "–" : format(value), `${axisLabel} ${labels[index]}`];
    if (target) parts.push(`🎯 ${format(target[index])}`);
    const [shown, ...rest] = parts;
    const top = y ?? targetPoints[index]?.y ?? geometry.bottom;
    const hitArea = svgElement("rect", {
      class: "chart-target", x: x - geometry.band / 2, y: geometry.top, width: geometry.band,
      height: geometry.bottom - geometry.top, tabindex: 0, "aria-label": parts.join(" · "),
    });
    const show = () => {
      crosshair.setAttribute("x1", String(x));
      crosshair.setAttribute("x2", String(x));
      crosshair.setAttribute("visibility", "visible");
      const [strong, span] = [document.createElement("strong"), document.createElement("span")];
      strong.textContent = shown;
      span.textContent = ` · ${rest.join(" · ")}`;
      tooltip.replaceChildren(strong, span);
      // Lijn de tooltip uit op de rand van de grafiek aan de kant van het punt, zodat die binnen de grafiek valt.
      const rightHalf = x > (geometry.left + geometry.right) / 2;
      tooltip.style.left = rightHalf ? "auto" : "0px";
      tooltip.style.right = rightHalf ? "0px" : "auto";
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = "translateY(calc(-100% - 12px))";
      tooltip.hidden = false;
    };
    const hide = () => {
      crosshair.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    };
    for (const type of ["pointerenter", "focus"]) hitArea.addEventListener(type, show);
    for (const type of ["pointerleave", "blur"]) hitArea.addEventListener(type, hide);
    children.push(hitArea);
  });
  svg.replaceChildren(...children);
}
