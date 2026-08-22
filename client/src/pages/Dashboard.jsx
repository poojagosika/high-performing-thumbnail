import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
  Star,
  TrendingUp,
  Trophy,
  LayoutGrid,
  List,
  Activity,
  Upload as UploadIcon,
  Share2,
  History,
  CalendarDays,
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
  { key: "v", label: "Toggle grid/list view" },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "newest";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const activeTags = searchParams.get("tags")
    ? searchParams.get("tags").split(",")
    : [];
  const showStarred = searchParams.get("starred") === "1";
  const view = searchParams.get("view") || "grid";
  const dateRange = searchParams.get("range") || "all";

  const setParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, val] of Object.entries(updates)) {
        if (
          val === null ||
          val === undefined ||
          val === "" ||
          (key === "sort" && val === "newest") ||
          (key === "page" && (val === 1 || val === "1")) ||
          (key === "starred" && !val) ||
          (key === "view" && val === "grid") ||
          (key === "range" && (val === "all" || !val))
        ) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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
  const [bulkExporting, setBulkExporting] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editThumb, setEditThumb] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);
  const searchDropdownRef = useRef(null);

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

  const handleBulkExport = async () => {
    setBulkExporting(true);
    try {
      const res = await fetch("http://localhost:5000/api/thumbnails/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "thumbnails.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${selectedIds.length} thumbnails exported`);
    } catch {
      toast.error("Failed to export thumbnails");
    } finally {
      setBulkExporting(false);
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

  const handleToggleStar = async (thumb) => {
    try {
      const updated = await api(`/thumbnails/${thumb._id}/star`, {
        method: "PATCH",
      });
      setThumbnails((prev) =>
        prev.map((t) => (t._id === updated._id ? updated : t)),
      );
    } catch {
      toast.error("Failed to update star");
    }
  };

  const allTags = [...new Set(thumbnails.flatMap((t) => t.tags || []))].sort();

  const toggleTag = (tag) => {
    const newTags = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    setParams({
      tags: newTags.length > 0 ? newTags.join(",") : null,
      page: 1,
    });
  };

  const searchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const titleMatches = thumbnails
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 4)
      .map((t) => ({ type: "thumbnail", id: t._id, label: t.title, imageUrl: t.imageUrl }));
    const tagMatches = allTags
      .filter((tag) => tag.toLowerCase().includes(q) && !activeTags.includes(tag))
      .slice(0, 3)
      .map((tag) => ({ type: "tag", id: tag, label: tag }));
    return [...titleMatches, ...tagMatches];
  }, [search, thumbnails, allTags, activeTags]);

  const filtered = thumbnails
    .filter((t) => {
      if (showStarred && !t.starred) return false;
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
      if (dateRange !== "all") {
        const created = new Date(t.createdAt);
        const now = new Date();
        if (dateRange === "today") {
          if (created.toDateString() !== now.toDateString()) return false;
        } else if (dateRange === "week") {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (created < weekAgo) return false;
        } else if (dateRange === "month") {
          const monthAgo = new Date(now);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (created < monthAgo) return false;
        } else if (dateRange === "year") {
          const yearAgo = new Date(now);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          if (created < yearAgo) return false;
        }
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
        case "v":
          setParams({ view: view === "grid" ? "list" : "grid" });
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
    api("/activities")
      .then((data) => setActivities(data))
      .catch(() => {});
  }, []);

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
            {user?.avatar ? (
              <img
                src={`http://localhost:5000${user.avatar}`}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center shrink-0">
                <span className="font-heading text-[15px] font-semibold text-white">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
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

        {!loading && thumbnails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(1)}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8"
          >
            {(() => {
              const scored = thumbnails.filter((t) => t.score > 0);
              const avgScore =
                scored.length > 0
                  ? Math.round(
                      scored.reduce((sum, t) => sum + t.score, 0) /
                        scored.length,
                    )
                  : null;
              const best = scored.length > 0
                ? scored.reduce((a, b) => (a.score > b.score ? a : b))
                : null;
              const starredCount = thumbnails.filter((t) => t.starred).length;

              return (
                <>
                  <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Image className="w-3.5 h-3.5 text-[#737380]" />
                      <span className="text-[12px] text-[#737380]">Total</span>
                    </div>
                    <span className="font-heading text-xl font-semibold text-white">
                      {thumbnails.length}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#737380]" />
                      <span className="text-[12px] text-[#737380]">
                        Avg Score
                      </span>
                    </div>
                    <span className="font-heading text-xl font-semibold text-white">
                      {avgScore != null ? avgScore : "—"}
                      {avgScore != null && (
                        <span className="text-[11px] text-[#4a4a54] font-normal ml-0.5">
                          /100
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Trophy className="w-3.5 h-3.5 text-[#737380]" />
                      <span className="text-[12px] text-[#737380]">
                        Best Score
                      </span>
                    </div>
                    {best ? (
                      <div>
                        <span className="font-heading text-xl font-semibold text-white">
                          {best.score}
                          <span className="text-[11px] text-[#4a4a54] font-normal ml-0.5">
                            /100
                          </span>
                        </span>
                        <p className="text-[11px] text-[#4a4a54] truncate mt-0.5">
                          {best.title}
                        </p>
                      </div>
                    ) : (
                      <span className="font-heading text-xl font-semibold text-white">
                        —
                      </span>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Star className="w-3.5 h-3.5 text-[#737380]" />
                      <span className="text-[12px] text-[#737380]">
                        Starred
                      </span>
                    </div>
                    <span className="font-heading text-xl font-semibold text-white">
                      {starredCount}
                    </span>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

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
              onClick={() => setActivityOpen((v) => !v)}
              variant="outline"
              className={`h-9 text-[13px] font-medium gap-1.5 ${activityOpen ? "border-white/16 text-white bg-white/5" : "border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent"}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Activity
            </Button>
            <Button
              onClick={() => setUploadOpen(true)}
              className="h-9 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Upload
            </Button>
          </div>
        </motion.div>

        <AnimatePresence>
          {activityOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-1.5 text-[14px] font-medium text-white">
                    <Activity className="w-4 h-4 text-[#737380]" />
                    Recent Activity
                  </h3>
                  <button
                    onClick={() => setActivityOpen(false)}
                    className="text-[#4a4a54] hover:text-white transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {activities.length === 0 ? (
                  <p className="text-[13px] text-[#4a4a54]">
                    No activity yet. Start by uploading a thumbnail.
                  </p>
                ) : (
                  <div className="space-y-0.5 max-h-64 overflow-y-auto scrollbar-none">
                    {activities.map((a) => {
                      const icons = {
                        uploaded: <UploadIcon className="w-3 h-3 text-emerald-400" />,
                        edited: <Pencil className="w-3 h-3 text-blue-400" />,
                        deleted: <Trash2 className="w-3 h-3 text-red-400" />,
                        starred: <Star className="w-3 h-3 text-amber-400" />,
                        unstarred: <Star className="w-3 h-3 text-[#4a4a54]" />,
                        duplicated: <Copy className="w-3 h-3 text-purple-400" />,
                        shared: <Share2 className="w-3 h-3 text-blue-400" />,
                        unshared: <Share2 className="w-3 h-3 text-[#4a4a54]" />,
                        reuploaded: <History className="w-3 h-3 text-cyan-400" />,
                      };
                      const labels = {
                        uploaded: "Uploaded",
                        edited: "Edited",
                        deleted: "Deleted",
                        starred: "Starred",
                        unstarred: "Unstarred",
                        duplicated: "Duplicated",
                        shared: "Shared",
                        unshared: "Unshared",
                        reuploaded: "Reuploaded",
                      };
                      const timeAgo = (date) => {
                        const s = Math.floor((Date.now() - new Date(date)) / 1000);
                        if (s < 60) return "just now";
                        const m = Math.floor(s / 60);
                        if (m < 60) return `${m}m ago`;
                        const h = Math.floor(m / 60);
                        if (h < 24) return `${h}h ago`;
                        const d = Math.floor(h / 24);
                        if (d < 7) return `${d}d ago`;
                        return new Date(date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      };
                      return (
                        <div
                          key={a._id}
                          className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/2 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-white/4 flex items-center justify-center shrink-0">
                            {icons[a.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-white truncate">
                              <span className="text-[#737380]">
                                {labels[a.type]}
                              </span>{" "}
                              {a.thumbnailId ? (
                                <Link
                                  to={`/thumbnail/${a.thumbnailId}`}
                                  className="hover:underline underline-offset-2"
                                >
                                  {a.thumbnailTitle}
                                </Link>
                              ) : (
                                <span className="text-[#4a4a54]">
                                  {a.thumbnailTitle}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="text-[10px] text-[#4a4a54] shrink-0">
                            {timeAgo(a.createdAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            <div className="relative flex-1" ref={searchDropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54] pointer-events-none z-10" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setParams({ q: e.target.value, page: 1 })}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search by title or tag..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
              {searchFocused && searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-white/8 bg-[#111118] shadow-2xl overflow-hidden z-50">
                  {searchSuggestions.map((s, i) => (
                    <button
                      key={`${s.type}-${s.id}`}
                      onClick={() => {
                        if (s.type === "thumbnail") {
                          navigate(`/thumbnail/${s.id}`);
                        } else {
                          toggleTag(s.label);
                          setParams({ q: "", page: 1 });
                        }
                        setSearchFocused(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/4 transition-colors"
                    >
                      {s.type === "thumbnail" ? (
                        <>
                          <div className="w-10 h-6 rounded bg-[#1a1a24] overflow-hidden shrink-0">
                            <img
                              src={`http://localhost:5000${s.imageUrl}`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-[13px] text-white truncate flex-1">
                            {s.label}
                          </span>
                          <span className="text-[10px] text-[#4a4a54] shrink-0">
                            Thumbnail
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-6 rounded bg-white/4 flex items-center justify-center shrink-0">
                            <Tag className="w-3 h-3 text-[#737380]" />
                          </div>
                          <span className="text-[13px] text-[#737380] truncate flex-1">
                            {s.label}
                          </span>
                          <span className="text-[10px] text-[#4a4a54] shrink-0">
                            Tag
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setParams({ starred: !showStarred ? "1" : null, page: 1 })}
              className={`shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center transition-all ${
                showStarred
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-400"
                  : "border-white/8 bg-white/3 text-[#4a4a54] hover:text-amber-400 hover:border-white/12"
              }`}
              title={showStarred ? "Show all" : "Show starred"}
            >
              <Star
                className="w-3.5 h-3.5"
                fill={showStarred ? "currentColor" : "none"}
              />
            </button>
            <div className="relative shrink-0">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54] pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setParams({ sort: e.target.value, page: 1 })}
                className="h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[13px] text-[#737380] outline-none focus:border-white/16 transition-colors appearance-none cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
                <option value="score">Score</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="relative shrink-0">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54] pointer-events-none" />
              <select
                value={dateRange}
                onChange={(e) => setParams({ range: e.target.value, page: 1 })}
                className="h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[13px] text-[#737380] outline-none focus:border-white/16 transition-colors appearance-none cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
            <div className="shrink-0 flex items-center rounded-lg border border-white/8 bg-white/3 overflow-hidden">
              <button
                onClick={() => setParams({ view: "grid" })}
                className={`h-9 w-9 flex items-center justify-center transition-colors ${
                  view === "grid"
                    ? "bg-white/8 text-white"
                    : "text-[#4a4a54] hover:text-white"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setParams({ view: "list" })}
                className={`h-9 w-9 flex items-center justify-center transition-colors ${
                  view === "list"
                    ? "bg-white/8 text-white"
                    : "text-[#4a4a54] hover:text-white"
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
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
                  onClick={() => setParams({ tags: null, page: 1 })}
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
          (search.trim() || activeTags.length > 0 || showStarred || dateRange !== "all") ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {showStarred ? (
              <Star className="w-5 h-5 text-[#4a4a54] mb-3" />
            ) : dateRange !== "all" ? (
              <CalendarDays className="w-5 h-5 text-[#4a4a54] mb-3" />
            ) : (
              <Search className="w-5 h-5 text-[#4a4a54] mb-3" />
            )}
            <p className="text-[14px] text-[#737380]">
              {showStarred
                ? "No starred thumbnails"
                : search.trim()
                  ? `No thumbnails matching "${search}"`
                  : dateRange !== "all"
                    ? "No thumbnails in this date range"
                    : "No thumbnails with selected tags"}
            </p>
            {(activeTags.length > 0 || showStarred || dateRange !== "all") && (
              <button
                onClick={() => setParams({ tags: null, starred: null, range: null, page: 1 })}
                className="text-[13px] text-[#737380] hover:text-white mt-2 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : view === "list" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(2)}
            className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden"
          >
            {/* Table header */}
            <div className={`grid ${canDrag ? "grid-cols-[20px_44px_1fr_80px_1fr_100px_40px]" : "grid-cols-[44px_1fr_80px_1fr_100px_40px]"} items-center gap-3 px-4 py-2.5 border-b border-white/6 text-[11px] text-[#4a4a54] uppercase tracking-wider font-medium`}>
              {canDrag && <span />}
              <span />
              <span>Title</span>
              <span>Score</span>
              <span>Tags</span>
              <span>Date</span>
              <span />
            </div>
            {paginated.map((thumb, i) => (
              <motion.div
                key={thumb._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
                className={`group grid ${canDrag ? "grid-cols-[20px_44px_1fr_80px_1fr_100px_40px]" : "grid-cols-[44px_1fr_80px_1fr_100px_40px]"} items-center gap-3 px-4 py-2 border-b border-white/4 last:border-b-0 hover:bg-white/2 transition-all ${
                  dragOverId === thumb._id && dragId !== thumb._id
                    ? "bg-white/4 border-white/12"
                    : dragId === thumb._id
                      ? "opacity-50"
                      : ""
                } ${
                  (compareMode && compareIds.includes(thumb._id)) ||
                  (selectMode && selectedIds.includes(thumb._id))
                    ? "bg-white/3"
                    : ""
                } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                onClick={
                  compareMode
                    ? () => toggleCompare(thumb._id)
                    : selectMode
                      ? () => toggleSelect(thumb._id)
                      : undefined
                }
              >
                {/* Drag handle */}
                {canDrag && (
                  <div className="text-[#4a4a54] group-hover:text-[#737380] transition-colors">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}
                {/* Thumbnail */}
                <div className="relative w-11 h-7 rounded overflow-hidden bg-[#1a1a24] shrink-0">
                  {compareMode || selectMode ? (
                    <img
                      src={`http://localhost:5000${thumb.imageUrl}`}
                      alt={thumb.title}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                  ) : (
                    <Link to={`/thumbnail/${thumb._id}`}>
                      <img
                        src={`http://localhost:5000${thumb.imageUrl}`}
                        alt={thumb.title}
                        className="w-full h-full object-cover"
                      />
                    </Link>
                  )}
                  {compareMode && compareIds.includes(thumb._id) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/30">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                  )}
                  {selectMode && selectedIds.includes(thumb._id) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30">
                      <Check className="w-3 h-3 text-blue-400" />
                    </div>
                  )}
                </div>
                {/* Title */}
                <Link
                  to={`/thumbnail/${thumb._id}`}
                  className="text-[13px] text-white truncate hover:text-white/80 transition-colors"
                >
                  {thumb.title}
                </Link>
                {/* Score */}
                <span className="text-[12px] text-[#737380]">
                  {thumb.score > 0 ? `${thumb.score}/100` : "—"}
                </span>
                {/* Tags */}
                <div className="flex gap-1 overflow-hidden">
                  {thumb.tags?.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] rounded-full px-2 py-0.5 bg-white/4 text-[#4a4a54] truncate shrink-0"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {/* Date */}
                <span className="text-[11px] text-[#4a4a54]">
                  {new Date(thumb.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {/* Star */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStar(thumb);
                  }}
                  className={`transition-colors ${
                    thumb.starred
                      ? "text-amber-400"
                      : "text-[#4a4a54] opacity-0 group-hover:opacity-100 hover:text-amber-400"
                  }`}
                >
                  <Star
                    className="w-3.5 h-3.5"
                    fill={thumb.starred ? "currentColor" : "none"}
                  />
                </button>
              </motion.div>
            ))}
          </motion.div>
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
                    <button
                      onClick={() => handleToggleStar(thumb)}
                      className={`transition-colors ${
                        thumb.starred
                          ? "text-amber-400"
                          : "text-[#4a4a54] opacity-0 group-hover:opacity-100 hover:text-amber-400"
                      }`}
                    >
                      <Star
                        className="w-3.5 h-3.5"
                        fill={thumb.starred ? "currentColor" : "none"}
                      />
                    </button>
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
              onClick={() => setParams({ page: Math.max(1, safePage - 1) })}
              disabled={safePage <= 1}
              className="h-8 w-8 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center text-[#737380] hover:text-white hover:border-white/12 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setParams({ page: p })}
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
              onClick={() => setParams({ page: Math.min(totalPages, safePage + 1) })}
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
              onClick={handleBulkExport}
              disabled={bulkExporting}
              variant="outline"
              className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {bulkExporting ? "Exporting..." : "Download"}
            </Button>
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
