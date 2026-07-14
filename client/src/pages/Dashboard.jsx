import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus,
  LogOut,
  Image,
  Trash2,
  Pencil,
  Mail,
  CreditCard,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import UploadModal from "../components/UploadModal";
import api from "../lib/api";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function Dashboard() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [thumbnails, setThumbnails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [search, setSearch] = useState("");
  const editRef = useRef(null);

  const handleRename = async (id) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await api(`/thumbnails/${id}`, {
        method: "PATCH",
        body: { title: trimmed },
      });
      setThumbnails((prev) =>
        prev.map((t) => (t._id === id ? { ...t, title: trimmed } : t)),
      );
      toast.success("Title updated");
    } catch {
      toast.error("Failed to update title");
    }
    setEditingId(null);
  };

  const startEditing = (thumb) => {
    setEditingId(thumb._id);
    setEditTitle(thumb.title);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/thumbnails/${deleteId}`, { method: "DELETE" });
      setThumbnails((prev) => prev.filter((t) => t._id !== deleteId));
      toast.success("Thumbnail deleted");
    } catch {
      toast.error("Failed to delete thumbnail");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = thumbnails.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  });

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

        {!loading && thumbnails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(2)}
            className="mb-6"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a54]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or tag..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
          </motion.div>
        )}

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
        ) : filtered.length === 0 && search.trim() ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-5 h-5 text-[#4a4a54] mb-3" />
            <p className="text-[14px] text-[#737380]">
              No thumbnails matching &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(2)}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((thumb, i) => (
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
                    {editingId === thumb._id ? (
                      <input
                        ref={editRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRename(thumb._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(thumb._id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 min-w-0 h-6 px-1.5 -ml-1.5 rounded bg-white/4 border border-white/10 text-[14px] font-medium text-white outline-none focus:border-white/20 transition-colors"
                      />
                    ) : (
                      <h3
                        className="text-[14px] font-medium text-white truncate cursor-pointer hover:text-white/80 transition-colors"
                        onClick={() => startEditing(thumb)}
                        title="Click to rename"
                      >
                        {thumb.title}
                      </h3>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId !== thumb._id && (
                        <button
                          onClick={() => startEditing(thumb)}
                          className="text-[#4a4a54] hover:text-white transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteId(thumb._id)}
                        className="text-[#4a4a54] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
        onUploaded={(thumb) => {
          setThumbnails((prev) => [thumb, ...prev]);
          toast.success("Thumbnail uploaded");
        }}
      />

      {/* Confirm delete modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm rounded-xl border border-white/6 bg-[#111118] shadow-2xl p-5"
            >
              <h2 className="font-heading text-[15px] font-semibold text-white">
                Delete thumbnail?
              </h2>
              <p className="text-[13px] text-[#737380] mt-1.5">
                This action cannot be undone. The thumbnail will be permanently
                removed.
              </p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <Button
                  variant="outline"
                  onClick={() => setDeleteId(null)}
                  className="h-8 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-600 font-medium"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dashboard;
