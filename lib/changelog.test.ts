import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_VERSION, changelog, formatCentralStamp } from "./changelog.ts";

function centralOffset(iso: string): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(iso))
    .find((part) => part.type === "timeZoneName")?.value;
  return name?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "";
}

test("the current version is the newest changelog entry", () => {
  assert.equal(APP_VERSION, changelog[0].version);
  assert.equal(APP_VERSION, "0.7.0");
});

test("README and package.json stay on the app version", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  assert.match(readme, new RegExp(`^Current version: ${APP_VERSION}$`, "m"));
  assert.equal(pkg.version, APP_VERSION);
});

test("changelog stamps are exact Central Time, newest first", () => {
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (const entry of changelog) {
    assert.equal(seen.has(entry.version), false);
    seen.add(entry.version);
    assert.match(entry.releasedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[56]:00$/);
    assert.equal(entry.releasedAt.slice(-6), centralOffset(entry.releasedAt));
    assert.ok(entry.changes.length > 0);
    const instant = Date.parse(entry.releasedAt);
    assert.equal(Number.isNaN(instant), false);
    assert.ok(instant < previous);
    previous = instant;
  }
});

test("stamps render in Central Time with seconds", () => {
  assert.equal(formatCentralStamp("2026-09-21T22:40:05-05:00"), "Sep 21, 2026, 10:40:05 PM CDT");
  assert.equal(formatCentralStamp("2026-01-15T12:00:00-06:00"), "Jan 15, 2026, 12:00:00 PM CST");
});
