type NewEventButtonProps = {
  onNewEvent: () => void;
  onDuplicate: () => void;
};

export function NewEventButton({
  onNewEvent,
  onDuplicate,
}: NewEventButtonProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-primary"
        onClick={onNewEvent}
      >
        + New Event
      </button>
      <button
        type="button"
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={onDuplicate}
      >
        Duplicate Existing Event
      </button>
    </div>
  );
}
