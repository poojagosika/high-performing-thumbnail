import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Search,
  Loader2,
  Check,
  Eye,
  TrendingUp,
  AlertTriangle,
  FlaskConical,
  ExternalLink,
  Upload,
  Download,
  RotateCcw,
  History,
  Trash2,
  Plus,
  Layout,
  Image,
  Type,
  X,
  ChevronDown,
  Move,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import { useToast } from "../context/ToastContext";
import api, { uploadFile } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const compact = (n) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const isFixture = (url) => !url || url.startsWith("fixture://");

const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

const ago = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

const stageOf = (p) => {
  if (p.composedUrl) return "composed";
  if (p.hasGraded) return "graded";
  if (p.hasUpload) return "matched";
  if (p.chosenVideoId) return "reference picked";
  return "not started";
};

function Research() {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [entry, setEntry] = useState({ id: null, project: null, notFound: false });
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [history, setHistory] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [historyTick, setHistoryTick] = useState(0);

  const [catalog, setCatalog] = useState({ templates: [], fonts: [] });
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [slotUploading, setSlotUploading] = useState({});
  const [slotEditing, setSlotEditing] = useState({});
  const [clearing, setClearing] = useState(false);
  const slotFileRefs = useRef({});
  const editTimers = useRef({});
  const previewRef = useRef(null);

  const openId = id || null;
  const project = entry.id === openId ? entry.project : null;
  const notFound = entry.id === openId && entry.notFound;
  const loadingProject = Boolean(openId) && entry.id !== openId;

  const applyProject = (data) =>
    setEntry({ id: String(data.id), project: data, notFound: false });

  const refreshHistory = () => setHistoryTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    api("/projects/templates")
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/projects")
      .then((rows) => { if (!cancelled) setHistory(rows); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [historyTick]);

  useEffect(() => {
    if (!id || entry.id === id) return;
    let cancelled = false;
    api(`/projects/${id}`)
      .then((data) => {
        if (cancelled) return;
        setEntry({ id: String(data.id), project: data, notFound: false });
        setTitle(data.title || "");
        setTags((data.tags || []).join(", "));
        setDescription(data.description || "");
      })
      .catch(() => {
        if (!cancelled) setEntry({ id, project: null, notFound: true });
      });
    return () => { cancelled = true; };
  }, [id, entry.id]);

  const activeTemplate = catalog.templates.find((t) => t.id === project?.templateId) || null;

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("A title is required — it is what we search YouTube for");
      return;
    }
    setSearching(true);
    try {
      const data = await api("/projects", {
        method: "POST",
        body: {
          title: title.trim(),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          description: description.trim(),
        },
      });
      applyProject(data.project);
      refreshHistory();
      navigate(`/research/${data.project.id}`, { replace: true });
      if (data.project.candidates.length === 0)
        toast.info("No videos matched that topic. Try broader wording.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleChoose = async (videoId) => {
    setChoosing(videoId);
    try {
      const updated = await api(`/projects/${project.id}/reference`, {
        method: "PATCH",
        body: { videoId },
      });
      applyProject(updated);
      refreshHistory();
      toast.success(updated.composedUrl ? "Reference selected — thumbnail composed" : "Reference selected");
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChoosing(null);
    }
  };

  const handleTemplateChange = async (templateId) => {
    if (templateId === project?.templateId) return;
    setChangingTemplate(true);
    try {
      applyProject(await api(`/projects/${project.id}/template`, {
        method: "PATCH",
        body: { templateId },
      }));
      refreshHistory();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingTemplate(false);
    }
  };

  const handleSlotUpload = async (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    setSlotUploading((prev) => ({ ...prev, [key]: true }));
    try {
      applyProject(await uploadFile(`/projects/${project.id}/slots/${key}`, form));
      refreshHistory();
      toast.success("Uploaded");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSlotUploading((prev) => ({ ...prev, [key]: false }));
      if (slotFileRefs.current[key]) slotFileRefs.current[key].value = "";
    }
  };

  const handleSlotEdit = useCallback((key, fields) => {
    if (editTimers.current[key]) clearTimeout(editTimers.current[key]);
    editTimers.current[key] = setTimeout(async () => {
      setSlotEditing((prev) => ({ ...prev, [key]: true }));
      try {
        applyProject(await api(`/projects/${project.id}/slots/${key}`, {
          method: "PATCH",
          body: fields,
        }));
      } catch (err) {
        toast.error(err.message);
      } finally {
        setSlotEditing((prev) => ({ ...prev, [key]: false }));
      }
    }, 400);
  }, [project?.id, toast]);

  const handleSlotEditImmediate = async (key, fields) => {
    if (editTimers.current[key]) clearTimeout(editTimers.current[key]);
    setSlotEditing((prev) => ({ ...prev, [key]: true }));
    try {
      applyProject(await api(`/projects/${project.id}/slots/${key}`, {
        method: "PATCH",
        body: fields,
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSlotEditing((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSlotClear = async (key) => {
    setSlotUploading((prev) => ({ ...prev, [key]: true }));
    try {
      applyProject(await api(`/projects/${project.id}/slots/${key}`, { method: "DELETE" }));
      refreshHistory();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSlotUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleClearAll = async () => {
    if (!activeTemplate) return;
    setClearing(true);
    try {
      for (const slot of activeTemplate.slots) {
        await api(`/projects/${project.id}/slots/${slot.key}`, { method: "DELETE" });
      }
      const updated = await api(`/projects/${project.id}`);
      applyProject(updated);
      refreshHistory();
      toast.success("All slots cleared");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClearing(false);
    }
  };

  const handleDelete = async (projectId) => {
    setDeleting(projectId);
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((p) => String(p.id) !== String(projectId)));
      toast.success("Topic deleted");
      if (String(projectId) === String(id)) navigate("/research");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleNew = () => {
    setTitle("");
    setTags("");
    setDescription("");
    setError("");
    setEntry({ id: null, project: null, notFound: false });
    navigate("/research");
  };

  const chosen = project?.candidates?.find((c) => c.videoId === project.chosenVideoId);

  return (
    <div className="min-h-screen">
      <DashboardNav />

      <main id="main" className="max-w-5xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
          className="mb-8 flex items-start justify-between gap-4"
        >
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
              Find your reference
            </h1>
            <p className="text-[14px] text-[#7b7b88] mt-1">
              Describe your video. We pull the thumbnails already winning on that
              topic, ranked by total views.
            </p>
          </div>
          {id && (
            <Button
              onClick={handleNew}
              variant="outline"
              className="h-8 shrink-0 text-[12px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Plus className="w-3 h-3" />
              New topic
            </Button>
          )}
        </motion.div>

        <motion.form
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-8"
        >
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="rt" className="block text-[12px] text-[#7b7b88] mb-1.5">
                Video title
              </label>
              <input
                id="rt"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="chicken nuggets eating challenge"
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="rg" className="block text-[12px] text-[#7b7b88] mb-1.5">
                Tags <span className="text-[#61616b]">(comma separated)</span>
              </label>
              <input
                id="rg"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="food, challenge, mukbang"
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="rd" className="block text-[12px] text-[#7b7b88] mb-1.5">
                Description <span className="text-[#61616b]">(optional)</span>
              </label>
              <textarea
                id="rd"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happens in the video?"
                className="w-full px-3 py-2 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-red-400 mt-3">{error}</p>
          )}

          <div className="flex justify-end mt-4">
            <Button
              type="submit"
              disabled={searching}
              className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              {searching ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
              Find top thumbnails
            </Button>
          </div>
        </motion.form>

        {loadingProject && (
          <div className="rounded-xl border border-white/6 bg-[#111118] p-8 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#7b7b88]" />
            <span className="text-[13px] text-[#7b7b88]">Loading your topic</span>
          </div>
        )}

        {notFound && !loadingProject && (
          <div className="rounded-xl border border-white/6 bg-[#111118] p-8 text-center">
            <AlertTriangle className="w-4 h-4 text-[#7b7b88] mx-auto mb-2" />
            <p className="text-[13px] text-white">That topic is not available</p>
            <p className="text-[12px] text-[#7b7b88] mt-1">
              It was deleted, or it belongs to another account.
            </p>
            <Button
              onClick={handleNew}
              variant="outline"
              className="h-8 mt-4 text-[12px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Start a new topic
            </Button>
          </div>
        )}

        {project && !loadingProject && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
          >
            {project.source === "fixture" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2.5 mb-5">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-200/90">
                  Sample data — no YouTube API key is configured, so these are
                  placeholders, not real videos. Set{" "}
                  <span className="font-mono">YOUTUBE_API_KEY</span> to search
                  for real.
                </p>
              </div>
            )}

            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[14px] font-medium text-white">
                Top {project.candidates.length} for &ldquo;{project.searchQuery}&rdquo;
              </h2>
              <span className="text-[12px] text-[#61616b]">
                ranked by total views
              </span>
            </div>

            {project.candidates.length === 0 ? (
              <div className="rounded-xl border border-white/6 bg-[#111118] p-8 text-center">
                <AlertTriangle className="w-4 h-4 text-[#7b7b88] mx-auto mb-2" />
                <p className="text-[13px] text-[#7b7b88]">
                  Nothing matched that topic. Try broader wording.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {project.candidates.map((c, i) => {
                  const isChosen = project.chosenVideoId === c.videoId;
                  return (
                    <div
                      key={c.videoId}
                      className={`rounded-xl border overflow-hidden transition-colors ${
                        isChosen
                          ? "border-white/40 bg-white/6"
                          : "border-white/6 bg-[#111118]"
                      }`}
                    >
                      <div className="relative aspect-video bg-white/4">
                        {isFixture(c.thumbnailUrl) ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[11px] text-[#61616b]">
                              sample thumbnail
                            </span>
                          </div>
                        ) : (
                          <img
                            src={c.thumbnailUrl}
                            alt={c.title}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute top-2 left-2 h-5 min-w-5 px-1.5 rounded bg-black/70 text-[11px] font-medium text-white inline-flex items-center justify-center">
                          #{i + 1}
                        </span>
                        {isChosen && (
                          <span className="absolute top-2 right-2 h-5 px-1.5 rounded bg-white text-[11px] font-medium text-[#0a0a0f] inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Reference
                          </span>
                        )}
                      </div>

                      <div className="p-3">
                        <p className="text-[13px] text-white line-clamp-2 leading-snug">
                          {c.title}
                        </p>
                        <p className="text-[12px] text-[#61616b] mt-1 truncate">
                          {c.channelTitle}
                        </p>

                        <a
                          href={watchUrl(c.videoId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[#7b7b88] hover:text-white transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Watch on YouTube
                        </a>

                        <div className="flex items-center gap-3 mt-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#7b7b88]">
                            <Eye className="w-3 h-3" />
                            {compact(c.viewCount)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <TrendingUp className="w-3 h-3" />
                            {compact(c.viewsPerDay)}/day
                          </span>
                        </div>

                        <Button
                          onClick={() => handleChoose(c.videoId)}
                          disabled={choosing === c.videoId || isChosen}
                          variant={isChosen ? "outline" : "default"}
                          className={`w-full h-8 mt-3 text-[12px] font-medium gap-1.5 ${
                            isChosen
                              ? "border-white/8 text-[#7b7b88] bg-transparent"
                              : "bg-white text-[#0a0a0f] hover:bg-white/90"
                          }`}
                        >
                          {choosing === c.videoId && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {choosing === c.videoId ? "Composing…" : isChosen ? "Selected" : "Use as reference"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {project.chosenVideoId && (
              <div className="mt-8 space-y-5">
                <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[14px] font-medium text-white flex items-center gap-1.5">
                      <Layout className="w-3.5 h-3.5 text-[#7b7b88]" />
                      Template
                    </h2>
                    {changingTemplate && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7b7b88]" />}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {catalog.templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTemplateChange(t.id)}
                        disabled={changingTemplate}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          project.templateId === t.id
                            ? "border-white/40 bg-white/8"
                            : "border-white/6 bg-white/2 hover:bg-white/4 hover:border-white/12"
                        }`}
                      >
                        <p className="text-[12px] font-medium text-white truncate">{t.name}</p>
                        <p className="text-[10px] text-[#61616b] mt-0.5">
                          {t.slots.length} slot{t.slots.length !== 1 ? "s" : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {activeTemplate && (
                  <>
                    <div ref={previewRef} className="rounded-xl border border-white/6 bg-[#111118] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h2 className="text-[14px] font-medium text-white">Preview</h2>
                          {chosen && !isFixture(chosen.thumbnailUrl) && (
                            <span className="text-[11px] text-[#61616b]">
                              matching #{project.candidates.findIndex((c) => c.videoId === project.chosenVideoId) + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {project.composedUrl && (
                            <a href={assetUrl(project.composedUrl)} download>
                              <Button
                                variant="outline"
                                className="h-7 text-[11px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] text-[#61616b] mb-1.5">Reference</p>
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-white/4 border border-white/6">
                            {isFixture(chosen?.thumbnailUrl) ? (
                              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#61616b]">
                                sample thumbnail
                              </div>
                            ) : (
                              <img
                                src={chosen?.thumbnailUrl}
                                alt={chosen?.title}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-[#61616b] mb-1.5">Composed</p>
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-white/4 border border-white/6">
                            {project.composedUrl ? (
                              <img
                                key={project.composedUrl}
                                src={assetUrl(project.composedUrl)}
                                alt="Composed thumbnail"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#61616b]">
                                no preview yet
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/6 bg-[#111118] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[14px] font-medium text-white">Slots</h2>
                        <Button
                          onClick={handleClearAll}
                          disabled={clearing}
                          variant="outline"
                          className="h-7 text-[11px] border-white/8 text-[#7b7b88] hover:text-red-400 hover:border-red-400/20 bg-transparent font-medium gap-1"
                        >
                          {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Clear all
                        </Button>
                      </div>

                      <div className={`grid gap-4 ${activeTemplate.slots.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
                        {activeTemplate.slots.map((slot) => (
                          <div
                            key={slot.key}
                            className="rounded-lg border border-white/6 bg-white/2 p-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                {slot.type === "image" ? (
                                  <Image className="w-3 h-3 text-[#7b7b88]" />
                                ) : (
                                  <Type className="w-3 h-3 text-[#7b7b88]" />
                                )}
                                <span className="text-[12px] font-medium text-white">{slot.label}</span>
                                {slot.cutout && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                    cutout
                                  </span>
                                )}
                              </div>
                              {slotEditing[slot.key] && (
                                <Loader2 className="w-3 h-3 animate-spin text-[#61616b]" />
                              )}
                            </div>

                            {slot.type === "image" ? (
                              <div>
                                <div className="relative aspect-video rounded-md overflow-hidden bg-white/4 border border-white/6 mb-2">
                                  {project.slots?.[slot.key]?.url ? (
                                    <>
                                      <img
                                        src={assetUrl(project.slots[slot.key].url)}
                                        alt={slot.label}
                                        className="absolute inset-0 w-full h-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSlotClear(slot.key)}
                                        disabled={slotUploading[slot.key]}
                                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-colors"
                                      >
                                        {slotUploading[slot.key] ? (
                                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        ) : (
                                          <X className="w-2.5 h-2.5" />
                                        )}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => slotFileRefs.current[slot.key]?.click()}
                                      disabled={slotUploading[slot.key]}
                                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#7b7b88] hover:text-white hover:bg-white/4 transition-colors"
                                    >
                                      {slotUploading[slot.key] ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                      )}
                                      <span className="text-[11px]">Upload</span>
                                    </button>
                                  )}
                                </div>

                                <input
                                  ref={(el) => { slotFileRefs.current[slot.key] = el; }}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => handleSlotUpload(slot.key, e)}
                                  className="hidden"
                                />

                                {project.slots?.[slot.key]?.url && (
                                  <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[10px] text-[#61616b]">
                                      <ZoomIn className="w-2.5 h-2.5" />
                                      zoom
                                      <input
                                        type="range"
                                        min="0.5"
                                        max="3"
                                        step="0.05"
                                        defaultValue={project.slotOverrides?.[slot.key]?.zoom ?? slot.defaults?.zoom ?? 1}
                                        onChange={(e) => handleSlotEdit(slot.key, { zoom: Number(e.target.value) })}
                                        className="flex-1 accent-white h-1"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-[#61616b]">
                                      <Move className="w-2.5 h-2.5" />
                                      x
                                      <input
                                        type="range"
                                        min="-1"
                                        max="1"
                                        step="0.05"
                                        defaultValue={project.slotOverrides?.[slot.key]?.dx ?? 0}
                                        onChange={(e) => handleSlotEdit(slot.key, { dx: Number(e.target.value) })}
                                        className="flex-1 accent-white h-1"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-[#61616b]">
                                      <Move className="w-2.5 h-2.5" />
                                      y
                                      <input
                                        type="range"
                                        min="-1"
                                        max="1"
                                        step="0.05"
                                        defaultValue={project.slotOverrides?.[slot.key]?.dy ?? 0}
                                        onChange={(e) => handleSlotEdit(slot.key, { dy: Number(e.target.value) })}
                                        className="flex-1 accent-white h-1"
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <input
                                  value={project.slotOverrides?.[slot.key]?.text ?? slot.defaults?.text ?? ""}
                                  onChange={(e) => handleSlotEdit(slot.key, { text: e.target.value })}
                                  maxLength={120}
                                  placeholder="YOUR HEADLINE"
                                  className="w-full h-8 px-2.5 rounded-md border border-white/8 bg-white/3 text-[12px] text-white placeholder:text-[#61616b] outline-none focus:border-white/16 transition-colors"
                                />

                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex rounded-md border border-white/8 overflow-hidden">
                                    {["top", "middle", "bottom"].map((pos) => (
                                      <button
                                        key={pos}
                                        type="button"
                                        onClick={() => handleSlotEditImmediate(slot.key, { band: pos })}
                                        className={`px-2 h-6 text-[10px] transition-colors ${
                                          (project.slotOverrides?.[slot.key]?.band ?? slot.defaults?.band ?? "top") === pos
                                            ? "bg-white/10 text-white"
                                            : "text-[#7b7b88] hover:text-white"
                                        }`}
                                      >
                                        {pos}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="flex rounded-md border border-white/8 overflow-hidden">
                                    {["left", "center"].map((align) => (
                                      <button
                                        key={align}
                                        type="button"
                                        onClick={() => handleSlotEditImmediate(slot.key, { align })}
                                        className={`px-2 h-6 text-[10px] transition-colors ${
                                          (project.slotOverrides?.[slot.key]?.align ?? "left") === align
                                            ? "bg-white/10 text-white"
                                            : "text-[#7b7b88] hover:text-white"
                                        }`}
                                      >
                                        {align}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="relative">
                                    <select
                                      value={project.slotOverrides?.[slot.key]?.font ?? slot.defaults?.font ?? "intertight"}
                                      onChange={(e) => handleSlotEditImmediate(slot.key, { font: e.target.value })}
                                      className="h-6 pl-2 pr-5 rounded-md border border-white/8 bg-white/3 text-[10px] text-white outline-none appearance-none cursor-pointer"
                                    >
                                      {catalog.fonts.map((f) => (
                                        <option key={f.key} value={f.key}>{f.label}</option>
                                      ))}
                                    </select>
                                    <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#61616b] pointer-events-none" />
                                  </div>

                                  <label className="flex items-center gap-1 text-[10px] text-[#61616b]">
                                    size
                                    <input
                                      type="range"
                                      min="0.04"
                                      max="0.42"
                                      step="0.01"
                                      defaultValue={project.slotOverrides?.[slot.key]?.scale ?? slot.defaults?.scale ?? 0.16}
                                      onChange={(e) => handleSlotEdit(slot.key, { scale: Number(e.target.value) })}
                                      className="w-16 accent-white h-1"
                                    />
                                  </label>

                                  <div className="flex gap-1">
                                    {["#FFFFFF", "#12121A", "#FF3B30", "#FFDD00"].map((hex) => (
                                      <button
                                        key={hex}
                                        type="button"
                                        onClick={() => handleSlotEditImmediate(slot.key, { color: hex })}
                                        style={{ background: hex }}
                                        className={`w-5 h-5 rounded border transition-colors ${
                                          (project.slotOverrides?.[slot.key]?.color ?? slot.defaults?.color ?? "#FFFFFF") === hex
                                            ? "border-white"
                                            : "border-white/15"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}

        {history.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(3)}
            className="mt-10"
          >
            <div className="flex items-center gap-1.5 mb-3">
              <History className="w-3.5 h-3.5 text-[#7b7b88]" />
              <h2 className="text-[14px] font-medium text-white">Your topics</h2>
              <span className="text-[12px] text-[#61616b]">
                already searched, free to reopen
              </span>
            </div>

            <div className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden">
              {history.map((p, i) => {
                const open = String(p.id) === String(id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                      i > 0 ? "border-t border-white/6" : ""
                    } ${open ? "bg-white/6" : "hover:bg-white/3"}`}
                  >
                    <div className="relative w-16 aspect-video rounded shrink-0 overflow-hidden bg-white/4">
                      {isFixture(p.previewUrl) ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[#61616b]">
                          sample
                        </div>
                      ) : (
                        <img
                          src={p.previewUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <Link to={`/research/${p.id}`} className="min-w-0 flex-1">
                      <p className="text-[13px] text-white truncate">{p.title}</p>
                      <p className="text-[11px] text-[#61616b] mt-0.5 truncate">
                        {p.candidateCount} thumbnails · {stageOf(p)} · {ago(p.createdAt)}
                      </p>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      aria-label={`Delete ${p.title}`}
                      className="shrink-0 p-1.5 rounded text-[#61616b] hover:text-red-400 hover:bg-white/4 transition-colors"
                    >
                      {deleting === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-[#61616b] mt-2">
              Reopening a topic costs no YouTube quota — the results are already saved.
            </p>
          </motion.section>
        )}
      </main>
    </div>
  );
}

export default Research;
