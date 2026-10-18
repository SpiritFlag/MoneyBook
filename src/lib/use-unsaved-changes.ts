"use client";
import { useEffect } from "react";
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const link = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && !target.getAttribute("href")?.startsWith("#") && !window.confirm("저장하지 않은 입력이 있어요. 입력을 버리고 이동할까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, [dirty]);
}
