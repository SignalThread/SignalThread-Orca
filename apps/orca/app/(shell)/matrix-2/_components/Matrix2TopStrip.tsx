"use client";

import { useEventTerminology } from "@/components/event-terminology-context";

import { Filter, Plus, Search } from "lucide-react";
import { useState } from "react";
import {
  TABLE_CONTROL_BUTTON_CLASS,
  TABLE_CONTROL_ROW_CLASS,
  TABLE_FILTER_CONTROL_CLASS,
  TABLE_FILTER_PANEL_CLASS,
  TABLE_PRIMARY_BUTTON_CLASS,
  TABLE_SEARCH_FIELD_CLASS,
} from "@/lib/bulk-edit-ui";
import { type Matrix2BoardOrientation } from "@/lib/matrix2-board-layout";
import { type Matrix2ZoomMode } from "./types";

export type MatrixListPresenceFilter = "" | "HAS" | "MISSING";
export type MatrixOfficialAgendaFilter = "" | "OFFICIAL" | "INTERNAL";

export type MatrixListFilterState = {
  type: string;
  roomId: string;
  officialAgenda: MatrixOfficialAgendaFilter;
  speakers: MatrixListPresenceFilter;
  av: MatrixListPresenceFilter;
  fnb: MatrixListPresenceFilter;
  staffing: MatrixListPresenceFilter;
};

type Matrix2TopStripProps = {
  isBusy: boolean;
  hasSnapshot: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  listFilters: MatrixListFilterState;
  onListFiltersChange: (filters: MatrixListFilterState) => void;
  onClearListFilters: () => void;
  sessionTypeOptions: string[];
  roomOptions: Array<{ id: string; name: string }>;
  boardOrientation: Matrix2BoardOrientation;
  onSetBoardOrientation: (orientation: Matrix2BoardOrientation) => void;
  zoomMode: Matrix2ZoomMode;
  onSetZoomMode: (zoom: Matrix2ZoomMode) => void;
  onOpenAddSession: () => void;
};

const ZOOM_OPTIONS: Array<{ value: Matrix2ZoomMode; label: string }> = [
  { value: "PLANNING", label: "Board" },
  { value: "OVERVIEW", label: "List" },
];

const BOARD_ORIENTATION_OPTIONS: Array<{ value: Matrix2BoardOrientation; label: string; title: string }> = [
  { value: "ROOMS_BY_TIME", label: "Rooms by time", title: "Rooms on the left, time across the top" },
  { value: "TIME_BY_ROOM", label: "Time by room", title: "Time on the left, rooms across the top" },
];

export const EMPTY_MATRIX_LIST_FILTERS: MatrixListFilterState = {
  type: "",
  roomId: "",
  officialAgenda: "",
  speakers: "",
  av: "",
  fnb: "",
  staffing: "",
};

