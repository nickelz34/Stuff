# Stuff debug report

Audited on Node 22.14.0. The original stack was next 14.2.35, react 18.3.1, tailwindcss 3.4.19 and typescript 5.9.3. To clear `npm audit`, it is now next 15.5.27, react 19, tailwindcss 4.3.3 and ESLint 10 (see "Second pass" below).

## Results

| Check | Before | After |
|---|---|---|
| Build (`npm run build`) | PASS | PASS, no warnings |
| TypeCheck (`npx tsc --noEmit`) | FAIL: TS5097 at `lib/changelog.test.ts:4` | PASS |
| Lint (`npm run lint`) | FAIL: no lint script, no ESLint installed | PASS, 0 warnings (`--max-warnings 0`) |
| Tests (`npm test`, which uses node:test) | 4/4, but `lib/backup.test.ts` never ran, and if run it failed with `ERR_MODULE_NOT_FOUND` | PASS 14/14, all three test files, no Node warnings |
| `npm audit` | 10 vulnerabilities (1 critical, 7 high, 2 moderate) | 0 vulnerabilities |
| Hydration | PASS (with a latent risk at `InventoryTools.tsx:77`) | PASS |
| Background stability | PASS | PASS |
| Production photo serving | FAIL: photos added after `next start` returned 404 | PASS |
| `inventory.json` writes | Overwritten in place; a crash mid-write could corrupt it | Atomic (temp file plus rename) |
| `data/inventory.json` in git | Tracked even though `.gitignore` lists it | Untracked; a missing file means an empty inventory |
| fflate non-blocking | Server-side, blocking (see below) | Unchanged, measured and documented |

Notes:
- `next build` passed even before the fix because its type check does not report TS5097. Only standalone `tsc` failed.
- Bare `node --test` finds 0 files on Node 22, because the default patterns skip `.ts` unless type stripping is enabled. Use `npm test`.

## Architecture (Phase 1)

- **App Router only** (there is no `pages/`).
  - `app/layout.tsx`: server component.
  - `/` is `app/page.tsx`: client component.
  - `/api/backup` is `app/api/backup/route.ts`: Node.js runtime, GET and POST.
  - `/images/[name]` is `app/images/[name]/route.ts`: new.
  - `app/error.tsx`: new.
  - There is no `loading.tsx`, `not-found.tsx` or `global-error.tsx`.
- **There is a server side.** Server Actions in `app/actions.ts` write `data/inventory.json` and `public/images/`, and fflate runs in the backup route.
- **Environment variables:** there is no `process.env` usage. Storage paths come from `process.cwd()` (`lib/inventory-db.ts:5-6`), so the server must be started from the project root.
- **Tailwind:** the content globs (`app/**`, `components/**`) cover every file that uses classes. There are no dynamic class fragments; every template literal switches between complete class names.

## Runtime evidence (Phase 3)

How it was tested:
- Headless Chrome 148, driven by puppeteer-core against `next dev`, running in React StrictMode (the default for the App Router).
- `addEventListener`/`removeEventListener` and the timer functions were instrumented before any page script ran.
- Counts below include only listeners whose target is still attached to the DOM.

| Step | Live listeners | Live intervals | Pending timeouts | JS heap |
|---|---|---|---|---|
| Baseline | 273 | 1 | 0 | 26.1 MB |
| After 60 s idle | 273 | 1 | 0 | 25.9 MB |
| After opening and closing BinDetail 10 times (Close button and Escape alternated, typing in notes) | 273 | 1 | 0 | 27.2 MB |
| After opening and closing the changelog 10 times | 273 | 1 | 0 | 27.4 MB |
| After switching Bins/Photos 10 times (flip animation timers) | 273 | 1 | 0 | 27.4 MB |
| After 10 search filter cycles | 273 | 1 | 0 | 27.4 MB |
| After 6 HMR saves of `BinCard.tsx`, then one open/close | 289 | 1 | 6 | 28.1 MB |

