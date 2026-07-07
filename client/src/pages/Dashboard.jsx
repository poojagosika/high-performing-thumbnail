import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ImagePlus,
  LogOut,
  Image,
  Trash2,
  Mail,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import UploadModal from "../components/UploadModal";
import api from "../lib/api";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [thumbnails, setThumbnails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleDelete = async (id) => {
    try {
      await api(`/thumbnails/${id}`, { method: "DELETE" });
      setThumbnails((prev) => prev.filter((t) => t._id !== id));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    api("/thumbnails")
      .then((data) => setThumbnails(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <nav className="border-b border-white/6 bg-[#0a0a0f]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="font-heading text-[15px] font-semibold text-white tracking-tight"
          >
            ThumbCraft
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#737380]">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-[#737380] hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Profile section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center shrink-0">
              <span className="font-heading text-[15px] font-semibold text-white">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-medium text-white truncate">
                {user?.name}
              </h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5 text-[12px] text-[#737380]">
                  <Mail className="w-3 h-3" />
                  {user?.email}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-[#737380] capitalize">
                  <CreditCard className="w-3 h-3" />
                  {user?.plan} plan
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
              Your Thumbnails
            </h1>
            <p className="text-[14px] text-[#737380] mt-1">
              {thumbnails.length} thumbnail{thumbnails.length !== 1 && "s"}
            </p>
          </div>

          <Button
            onClick={() => setUploadOpen(true)}
            className="h-9 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Upload
          </Button>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/6 bg-[#111118] overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-white/4" />
                <div className="p-4 space-y-2.5">
                  <div className="h-3.5 w-3/4 rounded bg-white/4" />
                  <div className="h-3 w-1/2 rounded bg-white/4" />
                </div>
              </div>
            ))}
          </div>
        ) : thumbnails.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-12 h-12 rounded-xl bg-white/4 border border-white/6 flex items-center justify-center mb-4">
              <Image className="w-5 h-5 text-[#737380]" />
            </div>
            <h2 className="font-heading text-lg font-medium text-white mb-1">
              No thumbnails yet
            </h2>
            <p className="text-[14px] text-[#737380] max-w-sm mb-6">
              Upload your first thumbnail to start analyzing and optimizing your
              click-through rate.
            </p>
            <Button
              onClick={() => setUploadOpen(true)}
              className="h-9 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Upload Thumbnail
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(2)}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {thumbnails.map((thumb, i) => (
              <motion.div
                key={thumb._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i + 2)}
                className="group rounded-xl border border-white/6 bg-[#111118] hover:bg-[#0e0e16] transition-colors overflow-hidden"
              >
                <div className="aspect-video bg-[#1a1a24] overflow-hidden">
                  <img
                    src={`http://localhost:5000${thumb.imageUrl}`}
                    alt={thumb.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-medium text-white truncate">
                      {thumb.title}
                    </h3>
                    <button
                      onClick={() => handleDelete(thumb._id)}
                      className="text-[#4a4a54] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {thumb.score > 0 && (
                      <span className="text-[12px] text-[#737380]">
                        Score: {thumb.score}/100
                      </span>
                    )}
                    {thumb.tags?.length > 0 && (
                      <div className="flex gap-1.5">
                        {thumb.tags.slice(0, 3).map((tag) => (
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
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(thumb) => setThumbnails((prev) => [thumb, ...prev])}
      />
    </div>
  );
}

export default Dashboard;
