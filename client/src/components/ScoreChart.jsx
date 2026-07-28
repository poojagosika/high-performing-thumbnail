import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Trophy, Target } from "lucide-react";

const CHART_H = 160;
const CHART_W = 100; // percentage-based, SVG viewBox handles this
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

function ScoreChart({ thumbnails }) {
  const scored = useMemo(
    () =>
      thumbnails
        .filter((t) => t.score != null)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [thumbnails],
  );

  const stats = useMemo(() => {
    if (scored.length === 0) return null;
    const scores = scored.map((t) => t.score);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    const latest = scores[scores.length - 1];
    return { avg, best, latest };
  }, [scored]);

  if (scored.length < 2 || !stats) return null;

  const viewW = 500;
  const viewH = CHART_H;
  const plotW = viewW - PAD.left - PAD.right;
  const plotH = viewH - PAD.top - PAD.bottom;

  const minScore = Math.max(0, Math.min(...scored.map((t) => t.score)) - 10);
  const maxScore = Math.min(100, Math.max(...scored.map((t) => t.score)) + 10);
  const scoreRange = maxScore - minScore || 1;

  const points = scored.map((t, i) => {
    const x = PAD.left + (i / (scored.length - 1)) * plotW;
    const y = PAD.top + plotH - ((t.score - minScore) / scoreRange) * plotH;
    return { x, y, score: t.score, title: t.title, date: t.createdAt };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + plotH} L ${points[0].x} ${PAD.top + plotH} Z`;

  const avgY = PAD.top + plotH - ((stats.avg - minScore) / scoreRange) * plotH;

  // Y-axis labels
  const yLabels = [minScore, Math.round((minScore + maxScore) / 2), maxScore];

  // X-axis labels (first, middle, last dates)
  const xLabels = [
    { i: 0, date: scored[0].createdAt },
    {
      i: Math.floor(scored.length / 2),
      date: scored[Math.floor(scored.length / 2)].createdAt,
    },
    { i: scored.length - 1, date: scored[scored.length - 1].createdAt },
  ];

  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06, ease: "easeOut" }}
      className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#737380]" />
          <h3 className="text-[14px] font-medium text-white">Score Trends</h3>
        </div>
        <span className="text-[11px] text-[#4a4a54]">
          {scored.length} scored thumbnails
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-white/6 bg-white/2 p-3">
          <div className="flex items-center gap-1 mb-1">
            <Target className="w-3 h-3 text-[#4a4a54]" />
            <span className="text-[11px] text-[#4a4a54]">Average</span>
          </div>
          <span className="font-heading text-lg font-semibold text-white">
            {stats.avg}
          </span>
        </div>
        <div className="rounded-lg border border-white/6 bg-white/2 p-3">
          <div className="flex items-center gap-1 mb-1">
            <Trophy className="w-3 h-3 text-[#4a4a54]" />
            <span className="text-[11px] text-[#4a4a54]">Best</span>
          </div>
          <span className="font-heading text-lg font-semibold text-emerald-400">
            {stats.best}
          </span>
        </div>
        <div className="rounded-lg border border-white/6 bg-white/2 p-3">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-[#4a4a54]" />
            <span className="text-[11px] text-[#4a4a54]">Latest</span>
          </div>
          <span className="font-heading text-lg font-semibold text-white">
            {stats.latest}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="w-full"
          preserveAspectRatio="none"
          style={{ height: CHART_H }}
        >
          {/* Grid lines */}
          {yLabels.map((val) => {
            const y = PAD.top + plotH - ((val - minScore) / scoreRange) * plotH;
            return (
              <line
                key={val}
                x1={PAD.left}
                y1={y}
                x2={viewW - PAD.right}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#scoreGradient)" />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* Average line */}
          <line
            x1={PAD.left}
            y1={avgY}
            x2={viewW - PAD.right}
            y2={avgY}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text
            x={viewW - PAD.right + 2}
            y={avgY - 4}
            fill="rgba(255,255,255,0.2)"
            fontSize="9"
            textAnchor="end"
          >
            avg
          </text>

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3"
              fill="#111118"
              stroke="white"
              strokeWidth="1.5"
            >
              <title>
                {p.title}: {p.score}/100
              </title>
            </circle>
          ))}

          {/* Y-axis labels */}
          {yLabels.map((val) => {
            const y = PAD.top + plotH - ((val - minScore) / scoreRange) * plotH;
            return (
              <text
                key={val}
                x={PAD.left - 6}
                y={y + 3}
                fill="rgba(255,255,255,0.2)"
                fontSize="9"
                textAnchor="end"
              >
                {val}
              </text>
            );
          })}

          {/* X-axis labels */}
          {xLabels.map(({ i, date }) => (
            <text
              key={i}
              x={points[i].x}
              y={viewH - 4}
              fill="rgba(255,255,255,0.2)"
              fontSize="9"
              textAnchor="middle"
            >
              {formatDate(date)}
            </text>
          ))}
        </svg>
      </div>
    </motion.div>
  );
}

export default ScoreChart;
