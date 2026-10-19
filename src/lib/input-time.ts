// 네 자리 숫자와 시:분 입력을 24시간 저장 형식으로 정규화합니다.
// 잘못된 값은 그대로 남겨 저장 검증에서 거절합니다.
export function normalizeTime(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = /^(\d{2})(\d{2})$/.exec(raw) ?? /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return raw;
  return match[1].padStart(2, "0") + ":" + match[2].padStart(2, "0");
}
