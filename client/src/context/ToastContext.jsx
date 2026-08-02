import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, X, Info, AlertTriangle } from "lucide-react";

const ToastContext = createContext(null);

let toastId = 0;
const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;
const TICK_MS = 50;

const icons = {
  success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
  error: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
};

const barColors = {
  success: "bg-emerald-400/60",
  error: "bg-red-400/60",
  info: "bg-blue-400/60",
  warning: "bg-amber-400/60",
};

function ToastItem({ toast, onRemove }) {
  const [progress, setProgress] = useState(100);
  const hoveredRef = useRef(false);
  const removedRef = useRef(false);
  const duration = toast.duration || DEFAULT_DURATION;
  const decrement = (100 / duration) * TICK_MS;

  useEffect(() => {
    const interval = setInterval(() => {
      if (hoveredRef.current) return;
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(interval);
          if (!removedRef.current) {
            removedRef.current = true;
            setTimeout(() => onRemove(toast.id), 0);
          }
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onMouseEnter={() => (hoveredRef.current = true)}
      onMouseLeave={() => (hoveredRef.current = false)}
      className="relative overflow-hidden rounded-lg border border-white/6 bg-[#111118] shadow-xl min-w-[280px] max-w-xs group"
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        {icons[toast.type]}
        <span className="text-[13px] text-white flex-1">{toast.message}</span>
        {toast.action && (
          <button
            onClick={() => {
              toast.action.onClick();
              if (!removedRef.current) {
                removedRef.current = true;
                onRemove(toast.id);
              }
            }}
            className="text-[13px] font-medium text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            {toast.action.label}
          </button>
        )}
        <button
          onClick={() => {
            if (!removedRef.current) {
              removedRef.current = true;
              onRemove(toast.id);
            }
          }}
          className="text-[#4a4a54] hover:text-white transition-colors shrink-0 ml-1 opacity-0 group-hover:opacity-100"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/4">
        <div
          className={`h-full ${barColors[toast.type]}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = "success", options = {}) => {
    const id = ++toastId;
    setToasts((prev) => {
      const next = [...prev, { id, message, type, ...options }];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
  }, []);

  const toast = {
    success: (msg, opts) => addToast(msg, "success", opts),
    error: (msg, opts) => addToast(msg, "error", opts),
    info: (msg, opts) => addToast(msg, "info", opts),
    warning: (msg, opts) => addToast(msg, "warning", opts),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}

      <div className="fixed bottom-5 right-5 z-100 flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
