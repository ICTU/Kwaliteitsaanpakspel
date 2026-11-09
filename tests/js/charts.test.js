import assert from "node:assert/strict";
import {describe, test} from "node:test";

import {CHART_SIZE, lineChartGeometry, niceStep, renderLineChart, yTicks} from "../../src/kwaliteitsaanpakspel/static/charts.js";
import {FakeElement, fakeBrowser} from "./fakes.js";

describe("niceStep", () => {
  test("de stap is 1, 2, 2,5 of 5 maal een macht van 10, met hoogstens 5 stappen", () => {
    assert.deepEqual([2000, 2300, 1100, 7, 1].map(range => niceStep(range)), [500, 500, 250, 2, 0.2]);
  });

  test("als 5 maal de macht te klein is, wordt de macht groter", () => {
    assert.equal(niceStep(30), 10);
  });
});

describe("yTicks", () => {
  test("de y-as begint op 0 en loopt in ronde stappen tot boven de hoogste waarde", () => {
    assert.deepEqual(yTicks([2000, 1500, 1200, 1200]), [0, 500, 1000, 1500, 2000]);
    assert.deepEqual(yTicks([2300, 1800]), [0, 500, 1000, 1500, 2000, 2500]);
  });

  test("bij negatieve waarden loopt de y-as door onder 0", () => {
    assert.deepEqual(yTicks([2000, 1000, 0, -500]), [-500, 0, 500, 1000, 1500, 2000]);
  });

  test("als alle waarden 0 zijn, is er toch een y-as", () => {
    assert.deepEqual(yTicks([0, 0]), [0]);
  });
});

describe("lineChartGeometry", () => {
  const size = {width: 140, height: 120, margin: {top: 10, right: 10, bottom: 10, left: 30}};

  test("de punten liggen gelijkmatig verdeeld; hogere waarden liggen hoger", () => {
    const geometry = lineChartGeometry([2000, 1000, 0], size);
    assert.deepEqual(geometry.points.map(({x, y}) => [x, y]), [[30, 10], [80, 60], [130, 110]]);
    assert.deepEqual(geometry.ticks.map(({value, y}) => [value, y]), [[0, 110], [500, 85], [1000, 60], [1500, 35], [2000, 10]]);
    assert.deepEqual([geometry.left, geometry.right, geometry.top, geometry.bottom, geometry.band], [30, 130, 10, 110, 50]);
  });

  test("een enkel punt staat in het midden", () => {
    const geometry = lineChartGeometry([10], size);
    assert.deepEqual([geometry.points[0].x, geometry.band], [80, 100]);
  });

  test("zonder afmetingen gebruikt de grafiek de standaardafmetingen", () => {
    assert.equal(lineChartGeometry([1, 2]).points.length, 2);
  });
});

