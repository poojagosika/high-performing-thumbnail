import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Home,
  LayoutDashboard,
  Layers,
  CreditCard,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function NotFound() {
  const { user, loading } = useAuth();

  const links = user
    ? [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          desc: "View your thumbnails",
        },
        {
          label: "Settings",
          href: "/settings",
          icon: Settings,
          desc: "Manage your account",
        },
        {
          label: "Home",
          href: "/",
          icon: Home,
          desc: "Back to landing page",
        },
      ]
    : [
        {
          label: "Home",
          href: "/",
          icon: Home,
          desc: "Back to landing page",
        },
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

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 50% 40%, rgba(120,119,198,0.06) 0%, transparent 60%), #0a0a0f",
        }}
      />

      <div className="relative z-10 max-w-md w-full text-center">
        {/* 404 display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative mb-8"
        >
          <div className="relative inline-block">
            <span className="text-[8rem] sm:text-[10rem] font-heading font-bold leading-none text-transparent bg-clip-text bg-gradient-to-b from-white/[0.06] to-white/[0.02] select-none">
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/8 bg-[#111118]/80 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80 animate-pulse" />
                <span className="text-[12px] font-mono text-[#7b7b88]">
                  page not found
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Message */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="font-heading text-xl font-semibold text-white tracking-[-0.01em]"
        >
          Nothing to see here
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="mt-2 text-[13px] text-[#7b7b88] leading-relaxed max-w-xs mx-auto"
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(4)}
          className="mt-6"
        >
          <Link to={user ? "/dashboard" : "/"}>
            <Button className="h-9 px-5 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium group gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              {user ? "Back to Dashboard" : "Go home"}
            </Button>
          </Link>
        </motion.div>

        {/* Quick links */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(5)}
          className="mt-14"
        >
          <p className="text-[11px] text-[#61616b] uppercase tracking-widest mb-4">
            Quick links
          </p>
          <div className="grid grid-cols-3 gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.label}
                  to={link.href}
                  className="p-3.5 rounded-xl border border-white/6 bg-[#111118] hover:bg-[#0e0e16] hover:border-white/10 transition-all group"
                >
                  <Icon className="w-4 h-4 text-[#61616b] group-hover:text-white transition-colors mx-auto mb-2" />
                  <div className="text-[12px] font-medium text-white">
                    {link.label}
                  </div>
                  <div className="text-[10px] text-[#61616b] mt-0.5">
                    {link.desc}
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* URL hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={stagger(6)}
          className="mt-8 text-[11px] text-[#61616b] font-mono"
        >
          {window.location.pathname}
        </motion.p>
      </div>
    </div>
  );
}

export default NotFound;
