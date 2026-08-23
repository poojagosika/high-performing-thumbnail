import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  StickyNote,
  History,
  Upload,
  Share2,
  Link2,
  Unlink,
  Crop,
  PenTool,
  Circle,
  Square,
  ArrowUpRight,
  Undo2,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import ShortcutsModal from "../components/ShortcutsModal";
import { useToast } from "../context/ToastContext";
import api from "../lib/api";

const detailShortcuts = [
  { key: "d", label: "Download thumbnail" },
  { key: "z", label: "Toggle zoom" },
  { key: "←/→", label: "Previous / next thumbnail" },
  { key: "Esc", label: "Close zoom" },
  { key: "Backspace", label: "Back to dashboard" },
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
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panDragging = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [related, setRelated] = useState([]);
  const [allThumbs, setAllThumbs] = useState([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [comparingVersion, setComparingVersion] = useState(null);
  const [reuploading, setReuploading] = useState(false);
  const [palette, setPalette] = useState([]);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [cropPreset, setCropPreset] = useState(null);
  const [cropDragging, setCropDragging] = useState(null);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annoTool, setAnnoTool] = useState("freehand");
  const [annoColor, setAnnoColor] = useState("#ef4444");
  const [annoStroke, setAnnoStroke] = useState(3);
  const [annoShapes, setAnnoShapes] = useState([]);
  const [annoDrawing, setAnnoDrawing] = useState(null);
  const [annoText, setAnnoText] = useState({ active: false, x: 0, y: 0, value: "" });
  const annoCanvasRef = useRef(null);
  const annoImgRef = useRef(null);
  const annoContainerRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const cropImgRef = useRef(null);
  const cropContainerRef = useRef(null);
  const downloadRef = useRef(null);
  const reuploadRef = useRef(null);
  const titleRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    // Reset states on thumbnail change
    setZoomed(false);
    setEditingTags(false);
    setEditingTitle(false);
    setRelated([]);
    setLoading(true);

    setNotesInput("");
    setNotesSaved(true);
    setComparingVersion(null);
    setPalette([]);

    api(`/thumbnails/${id}`)
      .then((data) => {
        setThumb(data);
        setNotesInput(data.notes || "");
        // Track view
        api(`/thumbnails/${id}/track`, {
          method: "POST",
          body: { type: "view" },
        }).then((updated) => setThumb(updated)).catch(() => {});
        // Fetch all thumbnails for related + prev/next
        api("/thumbnails").then((all) => {
          setAllThumbs(all);
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

  // Extract color palette from image
  useEffect(() => {
    if (!thumb?.imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = `http://localhost:5000${thumb.imageUrl}`;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      // Simple k-means-like quantization: bucket colors
      const buckets = {};
      for (let i = 0; i < data.length; i += 16) {
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        buckets[key] = (buckets[key] || 0) + 1;
      }
      const sorted = Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([key]) => {
          const [r, g, b] = key.split(",").map(Number);
          return `rgb(${r},${g},${b})`;
        });
      setPalette(sorted);
    };
  }, [thumb?.imageUrl]);

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

  const saveNotes = async () => {
    if (notesInput === (thumb?.notes || "")) {
      setNotesSaved(true);
      return;
    }
    try {
      await api(`/thumbnails/${id}`, {
        method: "PATCH",
        body: { notes: notesInput },
      });
      setThumb((prev) => ({ ...prev, notes: notesInput }));
      setNotesSaved(true);
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const handleReupload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReuploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`http://localhost:5000/api/thumbnails/${id}/reupload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const updated = await res.json();
      setThumb(updated);
      toast.success("New version uploaded");
    } catch {
      toast.error("Failed to upload new version");
    } finally {
      setReuploading(false);
      if (reuploadRef.current) reuploadRef.current.value = "";
    }
  };

  const handleToggleShare = async () => {
    try {
      const updated = await api(`/thumbnails/${id}/share`, { method: "PATCH" });
      setThumb(updated);
      if (updated.shareToken) {
        toast.success("Share link created");
      } else {
        toast.success("Share link revoked");
      }
    } catch {
      toast.error("Failed to update share link");
    }
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/shared/${thumb.shareToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const cropPresets = [
    { label: "YouTube", w: 1280, h: 720 },
    { label: "HD", w: 1920, h: 1080 },
    { label: "Square", w: 1080, h: 1080 },
    { label: "Twitter", w: 1200, h: 675 },
    { label: "Instagram", w: 1080, h: 1350 },
    { label: "Free", w: 0, h: 0 },
  ];

  const openCropModal = () => {
    setCropPreset(null);
    setCropArea({ x: 0, y: 0, w: 100, h: 100 });
    setCropOpen(true);
  };

  const applyCropPreset = (preset, imgW, imgH) => {
    if (preset.w === 0) {
      setCropPreset(preset);
      setCropArea({ x: 0, y: 0, w: 100, h: 100 });
      return;
    }
    setCropPreset(preset);
    const targetRatio = preset.w / preset.h;
    const imgRatio = imgW / imgH;
    let cropW, cropH;
    if (targetRatio > imgRatio) {
      cropW = 100;
      cropH = (imgW / targetRatio / imgH) * 100;
    } else {
      cropH = 100;
      cropW = (imgH * targetRatio / imgW) * 100;
    }
    setCropArea({
      x: (100 - cropW) / 2,
      y: (100 - cropH) / 2,
      w: cropW,
      h: cropH,
    });
  };

  const handleCropMouseDown = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
    const container = cropContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    const startArea = { ...cropArea };

    const onMove = (ev) => {
      const mx = ((ev.clientX - rect.left) / rect.width) * 100;
      const my = ((ev.clientY - rect.top) / rect.height) * 100;
      const dx = mx - startX;
      const dy = my - startY;

      if (type === "move") {
        const nx = Math.max(0, Math.min(100 - startArea.w, startArea.x + dx));
        const ny = Math.max(0, Math.min(100 - startArea.h, startArea.y + dy));
        setCropArea({ ...startArea, x: nx, y: ny });
      } else {
        let { x, y, w, h } = startArea;
        if (type.includes("r")) w = Math.max(5, Math.min(100 - x, w + dx));
        if (type.includes("l")) { const nw = Math.max(5, w - dx); x = x + (w - nw); w = nw; }
        if (type.includes("b")) h = Math.max(5, Math.min(100 - y, h + dy));
        if (type.includes("t")) { const nh = Math.max(5, h - dy); y = y + (h - nh); h = nh; }
        // Constrain aspect ratio for presets
        if (cropPreset && cropPreset.w > 0) {
          const ratio = cropPreset.w / cropPreset.h;
          const img = cropImgRef.current;
          if (img) {
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const pixelW = (w / 100) * img.naturalWidth;
            const newH = pixelW / ratio;
            h = (newH / img.naturalHeight) * 100;
            if (y + h > 100) { h = 100 - y; w = ((h / 100) * img.naturalHeight * ratio / img.naturalWidth) * 100; }
          }
        }
        setCropArea({ x: Math.max(0, x), y: Math.max(0, y), w, h });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleCropDownload = () => {
    const img = cropImgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    const sx = (cropArea.x / 100) * img.naturalWidth;
    const sy = (cropArea.y / 100) * img.naturalHeight;
    const sw = (cropArea.w / 100) * img.naturalWidth;
    const sh = (cropArea.h / 100) * img.naturalHeight;
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = cropPreset?.label ? `-${cropPreset.label.toLowerCase()}` : "-cropped";
      a.download = `${thumb.title}${suffix}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Cropped image downloaded");
    }, "image/png");
  };

  // --- Annotation logic ---
  const openAnnotateModal = () => {
    setAnnoShapes([]);
    setAnnoDrawing(null);
    setAnnoTool("freehand");
    setAnnoText({ active: false, x: 0, y: 0, value: "" });
    setAnnotateOpen(true);
  };

  const getAnnoPos = (e) => {
    const canvas = annoCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawShape = (ctx, shape) => {
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.type === "freehand" && shape.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } else if (shape.type === "arrow") {
      const { sx, sy, ex, ey } = shape;
      const angle = Math.atan2(ey - sy, ex - sx);
      const headLen = 12 + shape.stroke * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (shape.type === "circle") {
      const rx = Math.abs(shape.ex - shape.sx) / 2;
      const ry = Math.abs(shape.ey - shape.sy) / 2;
      const cx = (shape.sx + shape.ex) / 2;
      const cy = (shape.sy + shape.ey) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === "rect") {
      ctx.beginPath();
      ctx.rect(shape.sx, shape.sy, shape.ex - shape.sx, shape.ey - shape.sy);
      ctx.stroke();
    } else if (shape.type === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.sx, shape.sy);
      ctx.lineTo(shape.ex, shape.ey);
      ctx.stroke();
    } else if (shape.type === "text") {
      ctx.font = `${Math.max(14, shape.stroke * 6)}px Inter, sans-serif`;
      ctx.fillText(shape.value, shape.x, shape.y);
    }
  };

  const redrawAnno = useCallback(() => {
    const canvas = annoCanvasRef.current;
    const img = annoImgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    annoShapes.forEach((s) => drawShape(ctx, s));
    if (annoDrawing) drawShape(ctx, annoDrawing);
  }, [annoShapes, annoDrawing]);

  useEffect(() => {
    if (annotateOpen) redrawAnno();
  }, [annotateOpen, redrawAnno]);

  const handleAnnoMouseDown = (e) => {
    if (annoTool === "text") {
      const pos = getAnnoPos(e);
      setAnnoText({ active: true, x: pos.x, y: pos.y, value: "" });
      return;
    }
    const pos = getAnnoPos(e);
    if (annoTool === "freehand") {
      setAnnoDrawing({ type: "freehand", points: [pos], color: annoColor, stroke: annoStroke });
    } else {
      setAnnoDrawing({ type: annoTool, sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y, color: annoColor, stroke: annoStroke });
    }
  };

  const handleAnnoMouseMove = (e) => {
    if (!annoDrawing) return;
    const pos = getAnnoPos(e);
    if (annoDrawing.type === "freehand") {
      setAnnoDrawing((d) => ({ ...d, points: [...d.points, pos] }));
    } else {
      setAnnoDrawing((d) => ({ ...d, ex: pos.x, ey: pos.y }));
    }
  };

  const handleAnnoMouseUp = () => {
    if (!annoDrawing) return;
    setAnnoShapes((prev) => [...prev, annoDrawing]);
    setAnnoDrawing(null);
  };

  const handleAnnoTextSubmit = () => {
    if (annoText.value.trim()) {
      setAnnoShapes((prev) => [
        ...prev,
        { type: "text", x: annoText.x, y: annoText.y, value: annoText.value, color: annoColor, stroke: annoStroke },
      ]);
    }
    setAnnoText({ active: false, x: 0, y: 0, value: "" });
  };

  const handleAnnoUndo = () => {
    setAnnoShapes((prev) => prev.slice(0, -1));
  };

  const handleAnnoDownload = () => {
    const canvas = annoCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${thumb.title}-annotated.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Annotated image downloaded");
    }, "image/png");
  };

  const annoTools = [
    { id: "freehand", label: "Draw", Icon: PenTool },
    { id: "arrow", label: "Arrow", Icon: ArrowUpRight },
    { id: "circle", label: "Circle", Icon: Circle },
    { id: "rect", label: "Rect", Icon: Square },
    { id: "line", label: "Line", Icon: Minus },
    { id: "text", label: "Text", Icon: Type },
  ];

  const annoColors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];

  const handleTrackClick = async () => {
    try {
      const updated = await api(`/thumbnails/${id}/track`, {
        method: "POST",
        body: { type: "click" },
      });
      setThumb(updated);
      toast.success("Click recorded");
    } catch {
      toast.error("Failed to record click");
    }
  };

  // Store refs so keyboard handler always has latest
  downloadRef.current = handleDownload;
  const idx = allThumbs.findIndex((t) => t._id === id);
  prevRef.current = idx > 0 ? allThumbs[idx - 1]._id : null;
  nextRef.current =
    idx >= 0 && idx < allThumbs.length - 1 ? allThumbs[idx + 1]._id : null;

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
          else if (zoomed) {
            setZoomed(false);
            setZoomLevel(1);
            setPanOffset({ x: 0, y: 0 });
          }
          break;
        case "z":
          setZoomed((v) => !v);
          break;
        case "d":
          downloadRef.current?.();
          break;
        case "ArrowLeft":
          if (prevRef.current) navigate(`/thumbnail/${prevRef.current}`);
          break;
        case "ArrowRight":
          if (nextRef.current) navigate(`/thumbnail/${nextRef.current}`);
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

  const currentIdx = allThumbs.findIndex((t) => t._id === id);
  const prevThumb = currentIdx > 0 ? allThumbs[currentIdx - 1] : null;
  const nextThumb =
    currentIdx >= 0 && currentIdx < allThumbs.length - 1
      ? allThumbs[currentIdx + 1]
      : null;

  return (
    <div className="min-h-screen">
      <DashboardNav />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
          className="flex items-center justify-between mb-6"
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#737380] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          {allThumbs.length > 1 && (
            <div className="flex items-center gap-1">
              <Link
                to={prevThumb ? `/thumbnail/${prevThumb._id}` : "#"}
                className={`h-7 w-7 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center transition-colors ${
                  prevThumb
                    ? "text-[#737380] hover:text-white hover:border-white/12"
                    : "text-[#4a4a54]/30 pointer-events-none"
                }`}
                title={prevThumb?.title}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
              <span className="text-[11px] text-[#4a4a54] px-1.5">
                {currentIdx + 1}/{allThumbs.length}
              </span>
              <Link
                to={nextThumb ? `/thumbnail/${nextThumb._id}` : "#"}
                className={`h-7 w-7 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center transition-colors ${
                  nextThumb
                    ? "text-[#737380] hover:text-white hover:border-white/12"
                    : "text-[#4a4a54]/30 pointer-events-none"
                }`}
                title={nextThumb?.title}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
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

            {/* Version History */}
            {(thumb.versions?.length > 0 || true) && (
              <div className="mt-4 rounded-xl border border-white/6 bg-[#111118] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-1.5 text-[13px] text-[#737380] font-medium">
                    <History className="w-3.5 h-3.5" />
                    Version History
                    {thumb.versions?.length > 0 && (
                      <span className="text-[11px] text-[#4a4a54] font-normal ml-1">
                        ({thumb.versions.length + 1} versions)
                      </span>
                    )}
                  </h3>
                  <label
                    className={`flex items-center gap-1.5 text-[11px] border border-white/8 hover:border-white/12 rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                      reuploading
                        ? "text-[#4a4a54] pointer-events-none"
                        : "text-[#737380] hover:text-white"
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    {reuploading ? "Uploading..." : "New Version"}
                    <input
                      ref={reuploadRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleReupload}
                      className="hidden"
                    />
                  </label>
                </div>
                {thumb.versions?.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                    {[...thumb.versions].reverse().map((v, i) => (
                      <button
                        key={i}
                        onClick={() => setComparingVersion(v)}
                        className="shrink-0 rounded-lg border border-white/6 hover:border-white/16 overflow-hidden transition-all group/ver"
                      >
                        <div className="relative w-28 aspect-video bg-[#1a1a24]">
                          <img
                            src={`http://localhost:5000${v.imageUrl}`}
                            alt={`Version ${thumb.versions.length - i}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/ver:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] text-white font-medium">
                              Compare
                            </span>
                          </div>
                        </div>
                        <div className="px-2 py-1.5">
                          <span className="text-[10px] text-[#4a4a54]">
                            v{thumb.versions.length - i} ·{" "}
                            {new Date(v.uploadedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#4a4a54]">
                    Upload a new version to start tracking changes
                  </p>
                )}
              </div>
            )}
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

            {/* Color Palette */}
            {palette.length > 0 && (
              <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
                <h3 className="flex items-center gap-1.5 text-[13px] text-[#737380] font-medium mb-3">
                  <Palette className="w-3.5 h-3.5" />
                  Color Palette
                </h3>
                <div className="flex gap-2">
                  {palette.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const hex = color
                          .match(/\d+/g)
                          .map((n) => parseInt(n).toString(16).padStart(2, "0"))
                          .join("");
                        navigator.clipboard.writeText(`#${hex}`);
                        toast.success(`Copied #${hex}`);
                      }}
                      className="group/color flex-1 flex flex-col items-center gap-1.5"
                      title="Click to copy hex"
                    >
                      <div
                        className="w-full aspect-square rounded-lg border border-white/6 group-hover/color:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[9px] text-[#4a4a54] group-hover/color:text-[#737380] transition-colors">
                        {color
                          .match(/\d+/g)
                          .map((n) => parseInt(n).toString(16).padStart(2, "0"))
                          .join("")
                          .toUpperCase()
                          .replace(/^/, "#")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {/* A/B Test Tracking */}
            <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] text-[#737380] font-medium">
                  Performance Tracking
                </h3>
                <button
                  onClick={handleTrackClick}
                  className="flex items-center gap-1.5 text-[11px] text-[#737380] hover:text-white border border-white/8 hover:border-white/12 rounded-lg px-2.5 py-1 transition-colors"
                >
                  <MousePointerClick className="w-3 h-3" />
                  Record Click
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-white/6 bg-white/2 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <Eye className="w-3 h-3 text-[#4a4a54]" />
                    <span className="text-[10px] text-[#4a4a54]">Views</span>
                  </div>
                  <span className="font-heading text-lg font-semibold text-white">
                    {thumb.views || 0}
                  </span>
                </div>
                <div className="rounded-lg border border-white/6 bg-white/2 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <MousePointerClick className="w-3 h-3 text-[#4a4a54]" />
                    <span className="text-[10px] text-[#4a4a54]">Clicks</span>
                  </div>
                  <span className="font-heading text-lg font-semibold text-white">
                    {thumb.clicks || 0}
                  </span>
                </div>
                <div className="rounded-lg border border-white/6 bg-white/2 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="w-3 h-3 text-[#4a4a54]" />
                    <span className="text-[10px] text-[#4a4a54]">CTR</span>
                  </div>
                  <span className="font-heading text-lg font-semibold text-emerald-400">
                    {thumb.views > 0
                      ? `${((thumb.clicks / thumb.views) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>
              {/* CTR over time chart */}
              {thumb.dailyStats?.length >= 2 && (() => {
                const stats = [...thumb.dailyStats]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .slice(-14);
                const ctrValues = stats.map((d) =>
                  d.views > 0 ? (d.clicks / d.views) * 100 : 0,
                );
                const maxCtr = Math.max(...ctrValues, 1);
                const viewW = 400;
                const viewH = 80;
                const pad = { top: 8, right: 8, bottom: 16, left: 8 };
                const plotW = viewW - pad.left - pad.right;
                const plotH = viewH - pad.top - pad.bottom;
                const points = ctrValues.map((v, i) => ({
                  x: pad.left + (i / (ctrValues.length - 1)) * plotW,
                  y: pad.top + plotH - (v / maxCtr) * plotH,
                  ctr: v,
                  date: stats[i].date,
                }));
                const linePath = points
                  .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                  .join(" ");
                const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + plotH} L ${points[0].x} ${pad.top + plotH} Z`;
                const formatDate = (d) => {
                  const [, m, day] = d.split("-");
                  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
                };
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-[#4a4a54]">
                        CTR over time
                      </span>
                      <span className="text-[10px] text-[#4a4a54]">
                        Last {stats.length} days
                      </span>
                    </div>
                    <svg
                      viewBox={`0 0 ${viewW} ${viewH}`}
                      className="w-full"
                      preserveAspectRatio="none"
                      style={{ height: 80 }}
                    >
                      <defs>
                        <linearGradient id="ctrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(52,211,153,0.15)" />
                          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#ctrGrad)" />
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {points.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r="2.5"
                          fill="#111118"
                          stroke="#34d399"
                          strokeWidth="1.5"
                        >
                          <title>
                            {formatDate(p.date)}: {p.ctr.toFixed(1)}% CTR
                          </title>
                        </circle>
                      ))}
                      <text
                        x={points[0].x}
                        y={viewH - 2}
                        fill="rgba(255,255,255,0.15)"
                        fontSize="8"
                        textAnchor="start"
                      >
                        {formatDate(stats[0].date)}
                      </text>
                      <text
                        x={points[points.length - 1].x}
                        y={viewH - 2}
                        fill="rgba(255,255,255,0.15)"
                        fontSize="8"
                        textAnchor="end"
                      >
                        {formatDate(stats[stats.length - 1].date)}
                      </text>
                    </svg>
                  </div>
                );
              })()}
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-1.5 text-[13px] text-[#737380] font-medium">
                  <StickyNote className="w-3.5 h-3.5" />
                  Notes
                </h3>
                {!notesSaved && (
                  <button
                    onClick={saveNotes}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Save
                  </button>
                )}
                {notesSaved && notesInput !== "" && (
                  <span className="text-[10px] text-[#4a4a54]">Saved</span>
                )}
              </div>
              <textarea
                value={notesInput}
                onChange={(e) => {
                  setNotesInput(e.target.value);
                  setNotesSaved(false);
                }}
                onBlur={saveNotes}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.target.blur();
                  }
                }}
                placeholder="Add observations, ideas, or feedback..."
                rows={3}
                className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors resize-none"
              />
              <p className="text-[10px] text-[#4a4a54] mt-1.5">
                Auto-saves on blur · Ctrl+Enter to save
              </p>
            </div>

            {/* Share */}
            <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13px] text-[#737380] font-medium">
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </h3>
                <button
                  onClick={handleToggleShare}
                  className={`flex items-center gap-1.5 text-[11px] border rounded-lg px-2.5 py-1 transition-colors ${
                    thumb.shareToken
                      ? "border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/30"
                      : "border-white/8 text-[#737380] hover:text-white hover:border-white/12"
                  }`}
                >
                  {thumb.shareToken ? (
                    <>
                      <Unlink className="w-3 h-3" />
                      Revoke
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3 h-3" />
                      Create Link
                    </>
                  )}
                </button>
              </div>
              {thumb.shareToken && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-8 px-3 rounded-lg border border-white/8 bg-white/3 flex items-center overflow-hidden">
                    <span className="text-[12px] text-[#737380] truncate">
                      {window.location.origin}/shared/{thumb.shareToken}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyShareLink}
                    className="shrink-0 h-8 px-3 rounded-lg border border-white/8 bg-white/3 text-[12px] text-[#737380] hover:text-white hover:border-white/12 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-5 gap-2">
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
                onClick={openCropModal}
                className="h-9 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
              >
                <Crop className="w-3.5 h-3.5" />
                Crop
              </Button>
              <Button
                variant="outline"
                onClick={openAnnotateModal}
                className="h-9 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
              >
                <PenTool className="w-3.5 h-3.5" />
                Markup
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

      {/* Zoom overlay with pan */}
      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm select-none"
            onWheel={(e) => {
              e.preventDefault();
              setZoomLevel((z) => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.25 : 0.25))));
            }}
            onMouseDown={(e) => {
              if (e.target.closest("[data-zoom-controls]")) return;
              if (zoomLevel > 1) {
                panDragging.current = true;
                panStart.current = { x: e.clientX, y: e.clientY };
                panOffsetStart.current = { ...panOffset };
              }
            }}
            onMouseMove={(e) => {
              if (!panDragging.current) return;
              setPanOffset({
                x: panOffsetStart.current.x + (e.clientX - panStart.current.x),
                y: panOffsetStart.current.y + (e.clientY - panStart.current.y),
              });
            }}
            onMouseUp={() => { panDragging.current = false; }}
            onMouseLeave={() => { panDragging.current = false; }}
            style={{ cursor: zoomLevel > 1 ? (panDragging.current ? "grabbing" : "grab") : "zoom-out" }}
            onClick={(e) => {
              if (e.target.closest("[data-zoom-controls]")) return;
              if (zoomLevel <= 1 && !panDragging.current) {
                setZoomed(false);
                setZoomLevel(1);
                setPanOffset({ x: 0, y: 0 });
              }
            }}
          >
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                src={`http://localhost:5000${thumb.imageUrl}`}
                alt={thumb.title}
                className="max-w-full max-h-full object-contain rounded-lg"
                draggable={false}
                style={{
                  transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                  transition: panDragging.current ? "none" : "transform 0.15s ease-out",
                }}
              />
            </div>

            {/* Zoom controls */}
            <div
              data-zoom-controls
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-xl border border-white/10 bg-[#111118]/90 backdrop-blur-md px-2 py-1.5"
            >
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737380] hover:text-white hover:bg-white/8 transition-colors text-[16px] font-medium"
              >
                −
              </button>
              <button
                onClick={() => {
                  setZoomLevel(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-2 h-7 rounded-lg flex items-center justify-center text-[12px] text-[#737380] hover:text-white hover:bg-white/8 transition-colors font-medium min-w-[48px]"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.min(5, z + 0.25))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737380] hover:text-white hover:bg-white/8 transition-colors text-[16px] font-medium"
              >
                +
              </button>
              <div className="w-px h-4 bg-white/8 mx-1" />
              <button
                onClick={() => {
                  setZoomed(false);
                  setZoomLevel(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737380] hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Zoom hint */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] text-[#4a4a54]">
              Scroll to zoom · Drag to pan · Click to close
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Version compare overlay */}
      <AnimatePresence>
        {comparingVersion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setComparingVersion(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-[15px] font-semibold text-white">
                  Version Comparison
                </h2>
                <button
                  onClick={() => setComparingVersion(null)}
                  className="text-[#4a4a54] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-[#4a4a54] mb-2 text-center">
                    Previous · v{thumb.versions?.findIndex(
                      (v) => v.imageUrl === comparingVersion.imageUrl
                    ) + 1}{" "}
                    · {new Date(comparingVersion.uploadedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <div className="rounded-lg border border-white/6 overflow-hidden bg-[#1a1a24]">
                    <img
                      src={`http://localhost:5000${comparingVersion.imageUrl}`}
                      alt="Previous version"
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-[#4a4a54] mb-2 text-center">
                    Current · v{(thumb.versions?.length || 0) + 1} · Latest
                  </p>
                  <div className="rounded-lg border border-white/6 overflow-hidden bg-[#1a1a24]">
                    <img
                      src={`http://localhost:5000${thumb.imageUrl}`}
                      alt="Current version"
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Annotate modal */}
      <AnimatePresence>
        {annotateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setAnnotateOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-[15px] font-semibold text-white flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-[#737380]" />
                  Annotate & Markup
                </h2>
                <button
                  onClick={() => setAnnotateOpen(false)}
                  className="text-[#4a4a54] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                {/* Tool buttons */}
                <div className="flex items-center gap-1">
                  {annoTools.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setAnnoTool(id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                        annoTool === id
                          ? "bg-white text-[#0a0a0f]"
                          : "text-[#737380] border border-white/8 hover:text-white hover:border-white/12"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-white/8" />

                {/* Colors */}
                <div className="flex items-center gap-1.5">
                  {annoColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAnnoColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        annoColor === c ? "border-white scale-125" : "border-white/10 hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="w-px h-5 bg-white/8" />

                {/* Stroke width */}
                <div className="flex items-center gap-1.5">
                  {[2, 3, 5].map((w) => (
                    <button
                      key={w}
                      onClick={() => setAnnoStroke(w)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        annoStroke === w
                          ? "bg-white/10 border border-white/20"
                          : "border border-white/6 hover:border-white/12"
                      }`}
                    >
                      <div
                        className="rounded-full bg-white"
                        style={{ width: w * 2, height: w * 2 }}
                      />
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-white/8" />

                {/* Undo */}
                <button
                  onClick={handleAnnoUndo}
                  disabled={annoShapes.length === 0}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-white/8 transition-colors ${
                    annoShapes.length > 0
                      ? "text-[#737380] hover:text-white hover:border-white/12"
                      : "text-[#4a4a54]/40 pointer-events-none"
                  }`}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              </div>

              {/* Canvas area */}
              <div
                ref={annoContainerRef}
                className="relative rounded-lg overflow-hidden bg-[#0a0a0f] select-none"
                style={{ maxHeight: "60vh" }}
              >
                <img
                  ref={annoImgRef}
                  src={`http://localhost:5000${thumb.imageUrl}`}
                  alt={thumb.title}
                  crossOrigin="anonymous"
                  className="w-full object-contain invisible absolute"
                  draggable={false}
                  onLoad={(e) => {
                    const canvas = annoCanvasRef.current;
                    if (!canvas) return;
                    canvas.width = e.target.naturalWidth;
                    canvas.height = e.target.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(e.target, 0, 0, canvas.width, canvas.height);
                  }}
                />
                <canvas
                  ref={annoCanvasRef}
                  className="w-full cursor-crosshair"
                  style={{ display: "block" }}
                  onMouseDown={handleAnnoMouseDown}
                  onMouseMove={handleAnnoMouseMove}
                  onMouseUp={handleAnnoMouseUp}
                  onMouseLeave={handleAnnoMouseUp}
                />
                {/* Text input overlay */}
                {annoText.active && (
                  <div
                    className="absolute"
                    style={{
                      left: `${(annoText.x / (annoCanvasRef.current?.width || 1)) * 100}%`,
                      top: `${(annoText.y / (annoCanvasRef.current?.height || 1)) * 100}%`,
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={annoText.value}
                      onChange={(e) => setAnnoText((t) => ({ ...t, value: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAnnoTextSubmit();
                        if (e.key === "Escape") setAnnoText({ active: false, x: 0, y: 0, value: "" });
                      }}
                      onBlur={handleAnnoTextSubmit}
                      className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-[14px] outline-none min-w-[120px]"
                      style={{ color: annoColor }}
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4">
                <span className="text-[12px] text-[#737380]">
                  {annoShapes.length} annotation{annoShapes.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAnnotateOpen(false)}
                    className="h-8 text-[12px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAnnoDownload}
                    className="h-8 text-[12px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
                  >
                    <Download className="w-3 h-3" />
                    Download Annotated
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Crop modal */}
      <AnimatePresence>
        {cropOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setCropOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-3xl rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-[15px] font-semibold text-white flex items-center gap-2">
                  <Crop className="w-4 h-4 text-[#737380]" />
                  Crop & Resize
                </h2>
                <button
                  onClick={() => setCropOpen(false)}
                  className="text-[#4a4a54] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                {cropPresets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      const img = cropImgRef.current;
                      if (img) applyCropPreset(p, img.naturalWidth, img.naturalHeight);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      cropPreset?.label === p.label
                        ? "bg-white text-[#0a0a0f]"
                        : "text-[#737380] border border-white/8 hover:text-white hover:border-white/12"
                    }`}
                  >
                    {p.label}
                    {p.w > 0 && (
                      <span className="text-[10px] opacity-60 ml-1">
                        {p.w}×{p.h}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Crop area */}
              <div
                ref={cropContainerRef}
                className="relative rounded-lg overflow-hidden bg-[#0a0a0f] select-none"
                style={{ maxHeight: "60vh" }}
              >
                <img
                  ref={cropImgRef}
                  src={`http://localhost:5000${thumb.imageUrl}`}
                  alt={thumb.title}
                  crossOrigin="anonymous"
                  className="w-full object-contain"
                  draggable={false}
                  onLoad={(e) => {
                    if (!cropPreset) {
                      setCropArea({ x: 5, y: 5, w: 90, h: 90 });
                    }
                  }}
                />
                {/* Darkened overlay outside crop */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top */}
                  <div
                    className="absolute bg-black/60"
                    style={{ top: 0, left: 0, right: 0, height: `${cropArea.y}%` }}
                  />
                  {/* Bottom */}
                  <div
                    className="absolute bg-black/60"
                    style={{ bottom: 0, left: 0, right: 0, height: `${100 - cropArea.y - cropArea.h}%` }}
                  />
                  {/* Left */}
                  <div
                    className="absolute bg-black/60"
                    style={{ top: `${cropArea.y}%`, left: 0, width: `${cropArea.x}%`, height: `${cropArea.h}%` }}
                  />
                  {/* Right */}
                  <div
                    className="absolute bg-black/60"
                    style={{ top: `${cropArea.y}%`, right: 0, width: `${100 - cropArea.x - cropArea.w}%`, height: `${cropArea.h}%` }}
                  />
                </div>
                {/* Crop selection */}
                <div
                  className="absolute border-2 border-white/80 cursor-move"
                  style={{
                    left: `${cropArea.x}%`,
                    top: `${cropArea.y}%`,
                    width: `${cropArea.w}%`,
                    height: `${cropArea.h}%`,
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e, "move")}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                    <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                    <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                    <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
                  </div>
                  {/* Corner handles */}
                  {["tl", "tr", "bl", "br"].map((pos) => (
                    <div
                      key={pos}
                      className="absolute w-3 h-3 bg-white rounded-sm shadow-md"
                      style={{
                        top: pos.includes("t") ? -6 : "auto",
                        bottom: pos.includes("b") ? -6 : "auto",
                        left: pos.includes("l") ? -6 : "auto",
                        right: pos.includes("r") ? -6 : "auto",
                        cursor: pos === "tl" || pos === "br" ? "nwse-resize" : "nesw-resize",
                      }}
                      onMouseDown={(e) => {
                        const type = pos.replace("t", "t").replace("b", "b").replace("l", "l").replace("r", "r");
                        handleCropMouseDown(e, type);
                      }}
                    />
                  ))}
                  {/* Edge handles */}
                  {["t", "b", "l", "r"].map((pos) => (
                    <div
                      key={pos}
                      className="absolute bg-white/80 rounded-sm"
                      style={{
                        ...(pos === "t" ? { top: -2, left: "50%", transform: "translateX(-50%)", width: 24, height: 3, cursor: "ns-resize" } : {}),
                        ...(pos === "b" ? { bottom: -2, left: "50%", transform: "translateX(-50%)", width: 24, height: 3, cursor: "ns-resize" } : {}),
                        ...(pos === "l" ? { left: -2, top: "50%", transform: "translateY(-50%)", width: 3, height: 24, cursor: "ew-resize" } : {}),
                        ...(pos === "r" ? { right: -2, top: "50%", transform: "translateY(-50%)", width: 3, height: 24, cursor: "ew-resize" } : {}),
                      }}
                      onMouseDown={(e) => handleCropMouseDown(e, pos)}
                    />
                  ))}
                </div>
              </div>

              {/* Dimensions info + download */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-[12px] text-[#737380]">
                  {cropImgRef.current && (
                    <>
                      {Math.round((cropArea.w / 100) * cropImgRef.current.naturalWidth)} × {Math.round((cropArea.h / 100) * cropImgRef.current.naturalHeight)} px
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCropOpen(false)}
                    className="h-8 text-[12px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCropDownload}
                    className="h-8 text-[12px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
                  >
                    <Download className="w-3 h-3" />
                    Download Cropped
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
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
