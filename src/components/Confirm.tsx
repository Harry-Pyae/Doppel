"use client";

import { useEffect, useId, useRef } from "react";
import { useT } from "./Locale";

/** A confirmation overlay with Cancel and Confirm (or confirmLabel) (native <dialog>: focus trap and Esc for free). */
export function Confirm(props: { open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { open, onCancel } = props;

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm panel"
      aria-labelledby={`${id}-title`}
      aria-describedby={props.body ? `${id}-body` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id={`${id}-title`} className="font-display text-2xl font-bold">
          {props.title}
        </h2>
        {props.body && (
          <p id={`${id}-body`} className="text-muted">
            {props.body}
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-quiet" onClick={onCancel} autoFocus>
            {t("confirm.cancel")}
          </button>
          <button type="button" className={props.danger ? "btn btn-danger" : "btn"} disabled={props.busy} onClick={props.onConfirm}>
            {props.confirmLabel ?? t("confirm.ok")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
