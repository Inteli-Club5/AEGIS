"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { TriangleAlert } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep going",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={e => {
        if (e.target === dialogRef.current) onCancel();
      }}
      className="m-auto w-[min(480px,calc(100vw-32px))] rounded-xl bg-surface-raised p-8 text-foreground shadow-xl backdrop:bg-foreground/25 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
          <TriangleAlert className="h-5 w-5 text-danger" />
        </span>
        <div>
          <h2 className="text-h3">{title}</h2>
          <p className="mt-2 text-body-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
