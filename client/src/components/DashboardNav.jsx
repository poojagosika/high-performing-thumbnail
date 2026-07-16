import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { LogOut, Menu, X, LayoutDashboard, Home } from "lucide-react";
import { useAuth } from "../context/AuthContext";

function DashboardNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <nav className="border-b border-white/6 bg-[#0a0a0f]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="font-heading text-[15px] font-semibold text-white tracking-tight"
        >
          ThumbCraft
        </Link>

        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-4">
          <Link
            to="/dashboard"
            className="text-[13px] text-[#737380] hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <span className="text-[13px] text-[#737380]">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-[#737380] hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          className="sm:hidden p-1.5 text-[#737380] hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="sm:hidden bg-[#0a0a0f] border-b border-white/6 px-6 pb-4 flex flex-col gap-2"
        >
          <div className="text-[13px] text-[#737380] py-1.5">
            {user?.name} &middot; {user?.email}
          </div>
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 text-[13px] text-[#737380] hover:text-white py-1.5 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 text-[13px] text-[#737380] hover:text-white py-1.5 transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <button
            onClick={() => {
              setMenuOpen(false);
              handleLogout();
            }}
            className="flex items-center gap-2 text-[13px] text-[#737380] hover:text-white py-1.5 transition-colors text-left"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </motion.div>
      )}
    </nav>
  );
}

export default DashboardNav;
