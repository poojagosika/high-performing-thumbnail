import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Tag,
  BarChart3,
  MousePointerClick,
  Palette,
  Type,
  Heart,
  Layout,
  Trash2,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import { useToast } from "../context/ToastContext";
import api from "../lib/api";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const analysisItems = [
  { key: "composition", label: "Composition", Icon: Layout },
  { key: "colorBalance", label: "Color Balance", Icon: Palette },
  { key: "textReadability", label: "Text Readability", Icon: Type },
  { key: "emotionalImpact", label: "Emotional Impact", Icon: Heart },
];

function ThumbnailDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const closeZoom = useCallback(() => setZoomed(false), []);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeZoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, closeZoom]);

  useEffect(() => {
    api(`/thumbnails/${id}`)
      .then((data) => setThumb(data))
      .catch(() => navigate("/dashboard"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleDelete = async () => {
    try {
      await api(`/thumbnails/${id}`, { method: "DELETE" });
      toast.success("Thumbnail deleted");
      navigate("/dashboard");
    } catch {
      toast.error("Failed to delete thumbnail");
    }
  };

  const startEditingTags = () => {
    setTagInput(thumb?.tags?.join(", ") || "");
    setEditingTags(true);
  };

  const saveTags = async () => {
    try {
      await api(`/thumbnails/${id}`, {
        method: "PATCH",
        body: { tags: tagInput },
      });
      const newTags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      setThumb((prev) => ({ ...prev, tags: newTags }));
      toast.success("Tags updated");
    } catch {
      toast.error("Failed to update tags");
    }
    setEditingTags(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#737380] animate-spin" />
      </div>
    );
  }

  if (!thumb) return null;

  const hasAnalysis = analysisItems.some(
    (a) => thumb.analysis?.[a.key] != null,
  );

  return (
    <div className="min-h-screen">
      <DashboardNav />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#737380] hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(1)}
            className="lg:col-span-3"
          >
            <div
              className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden cursor-zoom-in"
              onClick={() => setZoomed(true)}
            >
              <img
                src={`http://localhost:5000${thumb.imageUrl}`}
                alt={thumb.title}
                className="w-full aspect-video object-cover"
              />
            </div>
            <p className="text-[11px] text-[#4a4a54] mt-2 text-center">
              Click image to zoom
            </p>
          </motion.div>

          {/* Info panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="lg:col-span-2 flex flex-col gap-4"
          >
            {/* Title & meta */}
            <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
              <h1 className="font-heading text-xl font-semibold text-white tracking-[-0.01em]">
                {thumb.title}
              </h1>
              <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[#737380]">
                <Calendar className="w-3 h-3" />
                {new Date(thumb.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>

              <div className="mt-3">
                {editingTags ? (
                  <div className="flex items-center gap-2">
                    <Tag className="w-3 h-3 text-[#4a4a54] shrink-0" />
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTags();
                        if (e.key === "Escape") setEditingTags(false);
                      }}
                      autoFocus
                      placeholder="gaming, tutorial, vlog"
                      className="flex-1 h-7 px-2 rounded border border-white/10 bg-white/4 text-[12px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/20 transition-colors"
                    />
                    <button
                      onClick={saveTags}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTags(false)}
                      className="text-[#4a4a54] hover:text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="group/tags flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3 h-3 text-[#4a4a54]" />
                    {thumb.tags?.length > 0 ? (
                      thumb.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] text-[#737380] bg-white/4 rounded-full px-2 py-0.5"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#4a4a54]">
                        No tags
                      </span>
                    )}
                    <button
                      onClick={startEditingTags}
                      className="text-[#4a4a54] hover:text-white transition-colors opacity-0 group-hover/tags:opacity-100"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Score & CTR */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-[#737380]" />
                  <span className="text-[12px] text-[#737380]">Score</span>
                </div>
                <span className="font-heading text-2xl font-semibold text-white">
                  {thumb.score != null ? thumb.score : "—"}
                  {thumb.score != null && (
                    <span className="text-[12px] text-[#4a4a54] font-normal ml-0.5">
                      /100
                    </span>
                  )}
                </span>
              </div>
              <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <MousePointerClick className="w-3.5 h-3.5 text-[#737380]" />
                  <span className="text-[12px] text-[#737380]">CTR</span>
                </div>
                <span className="font-heading text-2xl font-semibold text-white">
                  {thumb.ctr != null ? `${thumb.ctr}%` : "—"}
                </span>
              </div>
            </div>

            {/* Analysis breakdown */}
            {hasAnalysis && (
              <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
                <h3 className="text-[13px] text-[#737380] font-medium mb-3">
                  Analysis
                </h3>
                <div className="flex flex-col gap-3">
                  {analysisItems.map(({ key, label, Icon }) => {
                    const val = thumb.analysis?.[key];
                    if (val == null) return null;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-[12px] text-[#737380]">
                            <Icon className="w-3 h-3" />
                            {label}
                          </span>
                          <span className="text-[12px] font-medium text-white">
                            {val}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-white/20"
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delete */}
            <Button
              variant="outline"
              onClick={handleDelete}
              className="h-9 text-[13px] border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/30 bg-transparent font-medium gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Thumbnail
            </Button>
          </motion.div>
        </div>
      </main>

      {/* Zoom overlay */}
      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out p-6"
            onClick={closeZoom}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src={`http://localhost:5000${thumb.imageUrl}`}
              alt={thumb.title}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ThumbnailDetail;
