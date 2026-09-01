import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { motion } from "framer-motion";
import {
  Calendar,
  Tag,
  BarChart3,
  MousePointerClick,
  Palette,
  Type,
  Heart,
  Layout,
  Download,
} from "lucide-react";
import { assetUrl } from "../lib/assetUrl";
import api from "../lib/api";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const analysisItems = [
  { key: "composition", label: "Composition", Icon: Layout },
  { key: "colorBalance", label: "Color Balance", Icon: Palette },
  { key: "textReadability", label: "Text Readability", Icon: Type },
  { key: "emotionalImpact", label: "Emotional Impact", Icon: Heart },
];

function SharedThumbnail() {
  const { token } = useParams();
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api(`/thumbnails/public/${token}`)
      .then((data) => setThumb(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="h-5 w-40 rounded bg-white/4 animate-pulse mb-6" />
          <div className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden">
            <div className="aspect-video bg-white/4 animate-pulse" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-6 w-2/3 rounded bg-white/4 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-white/4 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-semibold text-white mb-2">
            This link is no longer available
          </h1>
          <p className="text-[14px] text-[#737380] mb-6">
            This link may have expired or been revoked.
          </p>
          <Link
            to="/"
            className="text-[13px] text-[#737380] hover:text-white transition-colors underline underline-offset-4"
          >
            Go to ThumbCraft
          </Link>
        </div>
      </div>
    );
  }

  const hasAnalysis = analysisItems.some(
    (a) => thumb.analysis?.[a.key] != null,
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Minimal header */}
      <div className="border-b border-white/6">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="font-heading text-[15px] font-semibold text-white tracking-[-0.01em]"
          >
            ThumbCraft
          </Link>
          <span className="text-[11px] text-[#4a4a54]">Shared thumbnail</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Image */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
          className="relative rounded-xl border border-white/6 bg-[#111118] overflow-hidden"
        >
          <img
            src={assetUrl(thumb.imageUrl)}
            alt={thumb.title}
            className="w-full aspect-video object-cover"
          />
            <a
              href={assetUrl(thumb.imageUrl)}
              download
              className="absolute bottom-3 right-3 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[12px] text-white/80 hover:text-white hover:bg-black/70 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="mt-6"
        >
          <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
            {thumb.title}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1.5 text-[12px] text-[#737380]">
              <Calendar className="w-3 h-3" />
              {new Date(thumb.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            {thumb.tags?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-[#4a4a54]" />
                {thumb.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] text-[#737380] bg-white/4 rounded-full px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Score & CTR */}
        {(thumb.score != null || thumb.ctr != null) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="grid grid-cols-2 gap-3 mt-6"
          >
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
          </motion.div>
        )}

        {/* Analysis */}
        {hasAnalysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(3)}
            className="mt-6 rounded-xl border border-white/6 bg-[#111118] p-5"
          >
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
                      <span className={`text-[12px] font-medium ${textColor}`}>
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
          </motion.div>
        )}

        {/* Version history */}
        {thumb.versions?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(4)}
            className="mt-6 rounded-xl border border-white/6 bg-[#111118] p-5"
          >
            <h3 className="text-[13px] text-[#737380] font-medium mb-3">
              Version History ({thumb.versions.length + 1} versions)
            </h3>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {[...thumb.versions].reverse().map((v, i) => (
                <div
                  key={i}
                  className="shrink-0 rounded-lg border border-white/6 overflow-hidden"
                >
                  <div className="w-28 aspect-video bg-[#1a1a24]">
                    <img
                      src={assetUrl(v.imageUrl)}
                      alt={`Version ${thumb.versions.length - i}`}
                      className="w-full h-full object-cover"
                    />
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
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default SharedThumbnail;
