import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Tag, BarChart3 } from "lucide-react";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function AnalyticsChart({ thumbnails }) {
  const [activeTab, setActiveTab] = useState("uploads");

  // Upload frequency by week
  const uploadData = useMemo(() => {
    if (thumbnails.length === 0) return [];
    const sorted = [...thumbnails].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
    const weeks = {};
    sorted.forEach((t) => {
      const d = new Date(t.createdAt);
      const start = new Date(d);
      start.setDate(start.getDate() - start.getDay());
      const key = start.toISOString().split("T")[0];
      if (!weeks[key]) weeks[key] = { date: key, count: 0, totalScore: 0, scored: 0 };
      weeks[key].count++;
      if (t.score > 0) {
        weeks[key].totalScore += t.score;
        weeks[key].scored++;
      }
    });
    return Object.values(weeks)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);
  }, [thumbnails]);

  // Tag distribution
  const tagData = useMemo(() => {
    const counts = {};
    thumbnails.forEach((t) => {
      (t.tags || []).forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [thumbnails]);

  if (thumbnails.length < 2) return null;

  const maxUpload = Math.max(...uploadData.map((d) => d.count), 1);
  const maxTag = tagData.length > 0 ? tagData[0].count : 1;

  const formatWeek = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const tabs = [
    { id: "uploads", label: "Upload Activity", Icon: CalendarDays },
    { id: "tags", label: "Top Tags", Icon: Tag },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={stagger(1)}
      className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#7b7b88]" />
          <h3 className="text-[14px] font-medium text-white">Analytics</h3>
        </div>
        <div className="flex items-center rounded-lg border border-white/8 bg-white/3 overflow-hidden">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`h-7 px-2.5 flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                activeTab === id
                  ? "bg-white/8 text-white"
                  : "text-[#61616b] hover:text-white"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "uploads" && uploadData.length > 0 && (
        <div>
          {/* Bar chart */}
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {uploadData.map((week, i) => {
              const h = (week.count / maxUpload) * 100;
              const avgScore =
                week.scored > 0
                  ? Math.round(week.totalScore / week.scored)
                  : null;
              return (
                <div
                  key={week.date}
                  className="flex-1 flex flex-col items-center gap-1 group/bar"
                >
                  <div className="relative w-full flex justify-center">
                    <div className="absolute -top-6 opacity-0 group-hover/bar:opacity-100 transition-opacity text-[10px] text-white bg-[#1a1a24] border border-white/8 rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none z-10">
                      {week.count} upload{week.count !== 1 ? "s" : ""}
                      {avgScore != null && ` · avg ${avgScore}`}
                    </div>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.5, delay: i * 0.04, ease: "easeOut" }}
                      className="w-full rounded-t bg-white/10 group-hover/bar:bg-white/20 transition-colors min-h-[2px]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* X labels */}
          <div className="flex gap-1.5 mt-2">
            {uploadData.map((week, i) => (
              <div key={week.date} className="flex-1 text-center">
                {i === 0 || i === uploadData.length - 1 || i === Math.floor(uploadData.length / 2) ? (
                  <span className="text-[9px] text-[#61616b]">
                    {formatWeek(week.date)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/4">
            <span className="text-[11px] text-[#61616b]">
              Last {uploadData.length} weeks
            </span>
            <span className="text-[11px] text-[#7b7b88]">
              {thumbnails.length} total uploads
            </span>
          </div>
        </div>
      )}

      {activeTab === "tags" && (
        <div>
          {tagData.length > 0 ? (
            <div className="space-y-2">
              {tagData.map((item, i) => (
                <div key={item.tag} className="flex items-center gap-3">
                  <span className="text-[12px] text-[#7b7b88] w-20 truncate shrink-0">
                    {item.tag}
                  </span>
                  <div className="flex-1 h-5 bg-white/3 rounded overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.count / maxTag) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                      className="h-full bg-white/10 rounded flex items-center justify-end px-2"
                    >
                      <span className="text-[10px] text-[#7b7b88] font-medium">
                        {item.count}
                      </span>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[#61616b] text-center py-6">
              No tags added yet
            </p>
          )}
          {tagData.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/4">
              <span className="text-[11px] text-[#61616b]">
                Top {tagData.length} tags
              </span>
              <span className="text-[11px] text-[#7b7b88]">
                {[...new Set(thumbnails.flatMap((t) => t.tags || []))].length} unique tags
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default AnalyticsChart;
