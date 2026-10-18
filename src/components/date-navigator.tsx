"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDateParts, shiftDate, todayInSeoul } from "@/lib/date";

type Props = { date: string; onDateChange: (date: string) => void };

export function DateNavigator({ date, onDateChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" aria-label="전날" disabled={date === "1900-01-01"} onClick={() => onDateChange(shiftDate(date, -1))}><ChevronLeft /></Button>
      <Button variant="secondary" onClick={() => onDateChange(todayInSeoul())}>오늘</Button>
      <Button variant="ghost" size="icon" aria-label="다음 날" disabled={date === "9999-12-31"} onClick={() => onDateChange(shiftDate(date, 1))}><ChevronRight /></Button>
      <details className="relative ml-1">
        <summary className="flex h-10 list-none items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-secondary/50 [&::-webkit-details-marker]:hidden"><CalendarDays size={17} />달력</summary>
        <form className="absolute right-0 z-10 mt-2 w-60 rounded-xl bg-card p-4 shadow-lg" onSubmit={(event) => {
          event.preventDefault();
          const parts = String(new FormData(event.currentTarget).get("calendarDate")).split("-");
          const value = parts.length === 3 ? parseDateParts(parts[0], parts[1], parts[2]) : null;
          if (value) {
            onDateChange(value);
            const details = event.currentTarget.closest("details");
            details?.removeAttribute("open");
            details?.querySelector("summary")?.focus();
          }
        }}>
          <label className="grid gap-2 text-sm">날짜 선택
            <input key={date} name="calendarDate" type="date" required min="1900-01-01" max="9999-12-31" defaultValue={date} className="min-w-0 rounded-md border p-2" />
          </label>
          <Button type="submit" className="mt-3 w-full">선택한 날짜로 이동</Button>
        </form>
      </details>
    </div>
  );
}
