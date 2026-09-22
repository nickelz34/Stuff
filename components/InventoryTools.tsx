"use client";

import { useState } from "react";

type InventoryToolsProps = {
  showPhotos: boolean;
  onShowPhotos: (showPhotos: boolean) => void;
  onRestored: () => Promise<void>;
};

export default function InventoryTools({
  showPhotos,
  onShowPhotos,
  onRestored,
}: InventoryToolsProps) {
  const [busy, setBusy] = useState<"restore" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmRestore() {
    if (!pendingFile) return;
    setBusy("restore");
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("backup", pendingFile);
      const response = await fetch("/api/backup", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        bins?: number;
        photos?: number;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not restore that backup.");
      }
      setPendingFile(null);
      await onRestored();
      const bins = payload?.bins ?? 0;
      const photos = payload?.photos ?? 0;
      setMessage(`Restored ${bins} ${bins === 1 ? "bin" : "bins"} and ${photos} ${photos === 1 ? "photo" : "photos"}.`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore that backup.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex border border-taxi" role="group" aria-label="Bin picture">
          <button
            type="button"
            aria-pressed={!showPhotos}
            onClick={() => onShowPhotos(false)}
            className={`px-3 py-2 text-xs font-black uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-taxi ${
              showPhotos ? "text-taxi" : "bg-taxi text-ink"
            }`}
          >
            Bins
          </button>
          <button
            type="button"
            aria-pressed={showPhotos}
            onClick={() => onShowPhotos(true)}
            className={`border-l border-taxi px-3 py-2 text-xs font-black uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-taxi ${
              showPhotos ? "bg-taxi text-ink" : "text-taxi"
            }`}
          >
            Photos
          </button>
        </div>
        <a
          href="/api/backup"
          download={`stuff-backup-${new Date().toISOString().slice(0, 10)}.zip`}
          className="border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:border-taxi hover:text-taxi focus:outline-none focus-visible:ring-2 focus-visible:ring-taxi"
        >
          Backup
        </a>
        <label className="border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:border-taxi hover:text-taxi focus-within:ring-2 focus-within:ring-taxi">
          Restore
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy !== null}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              setMessage(null);
              setError(null);
              if (!file) return;
              if (!file.name.toLowerCase().endsWith(".zip")) {
                setPendingFile(null);
                setError("Choose a .zip backup file.");
                return;
              }
              setPendingFile(file);
            }}
          />
        </label>
      </div>

      {pendingFile ? (
        <div className="flex flex-wrap items-center gap-2 border border-taxi/50 px-3 py-3">
          <p className="min-w-0 flex-1 text-sm">
            Replace all bins and photos with <span className="font-bold">{pendingFile.name}</span>?
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void confirmRestore()}
            className="bg-taxi px-3 py-2 text-xs font-black uppercase tracking-wider text-ink disabled:opacity-50"
          >
            {busy === "restore" ? "Restoring…" : "Replace"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setPendingFile(null)}
            className="border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="status" className="text-sm text-taxi">
          {error}
        </p>
      ) : message ? (
        <p role="status" className="text-sm text-white/70">
          {message}
        </p>
      ) : null}
    </div>
  );
}
