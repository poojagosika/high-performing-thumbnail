import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Home, Layers, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const links = [
  { label: "Home", href: "/", icon: Home, desc: "Back to landing page" },
  {
    label: "Features",
    href: "/#features",
    icon: Layers,
    desc: "See what we offer",
  },
  {
    label: "Pricing",
    href: "/#pricing",
    icon: CreditCard,
    desc: "View our plans",
  },
];

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 50% 40%, rgba(120, 119, 198, 0.08) 0%, transparent 50%),
            #0a0a0f
          `,
        }}
      />

      <div className="relative z-10 max-w-md w-full text-center">
        {/* Large 404 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative mb-6"
        >
          <span className="text-[8rem] sm:text-[10rem] font-heading font-bold leading-none text-white/[0.03] select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[13px] font-mono text-[#737380] px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.02]">
              Page not found
            </span>
          </div>
        </motion.div>

        {/* Message */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="font-heading text-xl font-semibold text-white tracking-[-0.01em]"
        >
          This page doesn't exist
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="mt-2 text-[14px] text-[#737380] leading-relaxed"
        >
          The page you're looking for may have been moved or removed.
        </motion.p>

        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="mt-6"
        >
          <Link to="/">
            <Button className="h-9 px-5 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium group">
              <ArrowLeft className="w-3.5 h-3.5 mr-1 transition-transform group-hover:-translate-x-0.5" />
              Go home
            </Button>
          </Link>
        </motion.div>

        {/* Quick links */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(4)}
          className="mt-12 grid grid-cols-3 gap-3"
        >
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                to={link.href}
                className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 group"
              >
                <Icon className="w-4 h-4 text-[#737380] group-hover:text-white transition-colors mx-auto mb-2" />
                <div className="text-[13px] font-medium text-white">
                  {link.label}
                </div>
                <div className="text-[11px] text-[#4a4a54] mt-0.5">
                  {link.desc}
                </div>
              </Link>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

export default NotFound;
