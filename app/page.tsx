"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addBin, getBins } from "@/app/actions";
import BinCard from "@/components/BinCard";
import BinDetail from "@/components/BinDetail";
import SearchBar from "@/components/SearchBar";
import type { Bin } from "@/types";

export default function HomePage() {
  const [bins, setBins] = useState<Bin[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getBins();
    setBins(next);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    getBins()
      .then((next) => {
        if (!active) return;
        setBins(next);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Could not load bins.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bins;
    return bins.filter((bin) => {
      if (bin.bin_number.toLowerCase().includes(needle)) return true;
      if (bin.notes.toLowerCase().includes(needle)) return true;
      return bin.items.some((item) => item.name.toLowerCase().includes(needle));
    });
  }, [bins, query]);

  const selected = bins.find((bin) => bin.id === selectedId) ?? null;

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const created = await addBin();
      await refresh();
      setSelectedId(created.id);
    } catch {
      setError("Could not add a bin.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-16">
      <header className="flex items-end justify-between gap-4 pb-2 pt-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-taxi">Inventory</p>
          <h1 className="text-5xl font-black leading-none tracking-tight">Stuff</h1>
        </div>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding}
          className="bg-taxi px-4 py-3 text-sm font-black uppercase tracking-wider text-ink disabled:opacity-50"
        >
          + Bin
        </button>
      </header>

      <SearchBar value={query} onChange={setQuery} />

      {error ? <p className="mt-4 text-sm text-taxi">{error}</p> : null}

      {loading ? (
        <p className="mt-8 text-sm uppercase tracking-wider text-white/50">Loading bins…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 border border-dashed border-taxi/50 px-4 py-8 text-center text-sm text-white/70">
          {bins.length === 0 ? "No bins yet. Add one to start." : "No bins match that search."}
        </p>
      ) : (
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((bin) => (
            <BinCard key={bin.id} bin={bin} onOpen={setSelectedId} />
          ))}
        </section>
      )}

      {selected ? (
        <BinDetail
          bin={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      ) : null}
    </main>
  );
}
