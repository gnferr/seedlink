import test from "node:test";
import assert from "node:assert/strict";
import { timeFromClock, clockFromTime, periodAt, timeLabel, skyState, seasonSky } from "./daycycle.ts";

test("timeFromClock maps 06:00-23:00 linearly and clamps", () => {
  assert.equal(timeFromClock(6, 0), 0);
  assert.equal(timeFromClock(23, 0), 1);
  assert.equal(timeFromClock(23, 30), 1);
  assert.equal(timeFromClock(3, 0), 1);
  assert.equal(timeFromClock(14, 30), (14.5 - 6) / 17);
});

test("clock round trip, periods and label", () => {
  assert.deepEqual(clockFromTime(timeFromClock(18, 40)), { hours: 18, minutes: 40 });
  const p = (h: number) => periodAt(timeFromClock(h, 0));
  assert.equal(p(7), "Dawn");
  assert.equal(p(12), "Day");
  assert.equal(p(18), "Sunset");
  assert.equal(p(20), "Dusk");
  assert.equal(p(22), "Night");
  assert.equal(timeLabel(timeFromClock(18, 40)), "Sunset, 18:40");
});

test("skyState is continuous across the slider", () => {
  const cols = (t: number) => {
    const s = skyState(t);
    return [...s.sky, s.light, s.ambient, s.haze, s.cloudLit, s.cloudDark].flat();
  };
  let prev = cols(0);
  for (let i = 1; i <= 1000; i++) {
    const cur = cols(i / 1000);
    cur.forEach((v, k) => assert.ok(Math.abs(v - prev[k]) <= 12, `jump at step ${i}`));
    prev = cur;
  }
});

test("sun, moon, stars", () => {
  assert.equal(skyState(timeFromClock(12, 0)).sun.up, true);
  assert.equal(skyState(timeFromClock(21, 0)).sun.up, false);
  assert.equal(skyState(timeFromClock(22, 0)).moon.up, true);
  assert.equal(skyState(timeFromClock(12, 0)).starAlpha, 0);
  assert.ok(skyState(timeFromClock(22, 30)).starAlpha >= 0.95);
  assert.equal(skyState(timeFromClock(9, 0)).keyFromLeft, true);
  assert.equal(skyState(timeFromClock(17, 0)).keyFromLeft, false);
});

test("seasonSky: summer is untouched, winter pales the day, the tint mostly fades at night", () => {
  const noon = skyState(timeFromClock(12, 0)), late = skyState(timeFromClock(23, 0));
  const light = (c: number[]) => c[0] + c[1] + c[2];
  assert.deepEqual(seasonSky(noon, "SUMMER"), noon.sky);
  assert.ok(light(seasonSky(noon, "WINTER")[0]) > light(noon.sky[0]) + 60);
  const shift = (s: typeof noon) => light(seasonSky(s, "WINTER")[0]) - light(s.sky[0]);
  assert.ok(shift(late) < shift(noon) * 0.6, "night keeps its dark sky");
});
