import { useState, useEffect, useCallback, useRef } from "react";
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
  Pencil,
  X,
  Download,
  Copy,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import ShortcutsModal from "../components/ShortcutsModal";
import { useToast } from "../context/ToastContext";
import api from "../lib/api";

const detailShortcuts = [
  { key: "d", label: "Download thumbnail" },
  { key: "z", label: "Toggle zoom" },
  { key: "Esc", label: "Close zoom" },
  { key: "←", label: "Back to dashboard" },
  { key: "?", label: "Show shortcuts" },
];

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
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [related, setRelated] = useState([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const downloadRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    api(`/thumbnails/${id}`)
      .then((data) => {
        setThumb(data);
        // Fetch related thumbnails (shared tags)
        api("/thumbnails").then((all) => {
          const tags = data.tags || [];
          if (tags.length === 0) return;
          const matches = all
            .filter(
              (t) =>
                t._id !== data._id &&
                t.tags?.some((tag) => tags.includes(tag)),
            )
            .slice(0, 4);
          setRelated(matches);
        });
      })
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

  const startEditingTitle = () => {
    setTitleInput(thumb?.title || "");
    setEditingTitle(true);
    setTimeout(() => titleRef.current?.focus(), 0);
  };

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === thumb.title) {
      setEditingTitle(false);
      return;
    }
    try {
      await api(`/thumbnails/${id}`, {
        method: "PATCH",
        body: { title: trimmed },
      });
      setThumb((prev) => ({ ...prev, title: trimmed }));
      toast.success("Title updated");
    } catch {
      toast.error("Failed to update title");
    }
    setEditingTitle(false);
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

  const handleDownload = async () => {
    try {
      const res = await fetch(`http://localhost:5000${thumb.imageUrl}`);
      const blob = await res.blob();
      const ext = thumb.imageUrl.split(".").pop();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${thumb.title}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download");
    }
  };

  const handleDuplicate = async () => {
    try {
      const copy = await api(`/thumbnails/${id}/duplicate`, { method: "POST" });
      toast.success("Thumbnail duplicated");
      navigate(`/thumbnail/${copy._id}`);
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  const handleToggleStar = async () => {
    try {
      const updated = await api(`/thumbnails/${id}/star`, { method: "PATCH" });
      setThumb(updated);
    } catch {
      toast.error("Failed to update star");
    }
  };

  // Store handleDownload in ref so keyboard handler always has latest
  downloadRef.current = handleDownload;

  const handleKeyDown = useCallback(
    (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "?":
          setShortcutsOpen((v) => !v);
          break;
        case "Escape":
          if (shortcutsOpen) setShortcutsOpen(false);
          else if (zoomed) setZoomed(false);
          break;
        case "z":
          setZoomed((v) => !v);
          break;
        case "d":
          downloadRef.current?.();
          break;
        case "Backspace":
          navigate("/dashboard");
          break;
      }
    },
    [zoomed, shortcutsOpen, navigate],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <DashboardNav />
        <main className="max-w-4xl mx-auto px-6 py-10">
          <div className="h-4 w-32 rounded bg-white/4 animate-pulse mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden">
                <div className="aspect-video bg-white/4 animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-xl border border-white/6 bg-[#111118] p-5 space-y-3">
                <div className="h-5 w-3/4 rounded bg-white/4 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-white/4 animate-pulse" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-14 rounded-full bg-white/4 animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-white/4 animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/6 bg-[#111118] p-4 space-y-2"
                  >
                    <div className="h-3 w-12 rounded bg-white/4 animate-pulse" />
                    <div className="h-7 w-16 rounded bg-white/4 animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/6 bg-[#111118] p-5 space-y-3">
                <div className="h-3 w-16 rounded bg-white/4 animate-pulse" />
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-3 w-24 rounded bg-white/4 animate-pulse" />
                      <div className="h-3 w-6 rounded bg-white/4 animate-pulse" />
                    </div>
                    <div className="h-1 rounded-full bg-white/4 animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-9 rounded-lg border border-white/6 bg-white/3 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
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
              <div className="flex items-start justify-between gap-2">
                {editingTitle ? (
                  <input
                    ref={titleRef}
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    className="flex-1 min-w-0 font-heading text-xl font-semibold text-white tracking-[-0.01em] bg-transparent border-b border-white/20 outline-none pb-0.5"
                  />
                ) : (
                  <h1
                    className="group/title font-heading text-xl font-semibold text-white tracking-[-0.01em] cursor-pointer flex items-center gap-2"
                    onClick={startEditingTitle}
                  >
                    {thumb.title}
                    <Pencil className="w-3 h-3 text-[#4a4a54] opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
                  </h1>
                )}
                <button
                  onClick={handleToggleStar}
                  className={`shrink-0 mt-0.5 transition-colors ${
                    thumb.starred
                      ? "text-amber-400"
                      : "text-[#4a4a54] hover:text-amber-400"
                  }`}
                >
                  <Star
                    className="w-4.5 h-4.5"
                    fill={thumb.starred ? "currentColor" : "none"}
                  />
                </button>
              </div>
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
                    const barColor =
                      val >= 70
                        ? "bg-emerald-400/40"
                        : val >= 40
                          ? "bg-amber-400/40"
                          : "bg-red-400/40";
                    const textColor =
                      val >= 70
                        ? "text-emerald-400"
                        : val >= 40
                          ? "text-amber-400"
                          : "text-red-400";
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-[12px] text-[#737380]">
                            <Icon className="w-3 h-3" />
                            {label}
                          </span>
                          <span
                            className={`text-[12px] font-medium ${textColor}`}
                          >
                            {val}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={handleDownload}
                className="h-9 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </Button>
              <Button
                variant="outline"
                onClick={handleDuplicate}
                className="h-9 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                className="h-9 text-[13px] border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/30 bg-transparent font-medium gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>
          </motion.div>
        </div>
        {/* Related thumbnails */}
        {related.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(4)}
            className="mt-10"
          >
            <h2 className="text-[14px] font-medium text-[#737380] mb-4">
              Related Thumbnails
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {related.map((r) => (
                <Link
                  key={r._id}
                  to={`/thumbnail/${r._id}`}
                  className="group rounded-xl border border-white/6 bg-[#111118] hover:bg-[#0e0e16] overflow-hidden transition-all"
                >
                  <div className="aspect-video bg-[#1a1a24] overflow-hidden">
                    <img
                      src={`http://localhost:5000${r.imageUrl}`}
                      alt={r.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-[13px] font-medium text-white truncate">
                      {r.title}
                    </p>
                    {r.score > 0 && (
                      <p className="text-[11px] text-[#4a4a54] mt-0.5">
                        Score: {r.score}/100
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
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
            onClick={() => setZoomed(false)}
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

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        shortcuts={detailShortcuts}
      />
    </div>
  );
}

export default ThumbnailDetail;
