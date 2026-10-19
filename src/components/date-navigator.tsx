"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayDate, parseDateParts, shiftDate, todayInBook } from "@/lib/date";

type Props = { date: string; onDateChange: (date: string) => void };

export function DateNavigator({ date, onDateChange }: Props) {
  return (
    <div className="-ml-2 flex flex-wrap items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" aria-label="전날" className="text-primary/65 hover:bg-white/70" disabled={date === "1900-01-01"} onClick={() => onDateChange(shiftDate(date, -1))}><ChevronLeft /></Button>
      <details className="relative">
        <summary aria-label={`${date} 날짜 변경`} title="날짜를 눌러 직접 입력하거나 달력을 선택하세요" className="flex min-h-10 list-none items-center rounded-lg px-1 transition-colors duration-150 hover:bg-white/70 [&::-webkit-details-marker]:hidden"><h2 className="flex items-center gap-1.5 text-base font-semibold sm:text-xl">{displayDate(date)}<ChevronDown aria-hidden="true" size={14} className="text-primary/60" /></h2></summary>
        <form className="absolute left-0 z-10 mt-2 w-60 rounded-xl bg-card p-4 shadow-lg" onSubmit={(event) => {
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
      <Button variant="ghost" size="icon-sm" aria-label="다음 날" className="text-primary/65 hover:bg-white/70" disabled={date === "9999-12-31"} onClick={() => onDateChange(shiftDate(date, 1))}><ChevronRight /></Button>
      <Button variant="ghost" size="sm" className="ml-1 rounded-full px-2.5 text-xs text-primary/80 hover:bg-white/70" onClick={() => onDateChange(todayInBook())}>오늘</Button>
    </div>
  );
}
