type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="mt-3 block">
      <span className="sr-only">Search bins</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search bin, notes, or item"
        autoComplete="off"
        className="w-full border border-white/15 bg-black px-4 py-3 text-base text-white outline-none placeholder:text-white/35 focus:border-taxi focus:ring-2 focus:ring-taxi"
      />
    </label>
  );
}
