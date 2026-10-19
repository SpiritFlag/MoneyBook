"use client";
import { normalizeTime } from "@/lib/input-time";
export function TimeInput({ value, onChange }: { value: string | null; onChange: (time: string | null) => void }) {
  return <input className="form-control tabular-nums" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:mm · 예: 18:30" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="24시간 형식으로 입력하세요. 예: 18:30 또는 1830. 모르면 비워 두세요." value={value ?? ""} onChange={e => onChange(/^\d{4}$/.test(e.target.value) ? normalizeTime(e.target.value) : e.target.value || null)} onBlur={e => { const next = normalizeTime(e.target.value); if (next !== value) onChange(next); }} />;
}