describe("renderLineChart", () => {
  const options = {values: [2000, 1200, -400], labels: ["1", "2", "3"], axisLabel: "Release", format: amount => `${amount} €`};

  function render(t, extra = {}) {
    fakeBrowser(t, {});
    const [svg, tooltip] = [new FakeElement("svg"), new FakeElement("div")];
    renderLineChart(svg, tooltip, {...options, ...extra});
    return {svg, tooltip, byClass: name => svg.children.filter(child => child.attributes.class === name)};
  }

  test("de grafiek heeft rasterlijnen, een lijn, punten en aanwijsgebieden", t => {
    const {svg, byClass} = render(t);
    assert.ok(svg.children.every(child => child.namespace === "http://www.w3.org/2000/svg"));
    assert.equal(byClass("chart-baseline").length, 1);
    assert.equal(byClass("chart-grid").length + 1, yTicks(options.values).length);
    assert.equal(byClass("chart-line")[0].attributes.points.split(" ").length, 3);
    assert.equal(byClass("chart-marker").length, 3);
    assert.deepEqual(byClass("chart-target").map(target => target.attributes["aria-label"]),
      ["2000 € · Release 1", "1200 € · Release 2", "-400 € · Release 3"]);
    // Onder de x-as staat geen naam; die noemt alleen de tooltip.
    assert.equal(byClass("chart-axis-label").length, 0);
  });

  test("de y-as gebruikt de opmaak voor de streepjes", t => {
    const {byClass} = render(t, {tickFormat: amount => `${amount}`});
    const ticks = byClass("chart-tick").map(tick => tick.textContent);
    assert.ok(ticks.includes("-500") && ticks.includes("1"));
  });

  test("zonder opmaak toont de grafiek de waarden zoals ze zijn", t => {
    const {byClass} = render(t, {format: undefined});
    assert.equal(byClass("chart-target")[0].attributes["aria-label"], "2000 · Release 1");
  });

  test("aanwijzen of focus toont de waarde en het label, weggaan verbergt ze", t => {
    const {tooltip, byClass} = render(t);
    const [crosshair] = byClass("chart-crosshair");
    const target = byClass("chart-target")[1];
    target.dispatch("pointerenter");
    assert.deepEqual(tooltip.children.map(child => [child.tagName, child.textContent]), [["STRONG", "1200 €"], ["SPAN", " · Release 2"]]);
    const center = Number(target.attributes.x) + Number(target.attributes.width) / 2;
    assert.deepEqual([tooltip.hidden, crosshair.attributes.visibility], [false, "visible"]);
    assert.equal(Number(crosshair.attributes.x1), center);
    assert.ok(tooltip.style.top.endsWith("px"));
    assert.deepEqual([tooltip.style.left, tooltip.style.right], ["0px", "auto"]);  // links van het midden
    byClass("chart-target")[2].dispatch("pointerenter");
    assert.deepEqual([tooltip.style.left, tooltip.style.right], ["auto", "0px"]);  // rechts van het midden
    assert.equal(tooltip.style.transform, "translateY(calc(-100% - 12px))");
    target.dispatch("pointerleave");
    assert.deepEqual([tooltip.hidden, crosshair.attributes.visibility], [true, "hidden"]);
    target.dispatch("focus");
    assert.equal(tooltip.hidden, false);
    target.dispatch("blur");
    assert.equal(tooltip.hidden, true);
  });

  test("de grafiek kan elke hoogte krijgen", t => {
    const {svg, byClass} = render(t, {height: 240});
    assert.deepEqual([svg.attributes.width, svg.attributes.height, svg.attributes.viewBox], ["280", "240", "0 0 280 240"]);
    assert.equal(Number(byClass("chart-crosshair")[0].attributes.y2), 240 - CHART_SIZE.margin.bottom);
  });

  test("met dezelfde waarden wordt de grafiek niet opnieuw getekend", t => {
    const {svg, tooltip} = render(t);
    const children = svg.children;
    renderLineChart(svg, tooltip, options);
    assert.equal(svg.children, children);
    renderLineChart(svg, tooltip, {...options, values: [1, 2, 3]});
    assert.notEqual(svg.children, children);
  });
});

describe("renderLineChart met een target", () => {
  const options = {values: [5, 11, null, null], target: [80, 80, 88, 88], labels: ["1", "2", "3", "4"], axisLabel: "Release"};

  function render(t) {
    fakeBrowser(t, {});
    const [svg, tooltip] = [new FakeElement("svg"), new FakeElement("div")];
    renderLineChart(svg, tooltip, options);
    return {svg, tooltip, byClass: name => svg.children.filter(child => child.attributes.class === name)};
  }

  test("het target is een tweede lijn en de y-as past bij het target", t => {
    const {byClass} = render(t);
    assert.equal(byClass("chart-target-line")[0].attributes.points.split(" ").length, 4);
    assert.equal(byClass("chart-tick").map(tick => tick.textContent).includes("100"), true);
  });

  test("ontbrekende waarden krijgen geen punt", t => {
    const {byClass} = render(t);
    assert.equal(byClass("chart-line")[0].attributes.points.split(" ").length, 2);
    assert.equal(byClass("chart-marker").length, 2);
  });

  test("de tooltip noemt de waarde, de release en het target", t => {
    const {tooltip, byClass} = render(t);
    const [first, , third] = byClass("chart-target");
    assert.deepEqual([first, third].map(target => target.attributes["aria-label"]), ["5 · Release 1 · 🎯 80", "– · Release 3 · 🎯 88"]);
    third.dispatch("focus");
    assert.deepEqual(tooltip.children.map(child => child.textContent), ["–", " · Release 3 · 🎯 88"]);
    assert.notEqual(tooltip.style.top, undefined);
  });

  test("zonder waarden en zonder target staat de tooltip onderaan", t => {
    fakeBrowser(t, {});
    const [svg, tooltip] = [new FakeElement("svg"), new FakeElement("div")];
    renderLineChart(svg, tooltip, {values: [null, null], labels: ["1", "2"], axisLabel: "Release"});
    svg.children.find(child => child.attributes.class === "chart-target").dispatch("focus");
    assert.equal(tooltip.style.top, `${CHART_SIZE.height - CHART_SIZE.margin.bottom}px`);
  });
});
