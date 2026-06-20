import { motion } from "framer-motion";
import {
  Search,
  BarChart3,
  Palette,
  Zap,
  Trophy,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Smart Analysis",
    description:
      "Upload any thumbnail and get instant feedback on composition, color balance, and emotional impact.",
  },
  {
    icon: BarChart3,
    title: "Performance Insights",
    description:
      "Data-driven patterns from top-performing channels. See what actually works.",
  },
  {
    icon: Palette,
    title: "AI Design Assistant",
    description:
      "Generate thumbnail concepts and test variations before you publish.",
  },
  {
    icon: Zap,
    title: "A/B Testing",
    description:
      "Split test your thumbnails. Let real viewer data pick the winner.",
  },
  {
    icon: Trophy,
    title: "Competitor Tracking",
    description:
      "Monitor competitor thumbnails and spot trends before they go mainstream.",
  },
  {
    icon: TrendingUp,
    title: "CTR Predictions",
    description:
      "Predicted click-through rate before publishing, trained on 50K+ thumbnails.",
  },
];

function Features() {
  return (
    <section className="relative py-24 sm:py-32 px-6" id="features">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4 }}
          className="text-center mb-14"
        >
          <p className="text-[13px] text-[#737380] font-medium uppercase tracking-widest mb-3">
            Features
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-[-0.01em]">
            Everything you need to win the click
          </h2>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/4 rounded-xl border border-white/6 overflow-hidden">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="bg-[#0a0a0f] p-6 hover:bg-[#0e0e16] transition-colors duration-300"
              >
                <Icon className="w-4 h-4 text-[#737380] mb-3" />
                <h3 className="font-heading text-[15px] font-medium text-white mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-[13px] text-[#737380] leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Features;
