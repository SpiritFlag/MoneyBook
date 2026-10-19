"use client";

import { SignIn, UserButton, useAuth } from "@clerk/nextjs";
import { SWRConfig } from "swr";

// 계정이 바뀌면 조회 캐시와 입력 화면을 함께 새로 만듭니다.
const accountCache = { provider: () => new Map() };

export function AuthenticatedBook({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status" className="py-16 text-center text-muted-foreground">장부 열쇠를 확인하고 있어요…</p>;
  if (!userId) return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4">
      <div className="text-center"><h1 className="text-2xl font-bold">나의 머니북 열기</h1><p className="mt-2 text-sm text-muted-foreground">유니버스 계정으로 로그인해 주세요.</p></div>
      <SignIn routing="hash" fallbackRedirectUrl="/" />
    </section>
  );
  return <SWRConfig key={userId} value={accountCache}>
    <div className="flex items-center justify-end gap-3 px-5 pt-4 text-xs text-muted-foreground">
      <span>나의 머니북</span><UserButton />
    </div>
    {children}
  </SWRConfig>;
}
