import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

let _show: ((msg: string, variant?: ToastVariant) => void) | null = null;

// Call this anywhere in the app — no context provider needed
export function showToast(message: string, variant: ToastVariant = "info") {
  _show?.(message, variant);
}

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
} as const;

const COLORS = {
  success: { bg: "rgba(45,206,137,0.12)", border: "rgba(45,206,137,0.35)", color: "var(--green)" },
  error:   { bg: "rgba(230,57,70,0.12)",  border: "rgba(230,57,70,0.35)",  color: "var(--accent)" },
  info:    { bg: "rgba(77,158,247,0.12)", border: "rgba(77,158,247,0.35)", color: "var(--blue)" },
};

let _nextId = 0;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const add = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
    timers.current[id] = setTimeout(() => remove(id), 2500);
  }, [remove]);

  useEffect(() => {
    _show = add;
    return () => { _show = null; };
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        const c = COLORS[t.variant];
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--surface)",
              border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${c.color}`,
              borderRadius: "var(--radius)",
              padding: "10px 14px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              minWidth: 240,
              maxWidth: 340,
              pointerEvents: "all",
              animation: "toastIn 0.2s ease",
            }}
          >
            <Icon size={15} color={c.color} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "0.82rem", color: "var(--text)", flex: 1, lineHeight: 1.4 }}>
              {t.message}
            </span>
            <button
              onClick={() => remove(t.id)}
              style={{ background: "none", border: "none", color: "var(--text3)", padding: 2, cursor: "pointer", flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
