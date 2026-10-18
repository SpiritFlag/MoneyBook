"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDateParts, shiftDate, todayInSeoul } from "@/lib/date";

type Props = { date: string; onDateChange: (date: string) => void };

export function DateNavigator({ date, onDateChange }: Props) {
  const [sourceDate, setSourceDate] = useState(date);
  const [year, setYear] = useState(date.slice(0, 4));
  const [month, setMonth] = useState(String(Number(date.slice(5, 7))));
  const [day, setDay] = useState(String(Number(date.slice(8, 10))));
  const [error, setError] = useState("");

  // 외부의 '예시 날짜 보기'도 입력값에 반영하되, 입력 요소를 재생성하지 않습니다.
  if (sourceDate !== date) {
    setSourceDate(date);
    setYear(date.slice(0, 4));
    setMonth(String(Number(date.slice(5, 7))));
    setDay(String(Number(date.slice(8, 10))));
    setError("");
  }

  function navigate(value: string) {
    setSourceDate(value);
    setYear(value.slice(0, 4));
    setMonth(String(Number(value.slice(5, 7))));
    setDay(String(Number(value.slice(8, 10))));
    setError("");
    onDateChange(value);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <form aria-label="날짜 직접 입력" className="date-entry flex items-center rounded-xl px-1 py-0.5" noValidate onSubmit={(event) => {
          event.preventDefault();
          const value = parseDateParts(year, month, day);
          if (!value) { setError("날짜를 확인해 주세요. 연도는 1900~9999년이며, 실제 있는 월·일을 입력해 주세요."); return; }
          navigate(value);
        }}>
          {[
            { label: "연도", separator: true, value: year, set: setYear, length: 4 },
            { label: "월", separator: true, value: month, set: setMonth, length: 2 },
            { label: "일", separator: false, value: day, set: setDay, length: 2 },
          ].map((field) => (
            <label key={field.label} className="flex items-center text-muted-foreground">
              <span className="sr-only">{field.label}</span>
              <input
                aria-invalid={Boolean(error)} aria-describedby={error ? "date-error" : "date-help"}
                inputMode="numeric" maxLength={field.length} value={field.value}
                onChange={(event) => { field.set(event.target.value); setError(""); }}
                onFocus={(event) => event.target.select()}
                className={`date-field h-9 rounded-lg border-0 text-center text-sm font-medium tabular-nums ${field.length === 4 ? "w-14 text-muted-foreground" : "w-9 text-foreground"}`}
              />
              {field.separator ? <span aria-hidden="true" className="px-0.5 text-sm text-[#a2aa9b]">/</span> : null}
            </label>
          ))}
          <Button type="submit" variant="ghost" size="icon" aria-label="입력한 날짜로 이동" title="입력한 날짜로 이동 (Enter)" className="ml-1 rounded-lg text-primary hover:bg-secondary/50"><ArrowRight size={16} /></Button>
        </form>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" aria-label="전날" disabled={date === "1900-01-01"} onClick={() => navigate(shiftDate(date, -1))}><ChevronLeft /></Button>
          <Button variant="secondary" onClick={() => navigate(todayInSeoul())}>오늘</Button>
          <Button variant="ghost" size="icon" aria-label="다음 날" disabled={date === "9999-12-31"} onClick={() => navigate(shiftDate(date, 1))}><ChevronRight /></Button>
          <details className="relative ml-1">
            <summary className="flex h-10 list-none items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-white/80 [&::-webkit-details-marker]:hidden"><CalendarDays size={17} />달력</summary>
            <form className="absolute right-0 z-10 mt-2 w-60 rounded-xl border bg-card p-4 shadow-lg" onSubmit={(event) => {
              event.preventDefault();
              const parts = String(new FormData(event.currentTarget).get("calendarDate")).split("-");
              const value = parts.length === 3 ? parseDateParts(parts[0], parts[1], parts[2]) : null;
              if (value) {
                navigate(value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }
            }}>
              <label className="grid gap-2 text-sm">날짜 선택
                <input key={date} name="calendarDate" type="date" required min="1900-01-01" max="9999-12-31" defaultValue={date} className="min-w-0 rounded-md border p-2" />
              </label>
              <Button type="submit" className="mt-3 w-full">선택한 날짜로 이동</Button>
            </form>
          </details>
          <details className="relative">
            <summary aria-label="날짜 입력 도움말" title="날짜 입력 도움말" className="flex h-9 w-9 list-none items-center justify-center rounded-lg text-xs text-muted-foreground transition-colors hover:bg-secondary/50 [&::-webkit-details-marker]:hidden">?</summary>
            <p className="absolute right-0 z-10 mt-2 w-56 rounded-xl bg-card p-4 text-xs leading-6 shadow-lg">월·일을 직접 수정할 수 있어요. Tab으로 다음 칸, Enter 또는 화살표로 이동하세요.</p>
          </details>
        </div>
      </div>
      <p id="date-help" className="sr-only">연·월·일을 직접 수정하고 Tab으로 다음 칸, Enter 또는 화살표로 이동하세요.</p>
      {error ? <p id="date-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
