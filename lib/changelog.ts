export type ChangelogEntry = {
  version: string;
  /** Exact release instant, with the Central Time offset for that date. */
  releasedAt: string;
  changes: readonly string[];
};

// Source of truth for the app version. README "Current version" and
// package.json "version" must match APP_VERSION. lib/changelog.test.ts checks that.
export const changelog: readonly ChangelogEntry[] = [
  {
    version: "0.7.0",
    releasedAt: "2026-09-21T22:51:00-05:00",
    changes: [
      "Added a version number next to the Stuff logo.",
      "Tap the version to open this changelog.",
      "Each update is stamped with the exact Central Time.",
    ],
  },
  {
    version: "0.6.0",
    releasedAt: "2026-09-21T22:40:05-05:00",
    changes: [
      "The keyboard stays open after you tap Add.",
      "The cursor stays in the empty item field so the next item can be typed right away.",
    ],
  },
  {
    version: "0.5.0",
    releasedAt: "2026-09-21T22:23:02-05:00",
    changes: [
      "Bin cards flip between the bin number and the photo.",
      "Back up the inventory to a zip file and restore it.",
    ],
  },
  {
    version: "0.4.0",
    releasedAt: "2026-09-21T22:21:17-05:00",
    changes: ["The add-item field stays visible above the iPhone keyboard."],
  },
  {
    version: "0.3.0",
    releasedAt: "2026-09-21T17:14:50-05:00",
    changes: ["Bin numbers can be edited, and a number already in use is rejected."],
  },
  {
    version: "0.2.0",
    releasedAt: "2026-09-21T17:12:36-05:00",
    changes: ["Added the retro Stuff logo."],
  },
  {
    version: "0.1.0",
    releasedAt: "2026-09-21T15:08:27-05:00",
    changes: [
      "First version of Stuff: bins, notes, photos, and items.",
      "Search bin numbers, notes, and item names.",
    ],
  },
];

export const APP_VERSION = changelog[0].version;

const centralStamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

export function formatCentralStamp(iso: string): string {
  return centralStamp.format(new Date(iso));
}
