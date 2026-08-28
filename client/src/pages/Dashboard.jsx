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
  Sparkles,
  FileImage,
  Folder,
  FolderPlus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import DashboardNav from "../components/DashboardNav";
import UploadModal from "../components/UploadModal";
import ScoreChart from "../components/ScoreChart";
import AnalyticsChart from "../components/AnalyticsChart";
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
const TRASH_RETENTION_DAYS = 30;

const daysLeftInTrash = (deletedAt) => {
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(elapsed / 86400000));
};

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
  const activeCollection = searchParams.get("collection") || "";
  const trashMode = searchParams.get("trash") === "1";

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
          (key === "trash" && !val) ||
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
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editThumb, setEditThumb] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [collections, setCollections] = useState([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [addingCollection, setAddingCollection] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState(null);
  const [bulkCollectionOpen, setBulkCollectionOpen] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [trashed, setTrashed] = useState(null);
  const [purgeId, setPurgeId] = useState(null);
  const [purging, setPurging] = useState(false);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const searchRef = useRef(null);
  const searchDropdownRef = useRef(null);

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 6
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

  const collectionCounts = useMemo(() => {
    const map = {};
    thumbnails.forEach((t) => {
      if (t.collectionId) {
        const key = String(t.collectionId);
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [thumbnails]);

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      const created = await api("/collections", {
        method: "POST",
        body: { name },
      });
      setCollections((prev) => [...prev, created]);
      setNewCollectionName("");
      setAddingCollection(false);
      toast.success(`Collection "${created.name}" created`);
    } catch {
      toast.error("Failed to create collection");
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleRenameCollection = async (id) => {
    const name = renameValue.trim();
    if (!name) return setRenameId(null);
    try {
      const updated = await api(`/collections/${id}`, {
        method: "PATCH",
        body: { name },
      });
      setCollections((prev) =>
        prev.map((c) => (c._id === id ? { ...c, name: updated.name } : c)),
      );
      toast.success("Collection renamed");
    } catch {
      toast.error("Failed to rename collection");
    } finally {
      setRenameId(null);
    }
  };

  const handleDeleteCollection = async () => {
    const id = deleteCollectionId;
    if (!id) return;
    try {
      await api(`/collections/${id}`, { method: "DELETE" });
      setCollections((prev) => prev.filter((c) => c._id !== id));
      setThumbnails((prev) =>
        prev.map((t) =>
          String(t.collectionId || "") === id ? { ...t, collectionId: null } : t,
        ),
      );
      if (activeCollection === id) setParams({ collection: null, page: 1 });
      toast.success("Collection deleted");
    } catch {
      toast.error("Failed to delete collection");
    } finally {
      setDeleteCollectionId(null);
    }
  };

  const handleBulkCollection = async (collectionId) => {
    setBulkMoving(true);
    try {
      const updated = await api("/thumbnails/bulk-collection", {
        method: "POST",
        body: { ids: selectedIds, collectionId: collectionId || null },
      });
      setThumbnails((prev) =>
        prev.map((t) => updated.find((u) => u._id === t._id) || t),
      );
      const target = collections.find((c) => c._id === collectionId);
      toast.success(
        target
          ? `Moved ${selectedIds.length} to "${target.name}"`
          : `Removed ${selectedIds.length} from collections`,
      );
      setBulkCollectionOpen(false);
      exitSelect();
    } catch {
      toast.error("Failed to move thumbnails");
    } finally {
      setBulkMoving(false);
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

  const handleBulkAnalyze = async () => {
    setBulkAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: selectedIds.length });
    let completed = 0;
    for (const thumbId of selectedIds) {
      try {
        const updated = await api(`/thumbnails/${thumbId}/analyze`, { method: "POST" });
        setThumbnails((prev) =>
          prev.map((t) => (t._id === updated._id ? updated : t)),
        );
      } catch {}
      completed++;
      setAnalyzeProgress({ done: completed, total: selectedIds.length });
    }
    setBulkAnalyzing(false);
    toast.success(`${selectedIds.length} thumbnails analyzed`);
    exitSelect();
  };

  const handleExportReport = () => {
    const canvas = document.createElement("canvas");
    const w = 1200;
    const h = 630;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillText("ThumbCraft Analytics Report", 48, 60);

    // Date
    ctx.fillStyle = "#737380";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 48, 88);

    // Separator
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(48, 108, w - 96, 1);

    // Stats
    const scored = thumbnails.filter((t) => t.score > 0);
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, t) => s + t.score, 0) / scored.length) : null;
    const bestThumb = scored.length > 0 ? scored.reduce((a, b) => (a.score > b.score ? a : b)) : null;
    const starredCount = thumbnails.filter((t) => t.starred).length;
    const allTags = [...new Set(thumbnails.flatMap((t) => t.tags || []))];
    const topTags = (() => {
      const counts = {};
      thumbnails.forEach((t) => (t.tags || []).forEach((tag) => { counts[tag] = (counts[tag] || 0) + 1; }));
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    })();

    const statCards = [
      { label: "Total Thumbnails", value: String(thumbnails.length) },
      { label: "Average Score", value: avgScore != null ? `${avgScore}/100` : "—" },
      { label: "Best Score", value: bestThumb ? `${bestThumb.score}/100` : "—", sub: bestThumb?.title },
      { label: "Starred", value: String(starredCount) },
    ];

    const cardW = (w - 96 - 36) / 4;
    statCards.forEach((stat, i) => {
      const x = 48 + i * (cardW + 12);
      const y = 130;
      // Card bg
      ctx.fillStyle = "#111118";
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, 90, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      ctx.fillStyle = "#737380";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(stat.label, x + 16, y + 28);
      // Value
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px Inter, sans-serif";
      ctx.fillText(stat.value, x + 16, y + 60);
      // Sub
      if (stat.sub) {
        ctx.fillStyle = "#4a4a54";
        ctx.font = "11px Inter, sans-serif";
        const truncated = stat.sub.length > 20 ? stat.sub.slice(0, 20) + "..." : stat.sub;
        ctx.fillText(truncated, x + 16, y + 78);
      }
    });

    // Score distribution bar chart
    const chartX = 48;
    const chartY = 250;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.fillText("Score Distribution", chartX, chartY);

    if (scored.length > 0) {
      const buckets = [0, 0, 0, 0, 0];
      scored.forEach((t) => {
        if (t.score <= 20) buckets[0]++;
        else if (t.score <= 40) buckets[1]++;
        else if (t.score <= 60) buckets[2]++;
        else if (t.score <= 80) buckets[3]++;
        else buckets[4]++;
      });
      const maxBucket = Math.max(...buckets, 1);
      const labels = ["0-20", "21-40", "41-60", "61-80", "81-100"];
      const barW = 80;
      const barMaxH = 120;
      const barGap = 16;
      const barStartX = chartX + 40;
      const barBaseY = chartY + 160;

      buckets.forEach((count, i) => {
        const bx = barStartX + i * (barW + barGap);
        const bh = (count / maxBucket) * barMaxH;
        // Bar
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.roundRect(bx, barBaseY - bh, barW, bh, [4, 4, 0, 0]);
        ctx.fill();
        // Count
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(count), bx + barW / 2, barBaseY - bh - 8);
        // Label
        ctx.fillStyle = "#4a4a54";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(labels[i], bx + barW / 2, barBaseY + 16);
        ctx.textAlign = "left";
      });
    }

    // Top tags
    const tagX = 580;
    const tagY = 250;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.fillText("Top Tags", tagX, tagY);

    if (topTags.length > 0) {
      const tagMaxW = 500;
      const tagMax = topTags[0][1];
      topTags.forEach(([tag, count], i) => {
        const ty = tagY + 30 + i * 36;
        // Label
        ctx.fillStyle = "#737380";
        ctx.font = "13px Inter, sans-serif";
        ctx.fillText(tag, tagX, ty + 14);
        // Bar
        const barX = tagX + 120;
        const barW = (count / tagMax) * (tagMaxW - 160);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.roundRect(barX, ty, barW, 20, 4);
        ctx.fill();
        // Count
        ctx.fillStyle = "#737380";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.fillText(String(count), barX + barW + 8, ty + 14);
      });
    } else {
      ctx.fillStyle = "#4a4a54";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText("No tags yet", tagX, tagY + 40);
    }

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(48, h - 52, w - 96, 1);
    ctx.fillStyle = "#4a4a54";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(`Generated by ThumbCraft · ${allTags.length} unique tags · ${thumbnails.length} thumbnails`, 48, h - 24);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "thumbcraft-report.png";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    }, "image/png");
  };

  const canDrag =
    sort === "custom" &&
    !compareMode &&
    !selectMode &&
    !trashMode &&
    !search.trim();

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
      toast.success("Moved to trash");
    } catch {
      toast.error("Failed to move thumbnail to trash");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleRestore = async (thumb) => {
    try {
      const restored = await api(`/thumbnails/${thumb._id}/restore`, {
        method: "POST",
      });
      setTrashed((prev) => prev.filter((t) => t._id !== thumb._id));
      setThumbnails((prev) => [restored, ...prev]);
      toast.success(`"${thumb.title}" restored`);
    } catch {
      toast.error("Failed to restore thumbnail");
    }
  };

  const handlePurge = async () => {
    if (!purgeId) return;
    setPurging(true);
    try {
      await api(`/thumbnails/${purgeId}/purge`, { method: "DELETE" });
      setTrashed((prev) => prev.filter((t) => t._id !== purgeId));
      toast.success("Permanently deleted");
    } catch {
      toast.error("Failed to delete thumbnail");
    } finally {
      setPurging(false);
      setPurgeId(null);
    }
  };

  const handleBulkRestore = async () => {
    try {
      await api("/thumbnails/bulk-restore", {
        method: "POST",
        body: { ids: selectedIds },
      });
      const restored = trashItems.filter((t) => selectedIds.includes(t._id));
      setTrashed((prev) => prev.filter((t) => !selectedIds.includes(t._id)));
      setThumbnails((prev) => [
        ...restored.map((t) => ({ ...t, deletedAt: null })),
        ...prev,
      ]);
      toast.success(`${selectedIds.length} thumbnails restored`);
      exitSelect();
    } catch {
      toast.error("Failed to restore thumbnails");
    }
  };

  const handleBulkPurge = async () => {
    setPurging(true);
    try {
      await api("/thumbnails/bulk-purge", {
        method: "POST",
        body: { ids: selectedIds },
      });
      setTrashed((prev) => prev.filter((t) => !selectedIds.includes(t._id)));
      toast.success(`${selectedIds.length} thumbnails permanently deleted`);
      setBulkPurgeOpen(false);
      exitSelect();
    } catch {
      toast.error("Failed to delete thumbnails");
    } finally {
      setPurging(false);
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

  const trashItems = trashed ?? [];

  const filtered = (trashMode ? trashItems : thumbnails)
    .filter((t) => {
      // Tag, star, collection and date filters don't apply to the trash view
      if (trashMode) {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      if (showStarred && !t.starred) return false;
      if (activeCollection && String(t.collectionId || "") !== activeCollection)
        return false;
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
      if (trashMode) return new Date(b.deletedAt) - new Date(a.deletedAt);
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
    if (!trashMode) return;
    let cancelled = false;
    api("/thumbnails/trash")
      .then((data) => {
        if (cancelled) return;
        setTrashed(
          data.map((t) => ({ ...t, daysLeft: daysLeftInTrash(t.deletedAt) })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTrashed([]);
        toast.error("Failed to load trash");
      });
    return () => {
      cancelled = true;
    };
  }, [trashMode, toast]);

  useEffect(() => {
    api("/collections")
      .then((data) => setCollections(data))
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

        {!loading && thumbnails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(1)}
            className="flex justify-end mb-4"
          >
            <button
              onClick={handleExportReport}
              className="flex items-center gap-1.5 text-[12px] text-[#737380] hover:text-white border border-white/8 hover:border-white/12 rounded-lg px-3 py-1.5 transition-colors"
            >
              <FileImage className="w-3.5 h-3.5" />
              Export Report
            </button>
          </motion.div>
        )}

        {!loading && <ScoreChart thumbnails={thumbnails} />}
        {!loading && <AnalyticsChart thumbnails={thumbnails} />}

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
              Select thumbnails to compare (2-6) — {compareIds.length} selected
            </p>
          </motion.div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Collections rail */}
          {!loading && (
            <aside className="w-full lg:w-52 shrink-0 lg:sticky lg:top-6">
              <div className="rounded-xl border border-white/6 bg-[#111118] p-3">
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-medium text-[#4a4a54]">
                    Collections
                  </span>
                  <button
                    onClick={() => {
                      setAddingCollection((v) => !v);
                      setNewCollectionName("");
                    }}
                    className="text-[#4a4a54] hover:text-white transition-colors"
                    title="New collection"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() =>
                    setParams({ collection: null, trash: null, page: 1 })
                  }
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                    !activeCollection && !trashMode
                      ? "bg-white/6 text-white"
                      : "text-[#737380] hover:bg-white/4 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1 text-left">All</span>
                  <span className="text-[11px] text-[#4a4a54]">
                    {thumbnails.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    exitSelect();
                    setParams({ trash: "1", collection: null, page: 1 });
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                    trashMode
                      ? "bg-white/6 text-white"
                      : "text-[#737380] hover:bg-white/4 hover:text-white"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1 text-left">Trash</span>
                  {trashItems.length > 0 && (
                    <span className="text-[11px] text-[#4a4a54]">
                      {trashItems.length}
                    </span>
                  )}
                </button>

                {collections.map((c) => (
                  <div key={c._id} className="group relative">
                    {renameId === c._id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameCollection(c._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCollection(c._id);
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        className="w-full h-8 px-2 rounded-lg border border-white/12 bg-white/3 text-[13px] text-white outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setParams({ collection: c._id, page: 1 })}
                        onDoubleClick={() => {
                          setRenameId(c._id);
                          setRenameValue(c.name);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                          activeCollection === c._id
                            ? "bg-white/6 text-white"
                            : "text-[#737380] hover:bg-white/4 hover:text-white"
                        }`}
                        title="Double-click to rename"
                      >
                        <Folder
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: c.color }}
                        />
                        <span className="truncate flex-1 text-left">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-[#4a4a54] group-hover:hidden">
                          {collectionCounts[c._id] || 0}
                        </span>
                      </button>
                    )}
                    {renameId !== c._id && (
                      <button
                        onClick={() => setDeleteCollectionId(c._id)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex text-[#4a4a54] hover:text-red-400 transition-colors"
                        title="Delete collection"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {addingCollection && (
                  <input
                    autoFocus
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCollection();
                      if (e.key === "Escape") setAddingCollection(false);
                    }}
                    onBlur={() => {
                      if (!newCollectionName.trim()) setAddingCollection(false);
                    }}
                    disabled={creatingCollection}
                    placeholder="Collection name..."
                    className="w-full h-8 mt-1 px-2 rounded-lg border border-white/12 bg-white/3 text-[13px] text-white placeholder:text-[#4a4a54] outline-none"
                  />
                )}

                {collections.length === 0 && !addingCollection && (
                  <p className="px-2 py-2 text-[12px] text-[#4a4a54] leading-relaxed">
                    No collections yet. Group thumbnails by project or client.
                  </p>
                )}
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0 w-full">
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
            {!trashMode && (
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
            )}
            {!trashMode && (
            <>
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
            </>
            )}
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

        {!loading && !trashMode && allTags.length > 0 && (
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

        {loading || (trashMode && trashed === null) ? (
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
        ) : trashMode && trashItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Trash2 className="w-5 h-5 text-[#4a4a54] mb-3" />
            <p className="text-[14px] text-[#737380]">Trash is empty</p>
            <p className="text-[13px] text-[#4a4a54] mt-1">
              Deleted thumbnails stay here for {TRASH_RETENTION_DAYS} days
            </p>
          </div>
        ) : !trashMode && thumbnails.length === 0 ? (
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
          (search.trim() ||
            activeTags.length > 0 ||
            showStarred ||
            activeCollection ||
            dateRange !== "all") ? (
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
            {(activeTags.length > 0 ||
              showStarred ||
              activeCollection ||
              dateRange !== "all") && (
              <button
                onClick={() =>
                  setParams({
                    tags: null,
                    starred: null,
                    range: null,
                    collection: null,
                    page: 1,
                  })
                }
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
                    compareIds.length < 6 && (
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
                  {trashMode && !selectMode && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handleRestore(thumb)}
                        title="Restore"
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-emerald-400 hover:bg-black/70 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPurgeId(thumb._id)}
                        title="Delete forever"
                        className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-red-400 hover:bg-black/70 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {!trashMode && !compareMode && !selectMode && (
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
                    {trashMode ? (
                      <span
                        className="text-[11px] text-[#4a4a54] shrink-0"
                        title={`Permanently deleted after ${TRASH_RETENTION_DAYS} days in trash`}
                      >
                        {thumb.daysLeft}d left
                      </span>
                    ) : (
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
                    )}
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
          </div>
        </div>
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
                Move to trash?
              </h2>
              <p className="text-[13px] text-[#737380] mt-1.5">
                You can restore it from Trash for the next{" "}
                {TRASH_RETENTION_DAYS} days, after which it is deleted
                permanently.
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
                  {deleting ? "Moving..." : "Move to trash"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Compare bar */}
      <AnimatePresence>
        {compareMode && compareIds.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#111118] border border-white/8 rounded-xl px-5 py-3 shadow-2xl"
          >
            <span className="text-[13px] text-[#737380]">
              {compareIds.length} thumbnails selected
            </span>
            <Button
              onClick={() => {
                const params = compareIds.map((id, i) => `ids=${id}`).join("&");
                navigate(`/compare?${params}`);
              }}
              className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
              Compare {compareIds.length}
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
            {trashMode && (
              <>
                <Button
                  onClick={handleBulkRestore}
                  variant="outline"
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </Button>
                <Button
                  onClick={() => setBulkPurgeOpen(true)}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete forever
                </Button>
              </>
            )}
            {!trashMode && (
            <>
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
              onClick={handleBulkAnalyze}
              disabled={bulkAnalyzing}
              variant="outline"
              className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {bulkAnalyzing
                ? `Analyzing ${analyzeProgress.done}/${analyzeProgress.total}`
                : "Analyze"}
            </Button>
            <Button
              onClick={() => setBulkCollectionOpen(true)}
              variant="outline"
              className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Folder className="w-3.5 h-3.5" />
              Move
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
            </>
            )}
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

      {/* Permanent delete modals */}
      <AnimatePresence>
        {(purgeId || bulkPurgeOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setPurgeId(null);
                setBulkPurgeOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-sm rounded-xl border border-red-500/20 bg-[#111118] p-5"
            >
              <h3 className="font-heading text-[15px] font-semibold text-white mb-1">
                Delete forever?
              </h3>
              <p className="text-[13px] text-[#737380] mb-5">
                {bulkPurgeOpen
                  ? `${selectedIds.length} thumbnails and their image files`
                  : "This thumbnail and its image file"}{" "}
                will be erased from disk. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setPurgeId(null);
                    setBulkPurgeOpen(false);
                  }}
                  variant="outline"
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={bulkPurgeOpen ? handleBulkPurge : handlePurge}
                  disabled={purging}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium"
                >
                  {purging ? "Deleting..." : "Delete forever"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Move to collection modal */}
      <AnimatePresence>
        {bulkCollectionOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setBulkCollectionOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-sm rounded-xl border border-white/8 bg-[#111118] p-5"
            >
              <h3 className="font-heading text-[15px] font-semibold text-white mb-1">
                Move to collection
              </h3>
              <p className="text-[13px] text-[#737380] mb-4">
                {selectedIds.length} thumbnail
                {selectedIds.length === 1 ? "" : "s"} selected
              </p>
              <div className="max-h-56 overflow-y-auto -mx-1 px-1">
                {collections.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => handleBulkCollection(c._id)}
                    disabled={bulkMoving}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] text-[#737380] hover:bg-white/4 hover:text-white transition-colors disabled:opacity-40"
                  >
                    <Folder
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
                <button
                  onClick={() => handleBulkCollection(null)}
                  disabled={bulkMoving}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] text-[#737380] hover:bg-white/4 hover:text-white transition-colors disabled:opacity-40"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Remove from collection</span>
                </button>
              </div>
              {collections.length === 0 && (
                <p className="text-[13px] text-[#4a4a54] py-2">
                  Create a collection from the sidebar first.
                </p>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => setBulkCollectionOpen(false)}
                  variant="outline"
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete collection modal */}
      <AnimatePresence>
        {deleteCollectionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteCollectionId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-sm rounded-xl border border-white/8 bg-[#111118] p-5"
            >
              <h3 className="font-heading text-[15px] font-semibold text-white mb-1">
                Delete collection?
              </h3>
              <p className="text-[13px] text-[#737380] mb-5">
                The thumbnails inside stay in your library — they just become
                uncategorized.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setDeleteCollectionId(null)}
                  variant="outline"
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteCollection}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium"
                >
                  Delete
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
