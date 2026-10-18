import { DailyBook } from "@/components/daily-book";
import { todayInSeoul } from "@/lib/date";

// 빌드한 날짜가 아닌, 화면을 여는 시점의 한국 날짜로 시작합니다.
export const dynamic = "force-dynamic";

export default function Page() {
  return <DailyBook initialDate={todayInSeoul()} />;
}
