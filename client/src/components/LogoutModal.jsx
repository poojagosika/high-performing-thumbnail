import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

function LogoutModal({ open, onClose, onConfirm }) {
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
            <h2 className="font-heading text-[15px] font-semibold text-white">
              Log out?
            </h2>
            <p className="text-[13px] text-[#737380] mt-1.5">
              Are you sure you want to log out of your account?
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button
                variant="outline"
                onClick={onClose}
                className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium"
              >
                Log out
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default LogoutModal;
