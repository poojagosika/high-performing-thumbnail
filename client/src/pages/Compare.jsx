import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  MousePointerClick,
  Layout,
  Palette,
  Type,
  Heart,
  Trophy,
  Loader2,
} from "lucide-react";
import DashboardNav from "../components/DashboardNav";
import api from "../lib/api";

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
        <Icon className="w-3.5 h-3.5 text-[#737380]" />
        <span className="text-[12px] text-[#737380]">{label}</span>
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
        <Icon className="w-3 h-3 text-[#4a4a54]" />
        <span className="text-[12px] text-[#737380]">{label}</span>
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
  const [thumbA, setThumbA] = useState(null);
  const [thumbB, setThumbB] = useState(null);
  const [loading, setLoading] = useState(true);

  const idA = searchParams.get("a");
  const idB = searchParams.get("b");

  useEffect(() => {
    if (!idA || !idB) {
      navigate("/dashboard");
      return;
    }

    Promise.all([api(`/thumbnails/${idA}`), api(`/thumbnails/${idB}`)])
      .then(([a, b]) => {
        setThumbA(a);
        setThumbB(b);
      })
      .catch(() => navigate("/dashboard"))
      .finally(() => setLoading(false));
  }, [idA, idB, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#737380] animate-spin" />
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

      <main className="max-w-5xl mx-auto px-6 py-10">
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

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="mb-8"
        >
          <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
            A/B Compare
          </h1>
          <p className="text-[14px] text-[#737380] mt-1">
            Side-by-side comparison of two thumbnails
          </p>
        </motion.div>

        {/* Thumbnail images */}
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
                  src={`http://localhost:5000${thumbA.imageUrl}`}
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
                    className="text-[11px] text-[#4a4a54] bg-white/4 rounded-full px-2 py-0.5"
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
                  src={`http://localhost:5000${thumbB.imageUrl}`}
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
                    className="text-[11px] text-[#4a4a54] bg-white/4 rounded-full px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

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
            <h3 className="text-[13px] text-[#737380] font-medium mb-4">
              Analysis Breakdown
            </h3>

            {/* Column labels */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <span className="text-[11px] text-[#4a4a54] font-medium truncate">
                {thumbA.title}
              </span>
              <span className="text-[11px] text-[#4a4a54] font-medium truncate">
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
                <p className="text-[13px] text-[#737380]">Verdict</p>
                <p className="font-heading text-lg font-semibold text-white mt-1">
                  It&apos;s a tie
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-[#737380]">Verdict</p>
                <p className="font-heading text-lg font-semibold text-emerald-400 mt-1">
                  {winner === "A" ? thumbA.title : thumbB.title}
                </p>
                <p className="text-[12px] text-[#4a4a54] mt-1">
                  scores {Math.abs((scoreA ?? 0) - (scoreB ?? 0))} points higher
                </p>
              </>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default Compare;
