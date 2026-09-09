import { useState, useRef, useEffect } from "react";
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
  Wand2,
  Download,
  RotateCcw,
  History,
  Trash2,
  Plus,
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

const scoreTone = (score) =>
  score >= 80 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-red-400";

const severityTone = (severity) =>
  severity === "high" ? "text-red-400" : severity === "medium" ? "text-amber-400" : "text-emerald-400";

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
  const [uploading, setUploading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [history, setHistory] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [historyTick, setHistoryTick] = useState(0);
  const fileRef = useRef(null);

  const openId = id || null;
  const project = entry.id === openId ? entry.project : null;
  const notFound = entry.id === openId && entry.notFound;
  const loadingProject = Boolean(openId) && entry.id !== openId;

  const applyProject = (data) =>
    setEntry({ id: String(data.id), project: data, notFound: false });

  const refreshHistory = () => setHistoryTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    api("/projects")
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });

    return () => {
      cancelled = true;
    };
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

    return () => {
      cancelled = true;
    };
  }, [id, entry.id]);

  const chosen = project?.candidates?.find((c) => c.videoId === project.chosenVideoId);
  const report = project?.gradedReport || project?.matchReport;
  const best = project?.matchReports?.[0] || null;

  const candidateRank = (videoId) =>
    (project?.candidates?.findIndex((c) => c.videoId === videoId) ?? -1) + 1;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("image", file);

    setUploading(true);
    try {
      applyProject(await uploadFile(`/projects/${project.id}/upload`, form));
      refreshHistory();
      toast.success("Measured against your reference");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleGrade = async () => {
    setGrading(true);
    try {
      applyProject(await api(`/projects/${project.id}/grade`, { method: "POST" }));
      refreshHistory();
      toast.success("Colour graded toward the reference");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGrading(false);
    }
  };

  const handleClear = async () => {
    try {
      applyProject(await api(`/projects/${project.id}/upload`, { method: "DELETE" }));
      refreshHistory();
    } catch (err) {
      toast.error(err.message);
    }
  };

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
      if (data.project.candidates.length === 0) {
        toast.info("No videos matched that topic. Try broader wording.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
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

  const handleChoose = async (videoId) => {
    setChoosing(videoId);
    try {
      const updated = await api(`/projects/${project.id}/reference`, {
        method: "PATCH",
        body: { videoId },
      });
      applyProject(updated);
      refreshHistory();
      toast.success("Reference selected");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChoosing(null);
    }
  };

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
                  const chosen = project.chosenVideoId === c.videoId;
                  return (
                    <div
                      key={c.videoId}
                      className={`rounded-xl border overflow-hidden transition-colors ${
                        chosen
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
                        {chosen && (
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
                          disabled={choosing === c.videoId || chosen}
                          variant={chosen ? "outline" : "default"}
                          className={`w-full h-8 mt-3 text-[12px] font-medium gap-1.5 ${
                            chosen
                              ? "border-white/8 text-[#7b7b88] bg-transparent"
                              : "bg-white text-[#0a0a0f] hover:bg-white/90"
                          }`}
                        >
                          {choosing === c.videoId && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {chosen ? "Selected" : "Use as reference"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {project.chosenVideoId && (
              <div className="mt-8 rounded-xl border border-white/6 bg-[#111118] p-5">
                <h2 className="text-[14px] font-medium text-white mb-1">
                  Match your thumbnail to it
                </h2>
                <p className="text-[13px] text-[#7b7b88] mb-4">
                  Upload your image and we measure it against the reference, then
                  grade the colour to close the gap.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[12px] text-[#7b7b88] mb-1.5">Reference</p>
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
                    <p className="text-[12px] text-[#7b7b88] mb-1.5">
                      {project.gradedUrl ? "Yours, graded" : "Yours"}
                    </p>
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-white/4 border border-white/6">
                      {project.uploadUrl ? (
                        <img
                          src={assetUrl(project.gradedUrl || project.uploadUrl)}
                          alt="Your thumbnail"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[#7b7b88] hover:text-white hover:bg-white/4 transition-colors"
                        >
                          {uploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="text-[12px]">Click to upload</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />

                {report && (
                  <div className="mt-5">
                    <div className="flex items-baseline gap-2">
                      <span className={`font-heading text-3xl font-semibold ${scoreTone(report.score)}`}>
                        {report.score}
                      </span>
                      <span className="text-[13px] text-[#7b7b88]">
                        / 100 match
                      </span>
                      {project.gradedReport && project.matchReport && (
                        <span className="text-[12px] text-[#61616b]">
                          (was {project.matchReport.score} before grading)
                        </span>
                      )}
                    </div>

                    {project.matchReports?.length > 1 && (
                      <div className="mt-5 pt-4 border-t border-white/6">
                        <div className="flex items-baseline justify-between mb-2.5">
                          <p className="text-[13px] text-white">
                            How you compare to each winner
                          </p>
                          {best && best.videoId !== project.chosenVideoId && (
                            <span className="text-[11px] text-[#61616b]">
                              #{candidateRank(best.videoId)} is your closest match
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          {project.matchReports.map((r) => {
                            const c = project.candidates.find((x) => x.videoId === r.videoId);
                            const isChosen = r.videoId === project.chosenVideoId;
                            const isBest = best && r.videoId === best.videoId;
                            return (
                              <button
                                key={r.videoId}
                                type="button"
                                onClick={() => handleChoose(r.videoId)}
                                disabled={isChosen || choosing === r.videoId}
                                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                                  isChosen ? "bg-white/8" : "hover:bg-white/4"
                                }`}
                              >
                                <span className="text-[11px] text-[#61616b] w-5 shrink-0">
                                  #{candidateRank(r.videoId)}
                                </span>
                                <span className="text-[12px] text-[#7b7b88] truncate flex-1 min-w-0">
                                  {c?.title || r.videoId}
                                </span>
                                {isBest && !isChosen && (
                                  <span className="text-[10px] text-emerald-400 shrink-0">
                                    easiest target
                                  </span>
                                )}
                                {isChosen && (
                                  <span className="text-[10px] text-[#7b7b88] shrink-0">
                                    current
                                  </span>
                                )}
                                {choosing === r.videoId && (
                                  <Loader2 className="w-3 h-3 animate-spin text-[#7b7b88] shrink-0" />
                                )}
                                <span className="w-16 h-1 rounded bg-white/8 shrink-0 overflow-hidden">
                                  <span
                                    className={`block h-full ${r.score >= 80 ? "bg-emerald-400" : r.score >= 55 ? "bg-amber-400" : "bg-red-400"}`}
                                    style={{ width: `${r.score}%` }}
                                  />
                                </span>
                                <span className={`text-[12px] font-medium w-7 text-right shrink-0 ${scoreTone(r.score)}`}>
                                  {r.score}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-[11px] text-[#61616b] mt-2">
                          Switching keeps your upload and re-scores it against the new reference.
                        </p>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 mt-4">
                      <div>
                        <p className="text-[12px] text-[#7b7b88] mb-2">
                          We can fix these
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {report.fixable.map((g) => (
                            <div key={g.key} className="flex items-center justify-between text-[12px]">
                              <span className="text-[#7b7b88]">{g.label}</span>
                              <span className={severityTone(g.severity)}>
                                {g.mine} vs {g.reference}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[12px] text-[#7b7b88] mb-2">
                          Only you can fix these
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {report.manual.map((g) => (
                            <div key={g.key} className="flex items-center justify-between text-[12px]">
                              <span className="text-[#7b7b88]">{g.label}</span>
                              <span className={severityTone(g.severity)}>
                                {g.delta} apart
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-[#61616b] mt-2 leading-relaxed">
                          Colour grading cannot change these — they need a
                          different crop or shot.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 mt-5">
                      <Button
                        onClick={handleClear}
                        variant="outline"
                        className="h-8 text-[12px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Start over
                      </Button>
                      {project.gradedUrl && (
                        <a href={assetUrl(project.gradedUrl)} download>
                          <Button
                            variant="outline"
                            className="h-8 text-[12px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </Button>
                        </a>
                      )}
                      <Button
                        onClick={handleGrade}
                        disabled={grading}
                        className="h-8 text-[12px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
                      >
                        {grading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        {project.gradedUrl ? "Re-grade" : "Apply grade"}
                      </Button>
                    </div>
                  </div>
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

                    {p.score != null && (
                      <span className={`text-[13px] font-medium shrink-0 ${scoreTone(p.score)}`}>
                        {p.score}
                      </span>
                    )}

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
