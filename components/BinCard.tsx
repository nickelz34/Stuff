import type { Bin } from "@/types";

type BinCardProps = {
  bin: Bin;
  showPhotos: boolean;
  onOpen: (id: string) => void;
};

const STRIPES =
  "repeating-linear-gradient(-45deg, #FFD500, #FFD500 10px, #0a0a0a 10px, #0a0a0a 20px)";

export default function BinCard({ bin, showPhotos, onOpen }: BinCardProps) {
  const itemCount = bin.items.reduce((total, item) => total + item.qty, 0);
  const flipped = showPhotos && Boolean(bin.photo);

  return (
    <button
      type="button"
      onClick={() => onOpen(bin.id)}
      className="flex flex-col border border-white/10 bg-black text-left transition hover:border-taxi focus:outline-none focus-visible:ring-2 focus-visible:ring-taxi"
    >
      <div className="relative aspect-[4/3] [perspective:900px]">
        <div
          data-bin-face={flipped ? "photo" : "stripes"}
          className={`relative h-full w-full transition-transform duration-500 motion-reduce:transition-none [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)]">
            <div className="h-full w-full" style={{ backgroundImage: STRIPES }} />
            {bin.photo ? (
              <span className="absolute bottom-2 right-2 bg-ink/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-taxi">
                Photo
              </span>
            ) : null}
          </div>
          {bin.photo ? (
            <div className="absolute inset-0 overflow-hidden bg-black [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <img
                src={bin.photo}
                alt={`Photo of bin ${bin.bin_number}`}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
        <span className="absolute left-2 top-2 z-10 bg-ink px-2 py-1 text-2xl font-black leading-none tracking-tight text-taxi">
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
