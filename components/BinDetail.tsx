"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  addItem,
  deleteBin,
  deleteItem,
  updateBinNumber,
  updateNotes,
  updateQty,
  uploadBinPhoto,
} from "@/app/actions";
import type { Bin } from "@/types";

type BinDetailProps = {
  bin: Bin;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

const PHONE_QUERY = "(max-width: 639px)";
// Taller than the Safari toolbar, shorter than the software keyboard.
const KEYBOARD_INSET_THRESHOLD = 120;

function usePhoneKeyboardLock(sheetRef: RefObject<HTMLDivElement | null>) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const phoneQuery = window.matchMedia(PHONE_QUERY);
    let followUps: number[] = [];

    const resetSheet = () => {
      sheet.style.position = "";
      sheet.style.left = "";
      sheet.style.right = "";
      sheet.style.top = "";
      sheet.style.bottom = "";
      sheet.style.height = "";
      sheet.style.maxHeight = "";
    };

    const sync = () => {
      const viewport = window.visualViewport;
      if (!viewport || !phoneQuery.matches) {
        resetSheet();
        setKeyboardOpen((open) => (open ? false : open));
        return;
      }

      const inset = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
      if (inset < KEYBOARD_INSET_THRESHOLD) {
        resetSheet();
        setKeyboardOpen((open) => (open ? false : open));
        return;
      }

      // Keep the sheet inside the visible area above the keyboard. iOS pans the
      // visual viewport on the first focus, which otherwise scrolls this field away.
      sheet.style.position = "fixed";
      sheet.style.left = "0";
      sheet.style.right = "0";
      sheet.style.top = `${viewport.offsetTop}px`;
      sheet.style.bottom = "auto";
      sheet.style.height = `${viewport.height}px`;
      sheet.style.maxHeight = `${viewport.height}px`;
      setKeyboardOpen((open) => (open ? open : true));
    };

    const syncAfterKeyboardAnimates = () => {
      sync();
      for (const id of followUps) window.clearTimeout(id);
      followUps = [50, 250, 500].map((delay) => window.setTimeout(sync, delay));
    };

    sync();
    phoneQuery.addEventListener("change", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    sheet.addEventListener("focusin", syncAfterKeyboardAnimates);

    return () => {
      phoneQuery.removeEventListener("change", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      sheet.removeEventListener("focusin", syncAfterKeyboardAnimates);
      for (const id of followUps) window.clearTimeout(id);
      resetSheet();
    };
  }, [sheetRef]);

  return keyboardOpen;
}

