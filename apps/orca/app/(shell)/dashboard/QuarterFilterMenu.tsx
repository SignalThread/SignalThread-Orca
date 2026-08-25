"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import styles from "./dashboard.module.css";

type QuarterFilterOption = {
  label: string;
  value: string;
  href: string;
};

type QuarterFilterMenuProps = {
  label: string;
  selectedValue: string;
  options: QuarterFilterOption[];
};

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function QuarterFilterMenu({
  label,
  selectedValue,
  options,
}: QuarterFilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={styles.controlMenu} ref={menuRef}>
      <button
        type="button"
        className={styles.controlButton}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <CalendarDays
          className="h-4 w-4 text-[var(--orca-blue)]"
          aria-hidden
        />
        {label}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {isOpen ? (
        <div
          className={cx(styles.controlPopover, styles.quarterControlPopover)}
          role="menu"
        >
          {options.map((period) => (
            <Link
              key={period.value}
              href={period.href}
              role="menuitem"
              aria-current={period.value === selectedValue ? "true" : undefined}
              onClick={() => setIsOpen(false)}
              className={cx(
                styles.controlOption,
                period.value === selectedValue && styles.controlOptionActive,
              )}
            >
              {period.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
