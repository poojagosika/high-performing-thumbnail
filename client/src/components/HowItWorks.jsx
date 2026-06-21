import { motion } from "framer-motion";
import { Upload, Cpu, BarChart3 } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload your thumbnail",
    description:
      "Drop in any thumbnail image or paste a YouTube URL. We handle the rest.",
  },
  {
    number: "02",
    icon: Cpu,
    title: "Get AI-powered analysis",
    description:
      "Our model evaluates composition, colors, text readability, and emotional impact in seconds.",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Improve and publish",
    description:
      "Apply suggestions, A/B test variations, and publish the thumbnail that drives the most clicks.",
  },
];

function HowItWorks() {
  return (
    <section className="relative py-24 sm:py-32 px-6" id="how-it-works">
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
            How It Works
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-[-0.01em]">
            Three steps to better thumbnails
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="relative p-6 rounded-xl border border-white/6 bg-[#111118]"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-mono text-[#737380]">
                    {step.number}
                  </span>
                  <Icon className="w-4 h-4 text-[#737380]" />
                </div>
                <h3 className="font-heading text-[15px] font-medium text-white mb-1.5">
                  {step.title}
                </h3>
                <p className="text-[13px] text-[#737380] leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
