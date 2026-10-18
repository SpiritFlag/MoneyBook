"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <form className="flex flex-wrap items-center gap-1.5 sm:gap-2" noValidate onSubmit={(event) => {
          event.preventDefault();
          const value = parseDateParts(year, month, day);
          if (!value) { setError("날짜를 확인해 주세요. 연도는 1900~9999년이며, 실제 있는 월·일을 입력해 주세요."); return; }
          navigate(value);
        }}>
          {[
            { label: "연도", suffix: "년", value: year, set: setYear, length: 4 },
            { label: "월", suffix: "월", value: month, set: setMonth, length: 2 },
            { label: "일", suffix: "일", value: day, set: setDay, length: 2 },
          ].map((field) => (
            <label key={field.label} className="flex items-center gap-1 text-sm text-muted-foreground sm:gap-1.5">
              <span className="sr-only">{field.label}</span>
              <input
                aria-invalid={Boolean(error)} aria-describedby={error ? "date-error" : "date-help"}
                inputMode="numeric" maxLength={field.length} value={field.value}
                onChange={(event) => { field.set(event.target.value); setError(""); }}
                onFocus={(event) => event.target.select()}
                className={`h-10 rounded-lg border border-input bg-background text-center text-base font-medium text-foreground tabular-nums ${field.length === 4 ? "w-16 sm:w-18" : "w-10 sm:w-12"}`}
              />
              <span aria-hidden="true">{field.suffix}</span>
            </label>
          ))}
          <Button type="submit" className="ml-1 px-3">이동</Button>
        </form>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" aria-label="전날" disabled={date === "1900-01-01"} onClick={() => navigate(shiftDate(date, -1))}><ChevronLeft /></Button>
          <Button variant="outline" onClick={() => navigate(todayInSeoul())}>오늘</Button>
          <Button variant="outline" size="icon" aria-label="다음 날" disabled={date === "9999-12-31"} onClick={() => navigate(shiftDate(date, 1))}><ChevronRight /></Button>
          <details className="relative ml-1">
            <summary className="flex h-10 list-none items-center gap-2 rounded-lg px-3 text-sm hover:bg-accent [&::-webkit-details-marker]:hidden"><CalendarDays size={17} />달력</summary>
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
        </div>
      </div>
      <p id="date-help" className="mt-3 text-xs text-muted-foreground">월·일을 직접 입력하고 Enter로 이동하세요. Tab으로 다음 칸을 선택할 수 있어요.</p>
      {error ? <p id="date-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
