import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONFIRM_WORD = "DELETE";

const LOSSES = [
  "Every thumbnail, including anything still in the trash",
  "All uploaded versions and image files",
  "Collections, comparisons and activity history",
  "Public share links, which stop working immediately",
];

function DeleteAccountModal({ open, onClose, onConfirm }) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const ready = password.length > 0 && confirmText === CONFIRM_WORD;

  const handleClose = () => {
    if (deleting) return;
    setPassword("");
    setConfirmText("");
    setError("");
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ready || deleting) return;

    setError("");
    setDeleting(true);

    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-sm rounded-xl border border-red-400/20 bg-[#111118] shadow-2xl p-5"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Delete your account?
              </h2>
            </div>

            <p className="text-[13px] text-[#737380] mt-1.5">
              This cannot be undone. Deleting removes:
            </p>

            <ul className="flex flex-col gap-1 mt-3">
              {LOSSES.map((item) => (
                <li
                  key={item}
                  className="text-[12px] text-[#737380] pl-3 relative before:absolute before:left-0 before:top-[7px] before:w-1 before:h-1 before:rounded-full before:bg-red-400/60"
                >
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 mt-4">
              <div>
                <label className="block text-[12px] text-[#737380] mb-1.5">
                  Confirm your password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#737380] mb-1.5">
                  Type {CONFIRM_WORD} to continue
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  autoComplete="off"
                  className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
                />
              </div>
            </div>

            {error && <p className="text-[12px] text-red-400 mt-3">{error}</p>}

            <div className="flex items-center justify-end gap-2 mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={deleting}
                className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!ready || deleting}
                className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-500/90 font-medium gap-1.5 disabled:opacity-40"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                Delete account
              </Button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}

export default DeleteAccountModal;
