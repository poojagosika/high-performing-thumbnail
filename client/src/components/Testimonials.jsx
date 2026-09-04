import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "My CTR jumped 40% in the first month. The AI analysis catches things I'd never notice — like how my text was getting lost in the background.",
    name: "Alex Rivera",
    role: "Tech YouTuber",
    channel: "320K subscribers",
  },
  {
    quote:
      "I used to spend hours second-guessing my thumbnails. Now I upload, get a score, tweak, and publish. It's become the first step in my workflow.",
    name: "Sarah Chen",
    role: "Finance Creator",
    channel: "185K subscribers",
  },
  {
    quote:
      "The A/B compare feature alone is worth it. Being able to see exactly why one thumbnail outperforms another changed how I think about design.",
    name: "Marcus Webb",
    role: "Gaming Channel",
    channel: "520K subscribers",
  },
];

function Testimonials() {
  return (
    <section className="relative py-24 sm:py-32 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4 }}
          className="text-center mb-14"
        >
          <p className="text-[13px] text-[#7b7b88] font-medium uppercase tracking-widest mb-3">
            Testimonials
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-[-0.01em]">
            Trusted by creators who care about clicks
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="flex flex-col p-6 rounded-xl border border-white/6 bg-[#111118]"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star
                    key={j}
                    className="w-3.5 h-3.5 fill-white/20 text-white/20"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-[13px] text-[#7b7b88] leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 mt-5 pt-5 border-t border-white/6">
                <div className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center shrink-0">
                  <span className="font-heading text-[12px] font-semibold text-white">
                    {t.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white">{t.name}</p>
                  <p className="text-[11px] text-[#61616b]">
                    {t.role} &middot; {t.channel}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Testimonials;
