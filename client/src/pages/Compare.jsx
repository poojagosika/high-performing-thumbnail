import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  MousePointerClick,
  Layout,
  Palette,
  Type,
  Heart,
  Trophy,
  Columns2,
  Layers,
  Save,
  History,
  Trash2,
  StickyNote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import { useToast } from "../context/ToastContext";
import api from "../lib/api";
import { assetUrl } from "../lib/assetUrl";
import { useDialog } from "../hooks/useDialog";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const analysisItems = [
  { key: "composition", label: "Composition", Icon: Layout },
  { key: "colorBalance", label: "Color Balance", Icon: Palette },
  { key: "textReadability", label: "Text Readability", Icon: Type },
  { key: "emotionalImpact", label: "Emotional Impact", Icon: Heart },
];

function StatCard({ label, Icon, valueA, valueB, suffix = "" }) {
  const a = valueA != null ? valueA : null;
  const b = valueB != null ? valueB : null;
  const aWins = a != null && b != null && a > b;
  const bWins = a != null && b != null && b > a;

  return (
    <div className="rounded-xl border border-white/6 bg-[#111118] p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-[#7b7b88]" />
        <span className="text-[12px] text-[#7b7b88]">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <span
            className={`font-heading text-xl font-semibold ${aWins ? "text-emerald-400" : "text-white"}`}
          >
            {a != null ? `${a}${suffix}` : "—"}
          </span>
        </div>
        <div className="text-center">
          <span
            className={`font-heading text-xl font-semibold ${bWins ? "text-emerald-400" : "text-white"}`}
          >
            {b != null ? `${b}${suffix}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalysisRow({ label, Icon, valueA, valueB }) {
  const a = valueA != null ? valueA : null;
  const b = valueB != null ? valueB : null;
  const aWins = a != null && b != null && a > b;
  const bWins = a != null && b != null && b > a;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3 h-3 text-[#61616b]" />
        <span className="text-[12px] text-[#7b7b88]">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span
              className={`text-[12px] font-medium ${aWins ? "text-emerald-400" : "text-white"}`}
            >
              {a != null ? a : "—"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${aWins ? "bg-emerald-400/40" : "bg-white/20"}`}
              style={{ width: `${a ?? 0}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span
              className={`text-[12px] font-medium ${bWins ? "text-emerald-400" : "text-white"}`}
            >
              {b != null ? b : "—"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${bWins ? "bg-emerald-400/40" : "bg-white/20"}`}
              style={{ width: `${b ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Compare() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [thumbs, setThumbs] = useState([]);
  const [thumbA, setThumbA] = useState(null);
  const [thumbB, setThumbB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState("side");
  const [sliderPos, setSliderPos] = useState(50);
  const [comparisonNotes, setComparisonNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const historyDialog = useDialog(historyOpen, () => setHistoryOpen(false), {
    labelledBy: "compare-history-title",
  });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const sliderContainerRef = useRef(null);
  const draggingRef = useRef(false);

  const handleSliderMove = useCallback((clientX) => {
    const rect = sliderContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (draggingRef.current) handleSliderMove(e.clientX);
    };
    const onMouseUp = () => { draggingRef.current = false; };
    const onTouchMove = (e) => {
      if (draggingRef.current) handleSliderMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleSliderMove]);

  const idA = searchParams.get("a");
  const idB = searchParams.get("b");
  const multiIds = searchParams.getAll("ids");
  const isMulti = multiIds.length > 2;

  useEffect(() => {
    if (multiIds.length >= 2) {
      Promise.all(multiIds.map((mid) => api(`/thumbnails/${mid}`)))
        .then((results) => {
          setThumbs(results);
          setThumbA(results[0]);
          setThumbB(results[1]);
        })
        .catch(() => navigate("/dashboard"))
        .finally(() => setLoading(false));
    } else if (idA && idB) {
      Promise.all([api(`/thumbnails/${idA}`), api(`/thumbnails/${idB}`)])
        .then(([a, b]) => {
          setThumbA(a);
          setThumbB(b);
          setThumbs([a, b]);
        })
        .catch(() => navigate("/dashboard"))
        .finally(() => setLoading(false));
    } else {
      navigate("/dashboard");
    }
  }, [idA, idB, navigate]);

  const handleSaveComparison = async () => {
    setSaving(true);
    try {
      await api("/comparisons", {
        method: "POST",
        body: {
          thumbnailA: idA,
          thumbnailB: idB,
          winner: winner || null,
          notes: comparisonNotes,
        },
      });
      toast.success("Comparison saved");
    } catch {
      toast.error("Failed to save comparison");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api("/comparisons");
      setHistory(data);
    } catch {
      toast.error("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteComparison = async (compId) => {
    try {
      await api(`/comparisons/${compId}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((c) => c._id !== compId));
      toast.success("Comparison removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const relativeTime = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <DashboardNav />
        <main id="main" className="max-w-5xl mx-auto px-6 py-10">
          <div className="h-4 w-32 rounded bg-white/4 animate-pulse mb-6" />
          <div className="mb-8 space-y-2">
            <div className="h-6 w-40 rounded bg-white/4 animate-pulse" />
            <div className="h-4 w-64 rounded bg-white/4 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden">
                  <div className="aspect-video bg-white/4 animate-pulse" />
                </div>
                <div className="h-4 w-2/3 rounded bg-white/4 animate-pulse mt-3" />
                <div className="flex gap-1.5 mt-1.5">
                  <div className="h-5 w-14 rounded-full bg-white/4 animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-white/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-white/6 bg-[#111118] p-4 space-y-3"
              >
                <div className="h-3 w-12 rounded bg-white/4 animate-pulse" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-6 w-16 mx-auto rounded bg-white/4 animate-pulse" />
                  <div className="h-6 w-16 mx-auto rounded bg-white/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/6 bg-[#111118] p-5 space-y-4">
            <div className="h-3 w-32 rounded bg-white/4 animate-pulse" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 rounded bg-white/4 animate-pulse" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-1.5 rounded-full bg-white/4 animate-pulse" />
                  <div className="h-1.5 rounded-full bg-white/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!thumbA || !thumbB) return null;

  const scoreA = thumbA.score;
  const scoreB = thumbB.score;
  const winner =
    scoreA != null && scoreB != null
      ? scoreA > scoreB
        ? "A"
        : scoreB > scoreA
          ? "B"
          : "tie"
      : null;

  const hasAnalysis = analysisItems.some(
    (a) => thumbA.analysis?.[a.key] != null || thumbB.analysis?.[a.key] != null,
  );

  return (
    <div className="min-h-screen">
      <DashboardNav />

      <main id="main" className="max-w-5xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#7b7b88] hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="mb-8"
        >
          <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
            {isMulti ? "Multi Compare" : "A/B Compare"}
          </h1>
          <p className="text-[14px] text-[#7b7b88] mt-1">
            {isMulti
              ? `Comparing ${thumbs.length} thumbnails side by side`
              : "Side-by-side comparison of two thumbnails"}
          </p>
        </motion.div>

        {/* Multi-compare grid */}
        {isMulti && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(2)}
              className={`grid gap-4 mb-6 ${thumbs.length <= 3 ? "grid-cols-3" : thumbs.length <= 4 ? "grid-cols-4" : "grid-cols-3"}`}
            >
              {thumbs.map((t, i) => {
                const bestScore = Math.max(...thumbs.map((th) => th.score ?? -1));
                const isBest = t.score != null && t.score === bestScore && thumbs.filter((th) => th.score === bestScore).length === 1;
                return (
                  <motion.div
                    key={t._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={stagger(i + 2)}
                  >
                    <div className={`rounded-xl border overflow-hidden ${isBest ? "border-emerald-500/30" : "border-white/6"}`}>
                      <div className="relative">
                        <img
                          src={assetUrl(t.imageUrl)}
                          alt={t.title}
                          className="w-full aspect-video object-cover"
                        />
                        {isBest && (
                          <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-500/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                            <Trophy className="w-3 h-3" />
                            Best
                          </div>
                        )}
                      </div>
                    </div>
                    <h3 className="text-[14px] font-medium text-white mt-3 truncate">
                      {t.title}
                    </h3>
                    {t.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {t.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-[#61616b] bg-white/4 rounded-full px-2 py-0.5">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Multi stats table */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(3)}
              className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden mb-6"
            >
              <div className={`grid ${thumbs.length <= 3 ? "grid-cols-[120px_repeat(3,1fr)]" : thumbs.length <= 4 ? "grid-cols-[120px_repeat(4,1fr)]" : "grid-cols-[120px_repeat(5,1fr)]"} gap-px bg-white/4`}>
                {/* Header */}
                <div className="bg-[#111118] p-3 text-[11px] text-[#61616b] uppercase tracking-wider font-medium" />
                {thumbs.map((t) => (
                  <div key={t._id} className="bg-[#111118] p-3 text-[12px] text-white font-medium truncate">
                    {t.title}
                  </div>
                ))}
                {/* Score row */}
                <div className="bg-[#111118] p-3 text-[12px] text-[#7b7b88] flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" />
                  Score
                </div>
                {thumbs.map((t) => {
                  const best = Math.max(...thumbs.map((th) => th.score ?? -1));
                  const isBest = t.score != null && t.score === best && thumbs.filter((th) => th.score === best).length === 1;
                  return (
                    <div key={t._id} className="bg-[#111118] p-3">
                      <span className={`font-heading text-lg font-semibold ${isBest ? "text-emerald-400" : "text-white"}`}>
                        {t.score != null ? t.score : "—"}
                      </span>
                    </div>
                  );
                })}
                {/* CTR row */}
                <div className="bg-[#111118] p-3 text-[12px] text-[#7b7b88] flex items-center gap-1.5">
                  <MousePointerClick className="w-3 h-3" />
                  CTR
                </div>
                {thumbs.map((t) => (
                  <div key={t._id} className="bg-[#111118] p-3">
                    <span className="font-heading text-lg font-semibold text-white">
                      {t.ctr != null ? `${t.ctr}%` : "—"}
                    </span>
                  </div>
                ))}
                {/* Analysis rows */}
                {analysisItems.map(({ key, label, Icon }) => (
                  <>
                    <div key={`label-${key}`} className="bg-[#111118] p-3 text-[12px] text-[#7b7b88] flex items-center gap-1.5">
                      <Icon className="w-3 h-3" />
                      {label}
                    </div>
                    {thumbs.map((t) => {
                      const val = t.analysis?.[key];
                      const best = Math.max(...thumbs.map((th) => th.analysis?.[key] ?? -1));
                      const isBest = val != null && val === best && thumbs.filter((th) => th.analysis?.[key] === best).length === 1;
                      return (
                        <div key={t._id} className="bg-[#111118] p-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium ${isBest ? "text-emerald-400" : "text-white"}`}>
                              {val != null ? val : "—"}
                            </span>
                            {val != null && (
                              <div className="flex-1 h-1 rounded-full bg-white/6 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isBest ? "bg-emerald-400/40" : "bg-white/20"}`}
                                  style={{ width: `${val}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </motion.div>

            {/* Multi verdict */}
            {(() => {
              const scored = thumbs.filter((t) => t.score != null);
              if (scored.length < 2) return null;
              const best = scored.reduce((a, b) => ((a.score ?? 0) > (b.score ?? 0) ? a : b));
              const isTie = scored.filter((t) => t.score === best.score).length > 1;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={stagger(4)}
                  className="rounded-xl border border-white/6 bg-[#111118] p-5 text-center mb-6"
                >
                  <p className="text-[13px] text-[#7b7b88]">Verdict</p>
                  {isTie ? (
                    <p className="font-heading text-lg font-semibold text-white mt-1">It&apos;s a tie</p>
                  ) : (
                    <>
                      <p className="font-heading text-lg font-semibold text-emerald-400 mt-1">{best.title}</p>
                      <p className="text-[12px] text-[#61616b] mt-1">highest score at {best.score}/100</p>
                    </>
                  )}
                </motion.div>
              );
            })()}
          </>
        )}

        {/* Two-thumbnail compare (original) */}
        {!isMulti && (
        <>
        {/* Mode toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="flex items-center gap-2 mb-4"
        >
          <div className="flex items-center rounded-lg border border-white/8 bg-white/3 overflow-hidden">
            <button
              onClick={() => setCompareMode("side")}
              className={`h-8 px-3 flex items-center gap-1.5 text-[12px] transition-colors ${
                compareMode === "side"
                  ? "bg-white/8 text-white"
                  : "text-[#61616b] hover:text-white"
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              Side by Side
            </button>
            <button
              onClick={() => setCompareMode("overlay")}
              className={`h-8 px-3 flex items-center gap-1.5 text-[12px] transition-colors ${
                compareMode === "overlay"
                  ? "bg-white/8 text-white"
                  : "text-[#61616b] hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Overlay
            </button>
          </div>
          {compareMode === "overlay" && (
            <span className="text-[11px] text-[#61616b]">
              Drag the slider to compare
            </span>
          )}
        </motion.div>

        {/* Thumbnail images */}
        {compareMode === "overlay" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="mb-6"
          >
            <div
              ref={sliderContainerRef}
              className="relative rounded-xl border border-white/6 overflow-hidden cursor-col-resize select-none"
              onMouseDown={(e) => {
                draggingRef.current = true;
                handleSliderMove(e.clientX);
              }}
              onTouchStart={(e) => {
                draggingRef.current = true;
                handleSliderMove(e.touches[0].clientX);
              }}
            >
              {/* Image B (full, bottom layer) */}
              <img
                src={assetUrl(thumbB.imageUrl)}
                alt={thumbB.title}
                className="w-full aspect-video object-cover"
                draggable={false}
              />
              {/* Image A (clipped, top layer) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={assetUrl(thumbA.imageUrl)}
                  alt={thumbA.title}
                  className="aspect-video object-cover"
                  style={{ width: sliderContainerRef.current?.offsetWidth || "100%" }}
                  draggable={false}
                />
              </div>
              {/* Slider line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border-2 border-white flex items-center justify-center shadow-lg">
                  <div className="flex items-center gap-0.5">
                    <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-[#0a0a0f]" />
                    <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-[#0a0a0f]" />
                  </div>
                </div>
              </div>
              {/* Labels */}
              <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                {thumbA.title}
              </div>
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                {thumbB.title}
              </div>
              {/* Winner badges */}
              {winner === "A" && (
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-emerald-500/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                  <Trophy className="w-3 h-3" />
                  Winner
                </div>
              )}
              {winner === "B" && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                  <Trophy className="w-3 h-3" />
                  Winner
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
          >
            <div>
              <div
                className={`rounded-xl border overflow-hidden ${winner === "A" ? "border-emerald-500/30" : "border-white/6"}`}
              >
                <div className="relative">
                  <img
                    src={assetUrl(thumbA.imageUrl)}
                    alt={thumbA.title}
                    className="w-full aspect-video object-cover"
                  />
                  {winner === "A" && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-500/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                      <Trophy className="w-3 h-3" />
                      Winner
                    </div>
                  )}
                </div>
              </div>
              <h3 className="text-[14px] font-medium text-white mt-3 truncate">
                {thumbA.title}
              </h3>
              {thumbA.tags?.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {thumbA.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] text-[#61616b] bg-white/4 rounded-full px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div
                className={`rounded-xl border overflow-hidden ${winner === "B" ? "border-emerald-500/30" : "border-white/6"}`}
              >
                <div className="relative">
                  <img
                    src={assetUrl(thumbB.imageUrl)}
                    alt={thumbB.title}
                    className="w-full aspect-video object-cover"
                  />
                  {winner === "B" && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-500/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                      <Trophy className="w-3 h-3" />
                      Winner
                    </div>
                  )}
                </div>
              </div>
              <h3 className="text-[14px] font-medium text-white mt-3 truncate">
                {thumbB.title}
              </h3>
              {thumbB.tags?.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {thumbB.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] text-[#61616b] bg-white/4 rounded-full px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Score & CTR */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
        >
          <StatCard
            label="Score"
            Icon={BarChart3}
            valueA={thumbA.score}
            valueB={thumbB.score}
            suffix="/100"
          />
          <StatCard
            label="CTR"
            Icon={MousePointerClick}
            valueA={thumbA.ctr}
            valueB={thumbB.ctr}
            suffix="%"
          />
        </motion.div>

        {/* Analysis breakdown */}
        {hasAnalysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(4)}
            className="rounded-xl border border-white/6 bg-[#111118] p-5"
          >
            <h3 className="text-[13px] text-[#7b7b88] font-medium mb-4">
              Analysis Breakdown
            </h3>

            {/* Column labels */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <span className="text-[11px] text-[#61616b] font-medium truncate">
                {thumbA.title}
              </span>
              <span className="text-[11px] text-[#61616b] font-medium truncate">
                {thumbB.title}
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {analysisItems.map(({ key, label, Icon }) => (
                <AnalysisRow
                  key={key}
                  label={label}
                  Icon={Icon}
                  valueA={thumbA.analysis?.[key]}
                  valueB={thumbB.analysis?.[key]}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Verdict */}
        {winner && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(5)}
            className="mt-6 rounded-xl border border-white/6 bg-[#111118] p-5 text-center"
          >
            {winner === "tie" ? (
              <>
                <p className="text-[13px] text-[#7b7b88]">Verdict</p>
                <p className="font-heading text-lg font-semibold text-white mt-1">
                  It&apos;s a tie
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-[#7b7b88]">Verdict</p>
                <p className="font-heading text-lg font-semibold text-emerald-400 mt-1">
                  {winner === "A" ? thumbA.title : thumbB.title}
                </p>
                <p className="text-[12px] text-[#61616b] mt-1">
                  scores {Math.abs((scoreA ?? 0) - (scoreB ?? 0))} points higher
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* Notes & Save */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(6)}
          className="mt-6 rounded-xl border border-white/6 bg-[#111118] p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-1.5 text-[13px] text-[#7b7b88] font-medium">
              <StickyNote className="w-3.5 h-3.5" />
              Comparison Notes
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadHistory}
                className="h-8 text-[12px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
              >
                <History className="w-3.5 h-3.5" />
                History
              </Button>
              <Button
                onClick={handleSaveComparison}
                disabled={saving}
                className="h-8 text-[12px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Comparison"}
              </Button>
            </div>
          </div>
          <textarea
            value={comparisonNotes}
            onChange={(e) => setComparisonNotes(e.target.value)}
            placeholder="Add notes about this comparison..."
            rows={2}
            className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors resize-none"
          />
        </motion.div>
        </>
        )}
      </main>

      {/* History panel */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setHistoryOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              {...historyDialog.dialogProps}
              className="relative w-full max-w-2xl max-h-[80vh] rounded-xl border border-white/6 bg-[#111118] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-5 pb-0">
                <h2
                  id="compare-history-title"
                  className="font-heading text-[15px] font-semibold text-white flex items-center gap-2"
                >
                  <History className="w-4 h-4 text-[#7b7b88]" />
                  Comparison History
                </h2>
                <button
                  aria-label="Close"
                  onClick={() => setHistoryOpen(false)}
                  className="text-[#61616b] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                {historyLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-lg border border-white/6 bg-white/2 p-4">
                        <div className="flex gap-3">
                          <div className="w-16 h-10 rounded bg-white/4 animate-pulse" />
                          <div className="w-16 h-10 rounded bg-white/4 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-32 rounded bg-white/4 animate-pulse" />
                            <div className="h-3 w-20 rounded bg-white/4 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-10">
                    <History className="w-8 h-8 text-[#61616b] mx-auto mb-3" />
                    <p className="text-[13px] text-[#7b7b88]">No saved comparisons yet</p>
                    <p className="text-[12px] text-[#61616b] mt-1">
                      Save a comparison to see it here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((comp) => (
                      <div
                        key={comp._id}
                        className="rounded-lg border border-white/6 bg-white/2 hover:bg-white/3 transition-colors p-3"
                      >
                        <div className="flex items-center gap-3">
                          {/* Thumbnail previews */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {comp.thumbnailA ? (
                              <div className={`w-14 h-9 rounded overflow-hidden border ${comp.winner === "A" ? "border-emerald-500/40" : "border-white/6"}`}>
                                <img
                                  src={assetUrl(comp.thumbnailA.imageUrl)}
                                  alt={comp.thumbnailA.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-14 h-9 rounded bg-white/4 flex items-center justify-center text-[9px] text-[#61616b]">
                                Deleted
                              </div>
                            )}
                            <span className="text-[10px] text-[#61616b] font-medium">vs</span>
                            {comp.thumbnailB ? (
                              <div className={`w-14 h-9 rounded overflow-hidden border ${comp.winner === "B" ? "border-emerald-500/40" : "border-white/6"}`}>
                                <img
                                  src={assetUrl(comp.thumbnailB.imageUrl)}
                                  alt={comp.thumbnailB.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-14 h-9 rounded bg-white/4 flex items-center justify-center text-[9px] text-[#61616b]">
                                Deleted
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] text-white truncate">
                                {comp.thumbnailA?.title || "Deleted"}
                              </span>
                              <span className="text-[10px] text-[#61616b]">vs</span>
                              <span className="text-[12px] text-white truncate">
                                {comp.thumbnailB?.title || "Deleted"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {comp.winner && comp.winner !== "tie" && (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                  <Trophy className="w-2.5 h-2.5" />
                                  {comp.winner === "A" ? comp.thumbnailA?.title : comp.thumbnailB?.title}
                                </span>
                              )}
                              {comp.winner === "tie" && (
                                <span className="text-[10px] text-[#7b7b88]">Tie</span>
                              )}
                              <span className="text-[10px] text-[#61616b]">
                                {relativeTime(comp.createdAt)}
                              </span>
                            </div>
                            {comp.notes && (
                              <p className="text-[11px] text-[#7b7b88] mt-1 line-clamp-1">
                                {comp.notes}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {comp.thumbnailA && comp.thumbnailB && (
                              <button
                                onClick={() => {
                                  navigate(`/compare?a=${comp.thumbnailA._id}&b=${comp.thumbnailB._id}`);
                                  setHistoryOpen(false);
                                }}
                                className="h-7 px-2.5 rounded-lg border border-white/8 text-[11px] text-[#7b7b88] hover:text-white hover:border-white/12 transition-colors"
                              >
                                View
                              </button>
                            )}
                            <button
                              aria-label="Delete comparison"
                              onClick={() => deleteComparison(comp._id)}
                              className="h-7 w-7 rounded-lg border border-white/8 flex items-center justify-center text-[#61616b] hover:text-red-400 hover:border-red-500/20 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Compare;
