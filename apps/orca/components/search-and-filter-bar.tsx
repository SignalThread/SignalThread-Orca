type SearchAndFilterBarProps<TFilter extends string> = {
  search: string;
  setSearch: (value: string) => void;
  filter: TFilter;
  setFilter: (value: TFilter) => void;
  options?: Array<{
    value: TFilter;
    label: string;
  }>;
};

const defaultOptions = [
  { value: "", label: "All visible events" },
  { value: "active", label: "Live" },
  { value: "planning", label: "Planning" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

export function SearchAndFilterBar<TFilter extends string>({
  search,
  setSearch,
  filter,
  setFilter,
  options,
}: SearchAndFilterBarProps<TFilter>) {
  const filterOptions = (options ?? defaultOptions) as Array<{ value: TFilter; label: string }>;

  return (
    <div className="mb-6 flex flex-col items-stretch justify-between gap-2 md:flex-row md:items-center">
      <input
        type="text"
        placeholder="Search events..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="flex-1 rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        aria-label="Search events"
      />
      <select
        className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        value={filter}
        onChange={(event) => setFilter(event.target.value as TFilter)}
        aria-label="Filter events by status"
      >
        {filterOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
