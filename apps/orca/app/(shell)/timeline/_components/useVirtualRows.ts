"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type VirtualRowWindow = {
  startIndex: number;
  endIndex: number; // exclusive
  topPadding: number;
  bottomPadding: number;
};

type UseVirtualRowsArgs = {
  count: number;
  rowHeight: number;
  overscan?: number;
  enabled: boolean;
};

type UseVirtualRowsResult = {
  scrollRef: RefObject<HTMLTableSectionElement | null>;
  virtual: VirtualRowWindow;
};

// Small, dependency-free row windowing helper.
//
// The Timeline List has no bounded scroll viewport of its own — the page (or an
// ancestor scroll container) scrolls. So instead of owning a scroll container we
// measure the rows container against the viewport and render only the rows that
// fall inside it (plus overscan). This preserves the existing page-scroll UX and
// column layout; a top/bottom spacer row keeps the scrollbar height correct.
//
// The scroll listener is attached in the capture phase on window so it also fires
// when an ancestor element (e.g. a scrollable shell main) is the thing scrolling —
// scroll events do not bubble but capture-phase listeners still observe them.
export function useVirtualRows({
  count,
  rowHeight,
  overscan = 8,
  enabled,
}: UseVirtualRowsArgs): UseVirtualRowsResult {
  const scrollRef = useRef<HTMLTableSectionElement | null>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: count });

  useEffect(() => {
    if (!enabled) return;

    let frame = 0;

    const compute = () => {
      frame = 0;
      const node = scrollRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const scrolledPast = Math.max(0, -rect.top);
      const start = Math.max(0, Math.floor(scrolledPast / rowHeight) - overscan);
      const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
      const end = Math.min(count, start + visibleCount);
      setRange((current) => (current.start === start && current.end === end ? current : { start, end }));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [count, enabled, overscan, rowHeight]);

  if (!enabled) {
    return {
      scrollRef,
      virtual: { startIndex: 0, endIndex: count, topPadding: 0, bottomPadding: 0 },
    };
  }

  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  return {
    scrollRef,
    virtual: {
      startIndex: start,
      endIndex: end,
      topPadding: start * rowHeight,
      bottomPadding: Math.max(0, (count - end) * rowHeight),
    },
  };
}
