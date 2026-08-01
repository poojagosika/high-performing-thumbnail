import { motion, AnimatePresence } from "framer-motion";
import { Keyboard } from "lucide-react";

function Key({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded bg-white/6 border border-white/10 text-[11px] font-mono text-[#737380]">
      {children}
    </kbd>
  );
}

function ShortcutsModal({ open, onClose, shortcuts }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-sm rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="w-4 h-4 text-[#737380]" />
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Keyboard Shortcuts
              </h2>
            </div>

            <div className="flex flex-col gap-2">
              {shortcuts.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-[13px] text-[#737380]">{label}</span>
                  <Key>{key}</Key>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-[#4a4a54] mt-4 text-center">
              Press <Key>?</Key> anytime to toggle this menu
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ShortcutsModal;
