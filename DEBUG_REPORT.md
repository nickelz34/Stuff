# Stuff debug report

Audited on Node 22.14.0 with next 14.2.35, react 18.3.1, typescript 5.9.3, fflate 0.8.3 and tailwindcss 3.4.19.

## Results

| Check | Before | After |
|---|---|---|
| Build (`npm run build`) | PASS | PASS |
| TypeCheck (`npx tsc --noEmit`) | FAIL: TS5097 at `lib/changelog.test.ts:4` | PASS |
| Lint (`npm run lint`) | FAIL: no lint script, no ESLint installed | PASS, 0 warnings (`--max-warnings 0`) |
| Tests (`npm test`, which uses node:test) | 4/4, but `lib/backup.test.ts` never ran, and if run it failed with `ERR_MODULE_NOT_FOUND` | PASS 10/10, both test files, no Node warnings |
| Hydration | PASS (with a latent risk at `InventoryTools.tsx:77`) | PASS |
| Background stability | PASS | PASS |
| Production photo serving | FAIL: photos added after `next start` returned 404 | PASS |
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

## Known, not fixed (they need a decision)

1. **`npm audit`: 10 advisories (1 critical, 7 high).**
   - The critical one is in `next` itself. 14.2.35 is already the newest 14.x release, and clearing it requires a major upgrade to Next 16.
   - The rest are transitive dependencies of tailwindcss 3 and postcss. `npm audit fix` would clear some without breaking changes.
2. **Orphaned photo files:** `deleteBin` (`app/actions.ts:89-95`) leaves the bin's photo in `public/images`.
3. **Non-atomic writes:** `writeBins` (`lib/inventory-db.ts:26`) writes in place. A crash mid-write can corrupt `inventory.json`. Writing to a temp file and renaming it would make the write atomic.
4. **Tracked but ignored file:** `data/inventory.json` is tracked by git but also listed in `.gitignore`.
5. **Large logo:** `public/stuff-mark.png` is a 400 KB PNG and the largest element on every page load. Compressing it, or using `next/image` with the `sharp` package added, would reduce it.
