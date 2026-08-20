"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CARD_GAP_PX = 12;
const CARD_FALLBACK_WIDTH = 280;

export function carouselScrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Slide width leaves a 2.5rem peek of the next card. */
export const snapCarouselItemClassName =
  "w-[min(17.5rem,calc(100%-2.5rem))] shrink-0 snap-start";

export function SnapCarousel({
  children,
  ariaLabel,
  prevLabel,
  nextLabel,
  className,
}: {
  children: ReactNode;
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges]);

  function scrollByCard(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-carousel-card]");
    const delta = (card?.offsetWidth ?? CARD_FALLBACK_WIDTH) + CARD_GAP_PX;
    el.scrollBy({ left: direction * delta, behavior: carouselScrollBehavior() });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByCard(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByCard(-1);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          aria-label={prevLabel}
          disabled={!canPrev}
          onClick={() => scrollByCard(-1)}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          disabled={!canNext}
          onClick={() => scrollByCard(1)}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={updateEdges}
        onKeyDown={onKeyDown}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth rounded-xl pb-1 [scrollbar-width:thin] motion-reduce:scroll-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        {children}
      </div>
    </div>
  );
}
