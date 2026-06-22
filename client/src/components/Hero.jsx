import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Eye, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroBackground from "./HeroBackground";

const stagger = (i) => ({ duration: 0.5, delay: i * 0.08, ease: "easeOut" });

function DashboardPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-20 sm:mt-28 mx-auto max-w-5xl w-full px-4"
    >
      <div className="relative rounded-xl border border-white/6 bg-[#111118] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border-white/6" />
            <div className="w-2.5 h-2.5 rounded-full border-white/6" />
            <div className="w-2.5 h-2.5 rounded-full border-white/6" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 rounded-md border-white/3 text-[11px] text-[#737380] font-mono">
              thumbcraft.app/dashboard
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="p-5 sm:p-8">
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              {
                label: "Click-Through Rate",
                value: "8.4%",
                change: "+2.1%",
                Icon: MousePointerClick,
              },
              {
                label: "Impressions",
                value: "142K",
                change: "+18%",
                Icon: Eye,
              },
              {
                label: "Performance Score",
                value: "94",
                change: "+12",
                Icon: TrendingUp,
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i + 6)}
                className="p-4 sm:p-5 rounded-lg border border-white/4 bg-white/2"
              >
                <div className="flex items-center justify-between mb-3">
                  <s.Icon className="w-4 h-4 text-[#737380]" />
                  <span className="text-xs font-medium text-emerald-400">
                    {s.change}
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-heading font-semibold text-white">
                  {s.value}
                </div>
                <div className="text-xs text-[#737380] mt-1">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Thumbnail A/B */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(9)}
              className="p-4 sm:p-5 rounded-lg border border-emerald-500/10 bg-emerald-500/2"
            >
              <div className="aspect-video rounded-md bg-[#1a1a24] border border-white/4 mb-3 flex items-center justify-center">
                <span className="text-xs font-mono text-[#737380]">
                  THUMBNAIL A
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-400 font-medium">
                    Winner
                  </div>
                  <div className="text-xl font-heading font-semibold text-white">
                    92
                    <span className="text-xs text-[#737380] font-normal ml-0.5">
                      /100
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#737380]">CTR</div>
                  <div className="text-base font-medium text-emerald-400">
                    12.4%
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(10)}
              className="p-4 sm:p-5 rounded-lg border border-white/4 bg-white/2"
            >
              <div className="aspect-video rounded-md bg-[#1a1a24] border border-white/4 mb-3 flex items-center justify-center">
                <span className="text-xs font-mono text-[#737380]">
                  THUMBNAIL B
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#737380] font-medium">
                    Needs work
                  </div>
                  <div className="text-xl font-heading font-semibold text-white">
                    47
                    <span className="text-xs text-[#737380] font-normal ml-0.5">
                      /100
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#737380]">CTR</div>
                  <div className="text-base font-medium text-red-400">3.2%</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center px-6 pt-32 pb-20 overflow-hidden">
      <HeroBackground />

      <div className="max-w-2xl mx-auto text-center relative z-10">
        {/* Pill */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/6 bg-white/3 text-[13px] text-[#737380] hover:text-white hover:border-white/10 transition-all duration-200"
          >
            Introducing ThumbCraft
            <ArrowRight className="w-3 h-3" />
          </a>
        </motion.div>

        {/* Headline — white, clean, no gradient */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="mt-6 font-heading text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-white leading-[1.1] tracking-[-0.02em]"
        >
          Thumbnails that
          <br />
          drive clicks
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="mt-4 text-[15px] sm:text-base text-[#737380] max-w-md mx-auto leading-relaxed"
        >
          Analyze what makes thumbnails perform. Get AI-powered feedback and
          create designs that actually convert.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="mt-8 flex items-center justify-center gap-3"
        >
          <Link to="/signup">
            <Button className="h-9 px-5 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium group">
              Get Started
              <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <Button
            variant="outline"
            className="h-9 px-5 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
          >
            View Demo
          </Button>
        </motion.div>

        {/* Trusted by — understated */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 flex flex-col items-center gap-3"
        >
          <span className="text-[11px] text-[#4a4a54] uppercase tracking-[0.15em] font-medium">
            Trusted by creators on
          </span>
          <div className="flex items-center gap-6">
            {["YouTube", "Twitch", "TikTok", "Instagram"].map((name) => (
              <span
                key={name}
                className="text-[12px] font-medium text-[#4a4a54] tracking-wide"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      <DashboardPreview />
    </section>
  );
}

export default Hero;
