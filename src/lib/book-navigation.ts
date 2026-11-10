export const bookSections = [
  { id: "daily", label: "일일 내역", href: "/", group: "나의 장부", pages: [
    { href: "/", label: "일일 내역" }, { href: "/income", label: "수입·입금" },
    { href: "/transfers", label: "이동·충전" }, { href: "/transport", label: "교통·하이패스" },
  ] },
  { id: "month", label: "월간 소비", href: "/month", group: "나의 장부", pages: [] },
  { id: "search", label: "내역 검색", href: "/search", group: "나의 장부", pages: [] },
  { id: "assets", label: "자산·카드", href: "/assets", group: "돈의 흐름", pages: [
    { href: "/assets", label: "자산 현황" }, { href: "/cards", label: "카드 관리" },
  ] },
  { id: "loans", label: "대출", href: "/loans", group: "돈의 흐름", pages: [] },
  { id: "review", label: "정리할 일", href: "/review", group: "기록 정리", pages: [
    { href: "/review", label: "확인·대기 내역" }, { href: "/settlements", label: "정산·보험" },
  ] },
  { id: "recurring", label: "반복·자주 쓰는 거래", href: "/recurring", group: "기록 정리", pages: [
    { href: "/recurring", label: "반복 거래" }, { href: "/templates", label: "자주 쓰는 거래" },
  ] },
] as const;

export function matchesBookPath(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(`${href}/`));
}

export function bookSectionFor(path: string) {
  return bookSections.find(section => matchesBookPath(path, section.href) || section.pages.some(page => matchesBookPath(path, page.href)))
    ?? (path.startsWith("/transactions/") || path.startsWith("/records/") ? bookSections[0] : undefined);
}
