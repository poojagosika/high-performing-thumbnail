import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus,
  Image,
  Trash2,
  Pencil,
  Mail,
  CreditCard,
  Search,
  ArrowUpDown,
  ZoomIn,
  GitCompareArrows,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckSquare,
  Tag,
  GripVertical,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import DashboardNav from "../components/DashboardNav";
import UploadModal from "../components/UploadModal";
import ScoreChart from "../components/ScoreChart";
import ShortcutsModal from "../components/ShortcutsModal";
import EditModal from "../components/EditModal";
import api from "../lib/api";

const dashboardShortcuts = [
  { key: "/", label: "Focus search" },
  { key: "u", label: "Upload thumbnail" },
  { key: "c", label: "Toggle compare mode" },
  { key: "s", label: "Toggle select mode" },
  { key: "Esc", label: "Close modal / exit mode" },
  { key: "?", label: "Show shortcuts" },
];

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });
const PER_PAGE = 9;

function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [thumbnails, setThumbnails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [zoomUrl, setZoomUrl] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagging, setBulkTagging] = useState(false);
  const [page, setPage] = useState(1);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [activeTags, setActiveTags] = useState([]);
  const [editThumb, setEditThumb] = useState(null);
  const searchRef = useRef(null);

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2
          ? [...prev, id]
          : prev,
    );
  };

  const exitCompare = () => {
    setCompareMode(false);
    setCompareIds([]);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await api("/thumbnails/bulk-delete", {
        method: "POST",
        body: { ids: selectedIds },
      });
      setThumbnails((prev) => prev.filter((t) => !selectedIds.includes(t._id)));
      toast.success(`${selectedIds.length} thumbnails deleted`);
      exitSelect();
    } catch {
      toast.error("Failed to delete thumbnails");
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  const handleBulkTag = async () => {
    if (!bulkTagInput.trim()) return;
    setBulkTagging(true);
    try {
      const updated = await api("/thumbnails/bulk-tag", {
        method: "POST",
        body: { ids: selectedIds, tags: bulkTagInput },
      });
      setThumbnails((prev) =>
        prev.map((t) => {
          const match = updated.find((u) => u._id === t._id);
          return match ? match : t;
        }),
      );
      toast.success(`Tags added to ${selectedIds.length} thumbnails`);
      setBulkTagOpen(false);
      setBulkTagInput("");
      exitSelect();
    } catch {
      toast.error("Failed to update tags");
    } finally {
      setBulkTagging(false);
    }
  };

  const canDrag =
    sort === "custom" && !compareMode && !selectMode && !search.trim();

  const handleDrop = async (targetId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const ids = filtered.map((t) => t._id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);

    // Update local state immediately
    const reordered = ids.map((id, i) => {
      const t = thumbnails.find((th) => th._id === id);
      return { ...t, order: i };
    });
    setThumbnails((prev) =>
      prev.map((t) => {
        const match = reordered.find((r) => r._id === t._id);
        return match || t;
      }),
    );

    setDragId(null);
    setDragOverId(null);

    try {
      await api("/thumbnails/reorder", { method: "POST", body: { ids } });
    } catch {
      toast.error("Failed to save order");
    }
  };

  const handleDuplicate = async (thumb) => {
    try {
      const copy = await api(`/thumbnails/${thumb._id}/duplicate`, {
        method: "POST",
      });
      setThumbnails((prev) => [copy, ...prev]);
      toast.success("Thumbnail duplicated");
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  const handleDownload = async (thumb) => {
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

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/thumbnails/${deleteId}`, { method: "DELETE" });
      setThumbnails((prev) => prev.filter((t) => t._id !== deleteId));
      toast.success("Thumbnail deleted");
    } catch {
      toast.error("Failed to delete thumbnail");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const allTags = [...new Set(thumbnails.flatMap((t) => t.tags || []))].sort();

  const toggleTag = (tag) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const filtered = thumbnails
    .filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.tags?.some((tag) => tag.toLowerCase().includes(q))
        )
          return false;
      }
      if (activeTags.length > 0) {
        if (!t.tags?.some((tag) => activeTags.includes(tag))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "title":
          return a.title.localeCompare(b.title);
        case "score":
          return (b.score ?? -1) - (a.score ?? -1);
        case "custom":
          return (a.order ?? 0) - (b.order ?? 0);
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const safePage = Math.min(page, totalPages || 1);
  const paginated = filtered.slice(
    (safePage - 1) * PER_PAGE,
    safePage * PER_PAGE,
  );

  const handleKeyDown = useCallback(
    (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "?":
          setShortcutsOpen((v) => !v);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "u":
          setUploadOpen(true);
          break;
        case "c":
          if (!selectMode) {
            compareMode ? exitCompare() : setCompareMode(true);
          }
          break;
        case "s":
          if (!compareMode) {
            selectMode ? exitSelect() : setSelectMode(true);
          }
          break;
        case "Escape":
          if (shortcutsOpen) setShortcutsOpen(false);
          else if (editThumb) setEditThumb(null);
          else if (zoomUrl) setZoomUrl(null);
          else if (deleteId) setDeleteId(null);
          else if (bulkDeleteOpen) setBulkDeleteOpen(false);
          else if (bulkTagOpen) setBulkTagOpen(false);
          else if (uploadOpen) setUploadOpen(false);
          else if (compareMode) exitCompare();
          else if (selectMode) exitSelect();
          break;
      }
    },
    [
      compareMode,
      selectMode,
      shortcutsOpen,
      editThumb,
      zoomUrl,
      deleteId,
      bulkDeleteOpen,
      bulkTagOpen,
      uploadOpen,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, activeTags]);

  useEffect(() => {
    api("/thumbnails")
      .then((data) => setThumbnails(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <DashboardNav />

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Profile section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center shrink-0">
              <span className="font-heading text-[15px] font-semibold text-white">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-medium text-white truncate">
                {user?.name}
              </h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5 text-[12px] text-[#737380]">
                  <Mail className="w-3 h-3" />
                  {user?.email}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-[#737380] capitalize">
                  <CreditCard className="w-3 h-3" />
                  {user?.plan} plan
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {!loading && <ScoreChart thumbnails={thumbnails} />}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
              Your Thumbnails
            </h1>
            <p className="text-[14px] text-[#737380] mt-1">
              {thumbnails.length} thumbnail{thumbnails.length !== 1 && "s"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!loading && thumbnails.length >= 2 && !selectMode && (
              <Button
                onClick={compareMode ? exitCompare : () => setCompareMode(true)}
                variant="outline"
                className={`h-9 text-[13px] font-medium gap-1.5 ${compareMode ? "border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/40 bg-emerald-500/5" : "border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent"}`}
              >
                {compareMode ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </>
                ) : (
                  <>
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    Compare
                  </>
                )}
              </Button>
            )}
            {!loading && thumbnails.length > 0 && !compareMode && (
              <Button
                onClick={selectMode ? exitSelect : () => setSelectMode(true)}
                variant="outline"
                className={`h-9 text-[13px] font-medium gap-1.5 ${selectMode ? "border-blue-500/30 text-blue-400 hover:text-blue-300 hover:border-blue-500/40 bg-blue-500/5" : "border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent"}`}
              >
                {selectMode ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    Select
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={() => setUploadOpen(true)}
              className="h-9 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Upload
            </Button>
          </div>
        </motion.div>

        {compareMode && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-4 py-2.5"
          >
            <p className="text-[13px] text-emerald-400">
              Select 2 thumbnails to compare — {compareIds.length}/2 selected
            </p>
          </motion.div>
        )}

        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-blue-500/10 bg-blue-500/5 px-4 py-2.5"
          >
            <p className="text-[13px] text-blue-400">
              Select thumbnails for bulk actions — {selectedIds.length} selected
            </p>
          </motion.div>
        )}

        {!loading && thumbnails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="mb-6 flex items-center gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or tag..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div className="relative shrink-0">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54] pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[13px] text-[#737380] outline-none focus:border-white/16 transition-colors appearance-none cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
                <option value="score">Score</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </motion.div>
        )}

        {!loading && allTags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(3)}
            className="mb-6 flex items-center gap-2 overflow-x-auto scrollbar-none"
          >
            <span className="text-[12px] text-[#4a4a54] shrink-0">Tags</span>
            <div className="flex items-center gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all ${
                    activeTags.includes(tag)
                      ? "bg-white text-[#0a0a0f]"
                      : "bg-white/4 text-[#737380] hover:text-white hover:bg-white/8"
                  }`}
                >
                  {tag}
                </button>
              ))}
              {activeTags.length > 0 && (
                <button
                  onClick={() => setActiveTags([])}
                  className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-[#737380] hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-white/4" />
                <div className="p-4 space-y-2.5">
                  <div className="h-3.5 w-3/4 rounded bg-white/4" />
                  <div className="h-3 w-1/2 rounded bg-white/4" />
                </div>
              </div>
            ))}
          </div>
        ) : thumbnails.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-12 h-12 rounded-xl bg-white/4 border border-white/6 flex items-center justify-center mb-4">
              <Image className="w-5 h-5 text-[#737380]" />
            </div>
            <h2 className="font-heading text-lg font-medium text-white mb-1">
              No thumbnails yet
            </h2>
            <p className="text-[14px] text-[#737380] max-w-sm mb-6">
              Upload your first thumbnail to start analyzing and optimizing your
              click-through rate.
            </p>
            <Button
              onClick={() => setUploadOpen(true)}
              className="h-9 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Upload Thumbnail
            </Button>
          </motion.div>
        ) : filtered.length === 0 &&
          (search.trim() || activeTags.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-5 h-5 text-[#4a4a54] mb-3" />
            <p className="text-[14px] text-[#737380]">
              {search.trim()
                ? `No thumbnails matching "${search}"`
                : `No thumbnails with selected tags`}
            </p>
            {activeTags.length > 0 && (
              <button
                onClick={() => setActiveTags([])}
                className="text-[13px] text-[#737380] hover:text-white mt-2 transition-colors"
              >
                Clear tag filters
              </button>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(2)}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {paginated.map((thumb, i) => (
              <motion.div
                key={thumb._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i + 2)}
                draggable={canDrag}
                onDragStart={() => setDragId(thumb._id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (canDrag) setDragOverId(thumb._id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(thumb._id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                className={`group rounded-xl border bg-[#111118] hover:bg-[#0e0e16] transition-all overflow-hidden ${
                  dragOverId === thumb._id && dragId !== thumb._id
                    ? "border-white/20 scale-[1.02]"
                    : dragId === thumb._id
                      ? "border-white/10 opacity-50"
                      : "border-white/6"
                } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div
                  className="relative aspect-video bg-[#1a1a24] overflow-hidden"
                  onClick={
                    compareMode
                      ? () => toggleCompare(thumb._id)
                      : selectMode
                        ? () => toggleSelect(thumb._id)
                        : undefined
                  }
                >
                  {compareMode || selectMode ? (
                    <img
                      src={`http://localhost:5000${thumb.imageUrl}`}
                      alt={thumb.title}
                      className={`w-full h-full object-cover cursor-pointer transition-opacity ${
                        compareMode
                          ? compareIds.includes(thumb._id)
                            ? "opacity-100"
                            : "opacity-60"
                          : selectedIds.includes(thumb._id)
                            ? "opacity-100"
                            : "opacity-60"
                      }`}
                    />
                  ) : (
                    <Link
                      to={`/thumbnail/${thumb._id}`}
                      className="block w-full h-full"
                    >
                      <img
                        src={`http://localhost:5000${thumb.imageUrl}`}
                        alt={thumb.title}
                        className="w-full h-full object-cover"
                      />
                    </Link>
                  )}
                  {compareMode && compareIds.includes(thumb._id) && (
                    <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {compareMode &&
                    !compareIds.includes(thumb._id) &&
                    compareIds.length < 2 && (
                      <div className="absolute top-2 left-2 w-5 h-5 rounded-full border-2 border-white/30 bg-black/30" />
                    )}
                  {selectMode && selectedIds.includes(thumb._id) && (
                    <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {selectMode && !selectedIds.includes(thumb._id) && (
                    <div className="absolute top-2 left-2 w-5 h-5 rounded-full border-2 border-white/30 bg-black/30" />
                  )}
                  {!compareMode && !selectMode && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {canDrag && (
                        <div className="p-1.5 rounded-md bg-black/50 text-white/70">
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <button
                        onClick={() => setEditThumb(thumb)}
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(thumb)}
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownload(thumb)}
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setZoomUrl(`http://localhost:5000${thumb.imageUrl}`)
                        }
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className="text-[14px] font-medium text-white truncate cursor-pointer hover:text-white/80 transition-colors"
                      onClick={() => setEditThumb(thumb)}
                      title="Click to edit"
                    >
                      {thumb.title}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditThumb(thumb)}
                        className="text-[#4a4a54] hover:text-white transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setDeleteId(thumb._id)}
                        className="text-[#4a4a54] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {thumb.score > 0 && (
                      <span className="text-[12px] text-[#737380]">
                        Score: {thumb.score}/100
                      </span>
                    )}
                    {thumb.tags?.length > 0 && (
                      <div className="flex gap-1.5">
                        {thumb.tags.slice(0, 3).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`text-[11px] rounded-full px-2 py-0.5 transition-colors ${
                              activeTags.includes(tag)
                                ? "bg-white/12 text-white"
                                : "bg-white/4 text-[#4a4a54] hover:text-[#737380]"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(4)}
            className="flex items-center justify-center gap-2 mt-8"
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-8 w-8 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center text-[#737380] hover:text-white hover:border-white/12 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-8 w-8 rounded-lg text-[13px] font-medium transition-colors ${
                  p === safePage
                    ? "bg-white text-[#0a0a0f]"
                    : "border border-white/8 bg-white/3 text-[#737380] hover:text-white hover:border-white/12"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="h-8 w-8 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center text-[#737380] hover:text-white hover:border-white/12 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </main>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(thumb) => {
          setThumbnails((prev) => [thumb, ...prev]);
          toast.success("Thumbnail uploaded");
        }}
      />

      {/* Confirm delete modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Delete thumbnail?
              </h2>
              <p className="text-[13px] text-[#737380] mt-1.5">
                This action cannot be undone. The thumbnail will be permanently
                removed.
              </p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <Button
                  variant="outline"
                  onClick={() => setDeleteId(null)}
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Compare bar */}
      <AnimatePresence>
        {compareMode && compareIds.length === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#111118] border border-white/8 rounded-xl px-5 py-3 shadow-2xl"
          >
            <span className="text-[13px] text-[#737380]">
              2 thumbnails selected
            </span>
            <Button
              onClick={() =>
                navigate(`/compare?a=${compareIds[0]}&b=${compareIds[1]}`)
              }
              className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
              Compare
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Select bar */}
      <AnimatePresence>
        {selectMode && selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#111118] border border-white/8 rounded-xl px-5 py-3 shadow-2xl"
          >
            <span className="text-[13px] text-[#737380]">
              {selectedIds.length} selected
            </span>
            <Button
              onClick={() => {
                setBulkTagInput("");
                setBulkTagOpen(true);
              }}
              variant="outline"
              className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              Tag
            </Button>
            <Button
              onClick={() => setBulkDeleteOpen(true)}
              className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk delete modal */}
      <AnimatePresence>
        {bulkDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setBulkDeleteOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Delete {selectedIds.length} thumbnails?
              </h2>
              <p className="text-[13px] text-[#737380] mt-1.5">
                This action cannot be undone. All selected thumbnails will be
                permanently removed.
              </p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <Button
                  variant="outline"
                  onClick={() => setBulkDeleteOpen(false)}
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium"
                >
                  {bulkDeleting ? "Deleting..." : "Delete All"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk tag modal */}
      <AnimatePresence>
        {bulkTagOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setBulkTagOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Add tags to {selectedIds.length} thumbnails
              </h2>
              <p className="text-[13px] text-[#737380] mt-1.5">
                Tags will be added to all selected thumbnails. Separate with
                commas.
              </p>
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBulkTag();
                }}
                autoFocus
                placeholder="gaming, tutorial, vlog"
                className="w-full h-9 px-3 mt-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setBulkTagOpen(false)}
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkTag}
                  disabled={bulkTagging || !bulkTagInput.trim()}
                  className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium"
                >
                  {bulkTagging ? "Saving..." : "Add Tags"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Zoom overlay */}
      <AnimatePresence>
        {zoomUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out p-6"
            onClick={() => setZoomUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src={zoomUrl}
              alt="Zoom"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        shortcuts={dashboardShortcuts}
      />

      <EditModal
        open={!!editThumb}
        thumb={editThumb}
        onClose={() => setEditThumb(null)}
        onSaved={(updated) => {
          setThumbnails((prev) =>
            prev.map((t) => (t._id === updated._id ? updated : t)),
          );
          toast.success("Thumbnail updated");
        }}
      />
    </div>
  );
}

export default Dashboard;
