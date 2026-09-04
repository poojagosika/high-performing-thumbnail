import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const visible = (el) =>
  el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

export function useDialog(open, onClose, { labelledBy, label } = {}) {
  const ref = useRef(null);
  const restoreRef = useRef(null);

  const focusable = useCallback(
    () => Array.from(ref.current?.querySelectorAll(FOCUSABLE) || []).filter(visible),
    [],
  );

  useEffect(() => {
    if (!open) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = requestAnimationFrame(() => {
      const panel = ref.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const first = focusable()[0];
      if (first) first.focus();
      else panel.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      const restore = restoreRef.current;
      restoreRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [open, focusable]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
      return;
    }

    if (e.key !== "Tab") return;

    const items = focusable();
    if (items.length === 0) {
      e.preventDefault();
      ref.current?.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return {
    ref,
    dialogProps: {
      ref,
      role: "dialog",
      "aria-modal": "true",
      ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
      ...(label ? { "aria-label": label } : {}),
      tabIndex: -1,
      onKeyDown,
    },
  };
}

export default useDialog;