Those numbers are from the first pass, on Next 14. On the final stack (Next 15 and React 19) the same probe gives a higher but equally flat baseline, because Next 15's dev overlay adds its own listeners:

| Step (final stack) | Live listeners | Live intervals | Pending timeouts | JS heap |
|---|---|---|---|---|
| Baseline | 568 | 1 | 0 | 33.7 MB |
| After 60 s idle | 568 | 1 | 0 | 33.7 MB |
| After 40 dialog, toggle and search cycles | 568 | 1 | 0 | 35.4 MB |
| After 6 HMR saves, then one open/close | 582 (+14 dev CSS `<link>` listeners) | 1 | 6 | 36.3 MB |

What the numbers mean:
- **The single interval** is Next's dev HMR runtime. It is not app code; the app has no `setInterval`.
- **The HMR increase** (+16 listeners) is all `load` and `error` listeners on Next's dev CSS `<link>` reloads. None of it is app code. The 6 pending timeouts are still pending 3 s after HMR. The app's own timers all fire within 500 ms, so these belong to the dev runtime. A reload resets everything to baseline.
- **Detached inputs:** React leaves its per-element `invalid` listeners on input elements after they are removed from the page. They are garbage-collected with the nodes and do not accumulate.
- **Navigation:** the app has a single page route, so the dialog open/close cycles above stand in for the requested navigation test.
- **Console:** no hydration errors, unhandled rejections or React warnings in the browser console or the dev terminal. Before the fix there was one console error, a `/favicon.ico` 404; it is now fixed.
- **Shutdown:** Ctrl+C on both `next dev` and `next start` exits immediately and leaves no `next` processes.
- **Production:** with `next build && next start`, an end-to-end run uploaded a photo through the UI and the photo rendered. Typing notes and pressing Escape saved them. Every card photo rendered after a reload. The browser log was empty.

## Background stability: every timer, listener and observer

| Location | Resource | Cleanup |
|---|---|---|
| `components/BinCard.tsx:30-31` | Two `setTimeout` calls for the flip animation | `clearTimeout` at lines 33-34 in the effect cleanup |
| `components/BinDetail.tsx:75` | `setTimeout` follow-ups after the keyboard animates | Cleared at line 74 before rescheduling, and at line 89 on unmount |
| `components/BinDetail.tsx:79` | `matchMedia` `change` listener | Removed at line 85 |
| `components/BinDetail.tsx:80-81` | `visualViewport` `resize` and `scroll` listeners | Removed at lines 86-87 |
| `components/BinDetail.tsx:82` | Sheet `focusin` listener | Removed at line 88 |
| `components/BinDetail.tsx:136` | `requestAnimationFrame` (one-shot) | Runs once; the callback null-checks its ref |
| `components/BinDetail.tsx:163-165` | Add button `touchstart`, `touchend` and `mousedown` listeners | Removed at lines 168-170 |
| `components/BinDetail.tsx:217` | Window `keydown` listener (Escape) | Removed at line 218. It now subscribes once per mount. |
| `components/ChangelogDialog.tsx:15` | Window `keydown` listener (Escape) | Removed at line 16. It now subscribes once per mount. |
| Observers (Resize, Intersection, Mutation) | None used | n/a |
| `setInterval` | None used | n/a |

Other checks: no `useEffect` lacks a dependency array. The async effect in `app/page.tsx` that loads bins is guarded by an `active` flag. There is no `console.*`, `TODO`, `FIXME`, `@ts-ignore` or `eslint-disable` in the source.

## fflate performance

- **fflate never runs in the browser.**
  - `zipSync` (`lib/backup.ts:68`) runs in `GET /api/backup`.
  - `unzipSync` (`lib/backup.ts:84`) runs in `POST /api/backup`.
  - The client only follows a link or posts a `FormData`, so the UI cannot freeze, and a Web Worker would not help.
