import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { uploadFile } from "../lib/api";

function UploadModal({ open, onClose, onUploaded }) {
  const { token } = useAuth();
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(selected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an image");
      return;
    }

    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);
      if (title.trim()) formData.append("title", title.trim());
      if (tags.trim()) formData.append("tags", tags.trim());

      const thumbnail = await uploadFile("/thumbnails", formData, token);
      onUploaded(thumbnail);
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setTitle("");
    setTags("");
    setError("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md rounded-xl border border-white/6 bg-[#111118] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Upload Thumbnail
              </h2>
              <button
                onClick={handleClose}
                className="text-[#737380] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              {error && (
                <div className="text-[13px] text-red-400 bg-red-400/10 border border-red-400/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {/* Drop zone */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative aspect-video rounded-lg border border-dashed border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4 transition-colors flex flex-col items-center justify-center gap-2 overflow-hidden"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-[#737380]" />
                    <span className="text-[13px] text-[#737380]">
                      Click to select image
                    </span>
                    <span className="text-[11px] text-[#4a4a54]">
                      JPEG, PNG, or WebP — max 5MB
                    </span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-[#737380]">
                  Title <span className="text-[#4a4a54]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My awesome thumbnail"
                  className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
                />
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-[#737380]">
                  Tags{" "}
                  <span className="text-[#4a4a54]">
                    (comma separated, optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="gaming, tutorial, vlog"
                  className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={uploading}
                className="w-full h-9 mt-1 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload
                  </>
                )}
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default UploadModal;