export default function Matrix2TopStrip({
  isBusy,
  hasSnapshot,
  searchValue,
  onSearchChange,
  listFilters,
  onListFiltersChange,
  onClearListFilters,
  sessionTypeOptions,
  roomOptions,
  boardOrientation,
  onSetBoardOrientation,
  zoomMode,
  onSetZoomMode,
  onOpenAddSession,
}: Matrix2TopStripProps) {
  const terminology = useEventTerminology();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showListFilters = zoomMode === "OVERVIEW";
  const showBoardOrientation = zoomMode !== "OVERVIEW";
  const activeFilterCount = Object.values(listFilters).filter(Boolean).length;

  function updateListFilter<Key extends keyof MatrixListFilterState>(
    key: Key,
    value: MatrixListFilterState[Key],
  ): void {
    onListFiltersChange({ ...listFilters, [key]: value });
  }

  return (
    <div className="space-y-2.5">
      <section className={TABLE_CONTROL_ROW_CLASS} data-matrix2-toolbar>
        <button
          type="button"
          onClick={onOpenAddSession}
          disabled={isBusy || !hasSnapshot}
          className={TABLE_PRIMARY_BUTTON_CLASS}
          data-matrix2-add-session-action
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add session
        </button>

        <label className={`${TABLE_SEARCH_FIELD_CLASS} xl:max-w-[240px]`}>
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-[12px] text-slate-800 outline-none"
            aria-label="Search sessions"
          />
        </label>
        {showListFilters ? (
          <button
            type="button"
            className={TABLE_CONTROL_BUTTON_CLASS}
            title="Filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
            data-testid="matrix-filters-toggle"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : "Filters"}
          </button>
        ) : null}
        {showBoardOrientation ? (
          <div
            className="inline-flex h-9 shrink-0 items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
            aria-label="Board orientation"
            data-matrix2-board-orientation-control
          >
            {BOARD_ORIENTATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSetBoardOrientation(option.value)}
                className={[
                  "h-7 rounded-lg px-2 text-[11px] font-semibold transition",
                  boardOrientation === option.value
                    ? "bg-white text-[#28439A] shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:bg-white/70",
                ].join(" ")}
                title={option.title}
                aria-pressed={boardOrientation === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="ml-auto inline-flex h-9 shrink-0 items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          aria-label={`${terminology.runOfShow} view`}
        >
          {ZOOM_OPTIONS.map((zoomOption) => (
            <button
              key={zoomOption.value}
              type="button"
              onClick={() => {
                onSetZoomMode(zoomOption.value);
              }}
              className={[
                "h-7 rounded-lg px-2 text-[11px] font-semibold transition",
                zoomMode === zoomOption.value
                  ? "bg-white text-[#28439A] shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:bg-white/70",
              ].join(" ")}
            >
              {zoomOption.label}
            </button>
          ))}
        </div>
      </section>

      {showListFilters && filtersOpen ? (
        <section className={TABLE_FILTER_PANEL_CLASS} data-testid="matrix-filter-panel">
          <label className="sr-only" htmlFor="matrix-list-filter-type">Type</label>
          <select
            id="matrix-list-filter-type"
            value={listFilters.type}
            onChange={(event) => updateListFilter("type", event.target.value)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All types</option>
            {sessionTypeOptions.map((sessionType) => (
              <option key={sessionType} value={sessionType}>
                {sessionType}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-room">Room</label>
          <select
            id="matrix-list-filter-room"
            value={listFilters.roomId}
            onChange={(event) => updateListFilter("roomId", event.target.value)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All rooms</option>
            <option value="__unassigned__">Unassigned</option>
            {roomOptions.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-official-agenda">Agenda designation</label>
          <select
            id="matrix-list-filter-official-agenda"
            aria-label="Official agenda designation"
            value={listFilters.officialAgenda}
            onChange={(event) => updateListFilter("officialAgenda", event.target.value as MatrixOfficialAgendaFilter)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All agenda designations</option>
            <option value="OFFICIAL">Official agenda</option>
            <option value="INTERNAL">Internal/operational only</option>
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-speakers">Speakers</label>
          <select
            id="matrix-list-filter-speakers"
            value={listFilters.speakers}
            onChange={(event) => updateListFilter("speakers", event.target.value as MatrixListPresenceFilter)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All speakers</option>
            <option value="HAS">Has speakers</option>
            <option value="MISSING">Missing speakers</option>
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-av">AV</label>
          <select
            id="matrix-list-filter-av"
            value={listFilters.av}
            onChange={(event) => updateListFilter("av", event.target.value as MatrixListPresenceFilter)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All AV</option>
            <option value="HAS">Has AV</option>
            <option value="MISSING">Missing AV</option>
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-fnb">F&B</label>
          <select
            id="matrix-list-filter-fnb"
            value={listFilters.fnb}
            onChange={(event) => updateListFilter("fnb", event.target.value as MatrixListPresenceFilter)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All F&B</option>
            <option value="HAS">Has F&B</option>
            <option value="MISSING">Missing F&B</option>
          </select>
          <label className="sr-only" htmlFor="matrix-list-filter-staffing">Staffing</label>
          <select
            id="matrix-list-filter-staffing"
            value={listFilters.staffing}
            onChange={(event) => updateListFilter("staffing", event.target.value as MatrixListPresenceFilter)}
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All staffing</option>
            <option value="HAS">Has staffing</option>
            <option value="MISSING">Missing staffing</option>
          </select>
          {activeFilterCount > 0 ? (
            <button type="button" className={TABLE_CONTROL_BUTTON_CLASS} onClick={onClearListFilters}>
              Clear filters
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