- **On the server, compression blocks the event loop.** Measured with a synthetic 70 MB backup (70 photos of 1 MB each plus 2,000 bins):
  - `zipSync` holds the event loop for about 200 ms.
  - `unzipSync` holds it for about 46 ms.
  - fflate's async `zip`/`unzip` stall just as long. Photos are stored with `level: 0`, and fflate processes stored entries on the calling thread. So switching APIs, which the plan proposed, would have no effect, and the code was left as is.
- **Verdict:** compression is not non-blocking. At the 80 MB archive cap it blocks the server for roughly a quarter second, which is acceptable for a single-user inventory app. If backups grow, move `buildBackupArchive` and `parseBackupArchive` into a `worker_threads` worker.

## Files changed

| File | Why |
|---|---|
| `tsconfig.json` | Set `allowImportingTsExtensions`. Fixes TS5097 for the `.ts` imports that Node's type stripping requires. |
| `lib/backup.test.ts` | Import `./backup.ts`. Node ES module resolution cannot find an import without an extension. |
| `package.json` | `test` now runs `lib/*.test.ts` without the ExperimentalWarning. Added `"type": "module"`, which removes the `MODULE_TYPELESS_PACKAGE_JSON` warning (all configs are already `.mjs` or `.ts`). Added `lint: next lint --max-warnings 0`. Added `eslint@8` and `eslint-config-next@14.2.35`. |
| `package-lock.json` | Lockfile update for the ESLint dev dependencies. |
| `.eslintrc.json` | `next/core-web-vitals`. Turns off `no-img-element` with a reason: photos are written at runtime and cache-busted. |
| `components/InventoryTools.tsx` | Removed `new Date()` from the backup link's `download` attribute. It could cause a hydration mismatch across midnight UTC, and the server already names the file. |
| `app/images/[name]/route.ts` (new) | `next start` only serves `public/` files that existed at boot. This fallback serves photos uploaded or restored later. It validates names with the backup rules (traversal and unknown names return 404). |
| `components/BinDetail.tsx` | Escape now goes through `handleClose` (via a ref), so pending notes and bin number are saved instead of lost. The keydown listener no longer re-subscribes on every render. Removed the bin-change reset effect, which caused an exhaustive-deps warning. |
| `app/page.tsx` | `useCallback` close handlers (stable listener subscriptions). `localStorage` wrapped in try/catch, because it throws when storage is blocked. `key={selected.id}` on `BinDetail`, so a different bin remounts with fresh state. |
| `components/BinCard.tsx` | Explicit `"use client"`: it uses hooks and `window`. |
| `app/error.tsx` (new) | Error boundary with a retry button, instead of the default crash screen. |
| `app/layout.tsx` | `icons` metadata: removes the `/favicon.ico` 404 console error. |

Second-pass changes are described in the next section. They are:
- `.eslintrc.json` replaced by `eslint.config.mjs`
- dependency upgrades and `overrides` in `package.json`
- `tailwind.config.ts` folded into `app/globals.css`
- `postcss.config.mjs`
- class renames in `app/page.tsx` and `components/*.tsx`
- `next.config.mjs`
- `next-env.d.ts`
- `lib/inventory-db.ts` and `lib/inventory-db.test.ts` (new)
- `tsconfig.json` (`target`)
- `.gitignore`
- `data/inventory.json` (untracked)

## Second pass: npm audit and inventory.json

### npm audit: 10 vulnerabilities down to 0

| Advisory source | Why it couldn't be patched in place | Fix |
|---|---|---|
| `next@14.2.35`: 1 critical (RCE in the image optimizer), plus RSC and Server Action DoS, SSRF, cache poisoning | Every fix ships only in 15.5.24 or later, and 14.2.35 is the newest 14.x | Upgraded to `next@15.5.27` with `react`/`react-dom` 19. Route handler `params` is now a Promise (`app/images/[name]/route.ts`). |
| `postcss` < 8.5.10, pinned by `next` (8.4.31) | Next pins the exact version | npm `overrides` forces the project's `postcss@^8.5.29` everywhere |
| `braces`, plus everything that uses it (`micromatch`, `chokidar`, `fast-glob`) | Every `braces` version is flagged and none is patched | Tailwind CSS 4, which no longer uses these packages. `eslint-config-next` was dropped because every version pulls `fast-glob` in. |
| `postcss-selector-parser` < 7.1.6, via `tailwindcss@3` | Tailwind 3 pins 6.x | Tailwind CSS 4 |

