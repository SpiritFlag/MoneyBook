"use client";
import { useId, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";

export function SortableReceiptItem({ id, index, name, disabled, children }: { id: string; index: number; name: string; disabled: boolean; children: ReactNode }) {
  const instructionsId = useId();
  const { ref, handleRef, isDragSource } = useSortable({ id, index, disabled });
  return <div ref={ref} className={`receipt-node relative space-y-3 rounded-2xl bg-background/55 p-4 ${isDragSource ? "z-10 ring-2 ring-primary/40 shadow-lg" : ""}`}>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <button ref={handleRef} type="button" disabled={disabled} aria-label={`상품 ${index + 1}${name ? ` ${name}` : ""} 순서 이동`} aria-describedby={instructionsId} title="잡아서 위아래로 이동" className="flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-lg text-primary/70 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 enabled:cursor-grab enabled:active:cursor-grabbing"><GripVertical size={20} aria-hidden="true" /></button>
      <span>상품 {index + 1}</span>
      <span id={instructionsId} className="sr-only">스페이스 또는 엔터로 잡고 위아래 방향키로 이동한 뒤 다시 눌러 놓으세요. Esc로 취소해요.</span>
    </div>
    {children}
  </div>;
}