export default function BinDetail({ bin, onClose, onChanged }: BinDetailProps) {
  const [notes, setNotes] = useState(bin.notes);
  const [binNumber, setBinNumber] = useState(bin.bin_number);
  const [itemName, setItemName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef(notes);
  const savedNotes = useRef(bin.notes);
  const binNumberRef = useRef(bin.bin_number);
  const savedNumber = useRef(bin.bin_number);
  const numberSave = useRef<Promise<boolean> | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyboardOpen = usePhoneKeyboardLock(sheetRef);
  notesRef.current = notes;
  binNumberRef.current = binNumber;

  useEffect(() => {
    const scrollY = window.scrollY;
    const { body } = document;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    setNotes(bin.notes);
    savedNotes.current = bin.notes;
    setBinNumber(bin.bin_number);
    binNumberRef.current = bin.bin_number;
    savedNumber.current = bin.bin_number;
    setItemName("");
    setConfirmDelete(false);
    setError(null);
  }, [bin.id]);

  useEffect(() => {
    if (binNumberRef.current !== savedNumber.current) return;
    setBinNumber(bin.bin_number);
    binNumberRef.current = bin.bin_number;
    savedNumber.current = bin.bin_number;
  }, [bin.bin_number]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function flushNotes() {
    if (notesRef.current === savedNotes.current) return;
    await updateNotes(bin.id, notesRef.current);
    savedNotes.current = notesRef.current;
  }

  function saveBinNumber(): Promise<boolean> {
    if (numberSave.current) return numberSave.current;
    const typed = binNumberRef.current;
    if (typed.trim() === savedNumber.current) {
      if (typed !== savedNumber.current) {
        setBinNumber(savedNumber.current);
        binNumberRef.current = savedNumber.current;
      }
      return Promise.resolve(true);
    }

    const pending = (async () => {
      setBusy(true);
      setError(null);
      try {
        await flushNotes();
        const result = await updateBinNumber(bin.id, typed);
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        setBinNumber(result.binNumber);
        binNumberRef.current = result.binNumber;
        savedNumber.current = result.binNumber;
        await onChanged();
        return true;
      } catch {
        setError("Could not save that change.");
        return false;
      } finally {
        setBusy(false);
        numberSave.current = null;
      }
    })();

    numberSave.current = pending;
    return pending;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await flushNotes();
      await task();
      await onChanged();
    } catch {
      setError("Could not save that change.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    const saved = await saveBinNumber();
    if (!saved) return;
    setBusy(true);
    try {
      await flushNotes();
      await onChanged();
    } catch {
      setError("Could not save notes.");
      setBusy(false);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/80 sm:items-center sm:p-6">
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bin-detail-title"
        className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden border border-taxi/40 bg-ink sm:h-auto sm:max-h-[90dvh] sm:max-w-lg"
      >
        <header className="shrink-0 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <h2 id="bin-detail-title" className="flex min-w-0 items-center gap-2 text-3xl font-black tracking-tight text-taxi">
              <span>Bin</span>
              <input
                value={binNumber}
                inputMode="numeric"
                aria-label="Bin number"
                disabled={busy}
                onChange={(event) => setBinNumber(event.target.value)}
                onBlur={() => {
                  void saveBinNumber();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                className="w-24 border border-white/15 bg-black px-2 py-1 text-3xl font-black tracking-tight text-taxi outline-none focus:border-taxi focus:ring-2 focus:ring-taxi disabled:opacity-50"
              />
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wider"
            >
              Close
            </button>
          </div>
          {error ? <p className="pt-2 text-sm text-taxi">{error}</p> : null}
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-4 py-4">
          <div className="space-y-3">
            <div className="aspect-[4/3] overflow-hidden border border-white/10 bg-black">
              {bin.photo ? (
                <img
                  src={bin.photo}
                  alt={`Photo of bin ${bin.bin_number}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm uppercase tracking-[0.2em] text-white/40">
                  No photo
                </div>
              )}
            </div>
            <label className="block text-xs font-bold uppercase tracking-wider text-taxi">
              Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const formData = new FormData();
                  formData.set("binId", bin.id);
                  formData.set("photo", file);
                  void run(() => uploadBinPhoto(formData).then(() => undefined));
                }}
                className="mt-2 block w-full text-sm text-white file:mr-3 file:border-0 file:bg-taxi file:px-3 file:py-2 file:font-black file:text-ink"
              />
            </label>
          </div>

          <label className="block text-xs font-bold uppercase tracking-wider text-taxi">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => {
                void run(async () => undefined);
              }}
              rows={3}
              placeholder="What's in this bin?"
              className="mt-2 w-full resize-y border border-white/15 bg-black px-3 py-2 text-base text-white outline-none focus:border-taxi focus:ring-2 focus:ring-taxi"
            />
          </label>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-taxi">Items</h3>
            {bin.items.length === 0 ? (
              <p className="text-sm text-white/50">No items yet.</p>
            ) : (
              <ul className="space-y-2">
                {bin.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 border border-white/10 bg-black px-2 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    <div className="flex items-center border border-white/15">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Decrease ${item.name}`}
                        onClick={() =>
                          void run(() => updateQty(bin.id, item.id, item.qty - 1))
                        }
                        className="px-3 py-1 text-lg font-black text-taxi disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center text-sm font-bold">{item.qty}</span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Increase ${item.name}`}
                        onClick={() =>
                          void run(() => updateQty(bin.id, item.id, item.qty + 1))
                        }
                        className="px-3 py-1 text-lg font-black text-taxi disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => deleteItem(bin.id, item.id))}
                      className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-white/70"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

          </section>

        </div>

        <form
          className="flex shrink-0 gap-2 border-t border-white/10 bg-ink px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const name = itemName.trim();
            if (!name) return;
            void run(async () => {
              await addItem(bin.id, name);
              setItemName("");
            });
          }}
        >
          <input
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Add an item"
            enterKeyHint="done"
            className="min-w-0 flex-1 border border-white/15 bg-black px-3 py-2 text-base outline-none focus:border-taxi focus:ring-2 focus:ring-taxi"
          />
          <button
            type="submit"
            disabled={busy || !itemName.trim()}
            className="bg-taxi px-4 py-2 font-black text-ink disabled:opacity-40"
          >
            Add
          </button>
        </form>

        <footer
          className={`shrink-0 border-t border-white/10 bg-ink px-4 py-3 ${
            keyboardOpen ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deleteBin(bin.id);
                    onClose();
                  })
                }
                className="flex-1 bg-taxi py-3 font-black text-ink"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-white/20 py-3 font-bold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full border border-taxi/60 py-3 font-bold uppercase tracking-wider text-taxi"
            >
              Delete bin
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
