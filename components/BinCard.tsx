import type { Bin } from "@/types";

type BinCardProps = {
  bin: Bin;
  onOpen: (id: string) => void;
};

export default function BinCard({ bin, onOpen }: BinCardProps) {
  const itemCount = bin.items.reduce((total, item) => total + item.qty, 0);

  return (
    <button
      type="button"
      onClick={() => onOpen(bin.id)}
      className="flex flex-col overflow-hidden border border-white/10 bg-black text-left transition hover:border-taxi focus:outline-none focus-visible:ring-2 focus-visible:ring-taxi"
    >
      <div className="relative aspect-[4/3] bg-taxi">
        {bin.photo ? (
          <img
            src={bin.photo}
            alt={`Bin ${bin.bin_number}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, #FFD500, #FFD500 10px, #0a0a0a 10px, #0a0a0a 20px)",
            }}
          />
        )}
        <span className="absolute left-2 top-2 bg-ink px-2 py-1 text-2xl font-black leading-none tracking-tight text-taxi">
          {bin.bin_number}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-white/80">
          {bin.notes || "No notes"}
        </p>
        <p className="text-xs font-bold uppercase tracking-wider text-taxi">
          {bin.items.length} {bin.items.length === 1 ? "item" : "items"}
          <span className="text-white/50"> · {itemCount} qty</span>
        </p>
      </div>
    </button>
  );
}