**Tailwind 4 migration**
- Done with the official `@tailwindcss/upgrade` tool. Theme colors moved into `@theme` in `app/globals.css`, `@tailwindcss/postcss` replaced `tailwindcss` plus `autoprefixer`, and renamed utilities were updated (`outline-hidden`, `backdrop-blur-sm`, `aspect-4/3`).
- One manual fix: the custom rules in `globals.css` now live in `@layer base`. Otherwise the unlayered `font: inherit` would override utilities such as `text-xs` and `font-black`.
- Restored v3's pointer cursor on buttons and its placeholder color.
- Screenshots of five screens at desktop and phone sizes, before and after, are pixel-identical except for two things. Next 15's dev-only "N" badge appears, and the file-picker button text is heavier because Tailwind 4 now applies the existing `file:font-black` class.

**Lint**
- The lint stack is now ESLint 10 with `@eslint/js`, `typescript-eslint` and `eslint-plugin-react-hooks` (`rules-of-hooks` and `exhaustive-deps`), in `eslint.config.mjs`.
- The Next.js-specific lint rules are gone along with `eslint-config-next`. They mostly target Pages Router, `next/script` and font usage, none of which Stuff has.
- `next build` skips its own lint pass (`eslint.ignoreDuringBuilds`). Otherwise it warns that the Next plugin is missing. `npm run lint` is the lint gate.

### inventory.json

- **Atomic writes:** `lib/inventory-db.ts` writes `data/.inventory-<uuid>.tmp` and then `rename()`s it over `inventory.json`. A crash can leave a stray temp file (now gitignored) but never a truncated inventory.
- **Missing file:** `readBins` now returns `[]` when the file is missing. A corrupt file still raises an error instead of being silently replaced.
- **Tests:** `lib/inventory-db.test.ts` covers four cases: a missing file, a round trip with no leftover temp files, 25 concurrent queued writes, and a corrupt file being rejected.
- **No longer tracked:** `data/inventory.json` was removed from the git index. Your local copy stays on disk.
- **Fresh clone check:** a fresh clone with `next start` shows the empty "No bins yet" state. Adding three bins created a valid `data/inventory.json`, and `git status` stayed clean.

**Updating an existing checkout:**
- If your `data/inventory.json` has real edits, `git pull` refuses to run ("would be overwritten by merge"), so nothing is lost. To update:

```bash
cp data/inventory.json ~/inventory-keep.json
git checkout -- data/inventory.json
git pull
mkdir -p data && cp ~/inventory-keep.json data/inventory.json
```

- If the file is still the unedited sample, the pull deletes it and the app starts empty.

**Second-pass verification:**
- `npm ci` ran from a clean state. Then `npm audit`, `tsc`, lint, tests (14/14) and build all passed.
- Dev probe: 60 s idle, 40 interaction cycles and 6 HMR saves, with no leaks or warnings.
- Production end to end: photo upload, Escape saving notes, and backup download plus restore (200, 6 bins and 1 photo).
- Ctrl+C exits cleanly from both servers.

## Still open

1. **Orphaned photo files:** `deleteBin` (`app/actions.ts:89-95`) leaves the bin's photo in `public/images`, so disk use grows over time.
2. **Large logo:** `public/stuff-mark.png` is a 400 KB PNG and the largest element on every page load. Compressing it, or using `next/image` with `sharp`, would reduce it.
3. **Uploads always saved as `.jpg`:** `uploadBinPhoto` (`app/actions.ts:200`) names every upload `.jpg` whatever its real format. Browsers sniff the content so the image displays, but a PNG or HEIC ends up with the wrong extension in backups.
4. **Backup blocks the server briefly:** see the fflate section above.
