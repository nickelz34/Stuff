"use client";

import { useEffect } from "react";
import { APP_VERSION, changelog, formatCentralStamp } from "@/lib/changelog";

type ChangelogDialogProps = {
  onClose: () => void;
};

export default function ChangelogDialog({ onClose }: ChangelogDialogProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden border border-taxi/40 bg-ink sm:max-h-[90dvh] sm:max-w-lg"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <h2 id="changelog-title" className="text-2xl font-black tracking-tight text-taxi">
              Changelog
            </h2>
            <p className="pt-1 text-xs uppercase tracking-wider text-white/50">
              Current version {APP_VERSION}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wider"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <ol className="space-y-5">
            {changelog.map((entry) => (
              <li key={entry.version} className="border border-white/10 bg-black px-3 py-3">
                <p className="text-lg font-black text-taxi">v{entry.version}</p>
                <time dateTime={entry.releasedAt} className="mt-1 block text-sm text-white/70">
                  {formatCentralStamp(entry.releasedAt)}
                </time>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="text-xs text-white/45">
            Times are Central Time. CDT is used while daylight saving time is in effect, and CST otherwise.
          </p>
        </div>
      </div>
    </div>
  );
}
