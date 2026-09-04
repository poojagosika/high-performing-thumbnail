import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../lib/api";
import { assetUrl } from "../lib/assetUrl";
import { useDialog } from "../hooks/useDialog";

function EditModal({ open, thumb, onClose, onSaved }) {
  const { dialogProps } = useDialog(open, onClose, {
    labelledBy: "edit-modal-title",
  });

  const [title, setTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (thumb && open) {
      setTitle(thumb.title || "");
      setTagInput(thumb.tags?.join(", ") || "");
      setError("");
    }
  }, [thumb, open]);

  const hasChanges =
    title.trim() !== (thumb?.title || "") ||
    tagInput.trim() !== (thumb?.tags?.join(", ") || "");

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await api(`/thumbnails/${thumb._id}`, {
        method: "PATCH",
        body: { title: trimmedTitle, tags: tagInput.trim() },
      });
      onSaved(updated);
      onClose();
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && thumb && (
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
            {...dialogProps}
            className="relative w-full max-w-md rounded-xl border border-white/6 bg-[#111118] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#7b7b88]" />
                <h2
                  id="edit-modal-title"
                  className="font-heading text-[15px] font-semibold text-white"
                >
                  Edit Thumbnail
                </h2>
              </div>
              <button
                aria-label="Close"
                onClick={onClose}
                className="text-[#61616b] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preview */}
            <div className="px-5 pt-4">
              <div className="rounded-lg border border-white/6 overflow-hidden">
                <img
                  src={assetUrl(thumb.imageUrl)}
                  alt={thumb.title}
                  className="w-full aspect-video object-cover"
                />
              </div>
            </div>

            {/* Form */}
            <div className="px-5 pt-4 pb-5 flex flex-col gap-3">
              <div>
                <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hasChanges) handleSave();
                  }}
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] text-[#7b7b88] mb-1.5">
                  <Tag className="w-3 h-3" />
                  Tags
                </label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hasChanges) handleSave();
                  }}
                  placeholder="gaming, tutorial, vlog"
                  className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
                />
                <p className="text-[11px] text-[#61616b] mt-1">
                  Separate tags with commas
                </p>
              </div>

              {/* Meta info */}
              <div className="flex items-center gap-4 pt-1">
                {thumb.score > 0 && (
                  <span className="text-[12px] text-[#7b7b88]">
                    Score: {thumb.score}/100
                  </span>
                )}
                <span className="text-[12px] text-[#61616b]">
                  {new Date(thumb.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              {error && (
                <p className="text-[12px] text-red-400">{error}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-8 text-[13px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default EditModal;
