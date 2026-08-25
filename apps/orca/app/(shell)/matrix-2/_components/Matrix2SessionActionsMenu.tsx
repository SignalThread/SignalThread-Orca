"use client";

import { Archive, Copy, EllipsisVertical, ExternalLink, MoveRight, Pencil } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

type Matrix2SessionActionsMenuProps = {
  sessionTitle: string;
  disabled?: boolean;
  onOpenDetails: () => void;
  onEditInline: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onDelete: () => void;
};

export function Matrix2SessionActionsMenu({
  sessionTitle,
  disabled = false,
  onOpenDetails,
  onEditInline,
  onDuplicate,
  onMove,
  onDelete,
}: Matrix2SessionActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 196;
    const estimatedHeight = 220;
    const openAbove = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
    setPosition({
      top: openAbove ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  function runAction(event: React.MouseEvent<HTMLButtonElement>, action: () => void): void {
    event.stopPropagation();
    setIsOpen(false);
    action();
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items.at(-1)?.focus();
    else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
    else items[(currentIndex - 1 + items.length) % items.length]?.focus();
  }

  const itemClass = "flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Open session actions for ${sessionTitle}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <EllipsisVertical className="h-4 w-4" aria-hidden />
      </button>
      {isOpen && position && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Session actions for ${sessionTitle}`}
          className="fixed z-[100] w-[196px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/5"
          style={position}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
        >
          <button role="menuitem" type="button" className={itemClass} onClick={(event) => runAction(event, onOpenDetails)}><ExternalLink className="h-4 w-4" aria-hidden />Open details</button>
          <button role="menuitem" type="button" className={itemClass} onClick={(event) => runAction(event, onEditInline)}><Pencil className="h-4 w-4" aria-hidden />Edit inline</button>
          <button role="menuitem" type="button" className={itemClass} onClick={(event) => runAction(event, onDuplicate)}><Copy className="h-4 w-4" aria-hidden />Duplicate</button>
          <button role="menuitem" type="button" className={itemClass} onClick={(event) => runAction(event, onMove)}><MoveRight className="h-4 w-4" aria-hidden />Move to…</button>
          <div className="my-1 border-t border-slate-100" role="separator" />
          <button role="menuitem" type="button" className={`${itemClass} text-amber-700 hover:bg-amber-50 focus:bg-amber-50`} onClick={(event) => runAction(event, onDelete)}><Archive className="h-4 w-4" aria-hidden />Archive</button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
