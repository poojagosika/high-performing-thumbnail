import { useState } from "react";
import { motion } from "framer-motion";
import { Keyboard } from "lucide-react";

const shortcutGroups = [
  {
    label: "Dashboard",
    shortcuts: [
      { keys: ["/"], description: "Focus search" },
      { keys: ["U"], description: "Upload thumbnail" },
      { keys: ["V"], description: "Toggle grid/list view" },
      { keys: ["C"], description: "Compare mode" },
      { keys: ["S"], description: "Select mode" },
    ],
  },
  {
    label: "Detail Page",
    shortcuts: [
      { keys: ["Z"], description: "Toggle zoom" },
      { keys: ["D"], description: "Download thumbnail" },
      { keys: ["\u2190", "\u2192"], description: "Previous / next" },
      { keys: ["\u232B"], description: "Back to dashboard" },
    ],
  },
  {
    label: "Global",
    shortcuts: [
      { keys: ["?"], description: "Show all shortcuts" },
      { keys: ["Esc"], description: "Close modal / exit mode" },
      { keys: ["Ctrl", "Enter"], description: "Save notes" },
    ],
  },
];

function KeyboardShowcase() {
  const [activeGroup, setActiveGroup] = useState(0);

  return (
    <section className="relative py-24 sm:py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4 }}
          className="text-center mb-14"
        >
          <p className="text-[13px] text-[#737380] font-medium uppercase tracking-widest mb-3">
            Power User
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-[-0.01em]">
            Built for keyboard-first workflows
          </h2>
          <p className="text-[14px] text-[#737380] mt-3 max-w-lg mx-auto">
            Every action has a shortcut. Navigate, compare, and manage
            thumbnails without touching your mouse.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {/* Tab bar */}
          <div className="flex items-center justify-center gap-1 mb-8">
            {shortcutGroups.map((group, i) => (
              <button
                key={group.label}
                onClick={() => setActiveGroup(i)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  activeGroup === i
                    ? "bg-white text-[#0a0a0f]"
                    : "text-[#737380] hover:text-white hover:bg-white/4"
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          {/* Shortcuts display */}
          <div className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Keyboard className="w-4 h-4 text-[#737380]" />
                <span className="text-[13px] text-[#737380] font-medium">
                  {shortcutGroups[activeGroup].label} Shortcuts
                </span>
              </div>
              <div className="space-y-3">
                {shortcutGroups[activeGroup].shortcuts.map((shortcut, i) => (
                  <motion.div
                    key={shortcut.description}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/2 transition-colors"
                  >
                    <span className="text-[14px] text-white">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && (
                            <span className="text-[11px] text-[#4a4a54] mr-1.5">
                              +
                            </span>
                          )}
                          <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md border border-white/10 bg-white/4 text-[12px] text-[#737380] font-mono font-medium shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="border-t border-white/6 px-6 py-3 bg-white/2">
              <p className="text-[12px] text-[#4a4a54] text-center">
                Press <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-white/10 bg-white/4 text-[11px] text-[#737380] font-mono mx-1">?</kbd> anywhere in the app to see all available shortcuts
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default KeyboardShowcase;
