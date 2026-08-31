import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ImagePlus,
  GitCompareArrows,
  LayoutGrid,
  List,
  Trash2,
  Keyboard,
  Settings as SettingsIcon,
  LogOut,
  Image as ImageIcon,
  CornerDownLeft,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { matchThumbnails } from "../lib/paletteSearch";
import api from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

function CommandPalette() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [thumbnails, setThumbnails] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const commands = useMemo(
    () => [
      {
        id: "upload",
        label: "Upload thumbnail",
        group: "Actions",
        icon: ImagePlus,
        run: () => navigate("/dashboard?upload=1"),
      },
      {
        id: "compare",
        label: "Compare thumbnails",
        group: "Actions",
        icon: GitCompareArrows,
        run: () => navigate("/compare"),
      },
      {
        id: "grid",
        label: "Switch to grid view",
        group: "Actions",
        icon: LayoutGrid,
        run: () => navigate("/dashboard?view=grid"),
      },
      {
        id: "list",
        label: "Switch to list view",
        group: "Actions",
        icon: List,
        run: () => navigate("/dashboard?view=list"),
      },
      {
        id: "trash",
        label: "Open trash",
        group: "Actions",
        icon: Trash2,
        run: () => navigate("/dashboard?trash=1"),
      },
      {
        id: "shortcuts",
        label: "Show keyboard shortcuts",
        group: "Actions",
        icon: Keyboard,
        run: () => navigate("/dashboard?shortcuts=1"),
      },
      {
        id: "dashboard",
        label: "Go to dashboard",
        group: "Navigation",
        icon: LayoutGrid,
        run: () => navigate("/dashboard"),
      },
      {
        id: "settings",
        label: "Go to settings",
        group: "Navigation",
        icon: SettingsIcon,
        run: () => navigate("/settings"),
      },
      {
        id: "logout",
        label: "Log out",
        group: "Navigation",
        icon: LogOut,
        run: async () => {
          await logout();
          navigate("/login");
        },
      },
    ],
    [navigate, logout],
  );

  // One flat list so arrow keys move across groups without special cases.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const thumbItems = matchThumbnails(thumbnails || [], query).map((t) => ({
      id: `thumb-${t._id}`,
      label: t.title,
      group: "Thumbnails",
      imageUrl: t.imageUrl,
      run: () => navigate(`/thumbnail/${t._id}`),
    }));
    const commandItems = commands.filter((c) =>
      q ? c.label.toLowerCase().includes(q) : true,
    );
    return [...thumbItems, ...commandItems];
  }, [thumbnails, query, commands, navigate]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const runItem = useCallback(
    (item) => {
      if (!item) return;
      close();
      item.run();
    },
    [close],
  );

  // Global open/close. Bound only while signed in, so the public pages are untouched.
  useEffect(() => {
    if (!user) return;
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // otherwise the browser focuses its own search bar
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user]);

  // Fetched on first open rather than on mount, so no page load pays for it.
  useEffect(() => {
    if (!open || thumbnails !== null) return;
    api("/thumbnails")
      .then((data) => setThumbnails(data))
      .catch(() => setThumbnails([]));
  }, [open, thumbnails]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view when arrowing past the visible window.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!user) return null;

  const onInputKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(results[active]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg rounded-xl border border-white/8 bg-[#111118] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 border-b border-white/6">
              <Search className="w-3.5 h-3.5 text-[#4a4a54] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search thumbnails or run a command..."
                className="flex-1 h-12 bg-transparent text-[14px] text-white placeholder:text-[#4a4a54] outline-none"
              />
              <kbd className="shrink-0 inline-flex items-center h-5 px-1.5 rounded bg-white/6 border border-white/10 text-[10px] font-mono text-[#4a4a54]">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-[#4a4a54]">
                  No matches for &ldquo;{query}&rdquo;
                </p>
              ) : (
                results.map((item, i) => {
                  const Icon = item.icon;
                  const isFirstOfGroup =
                    i === 0 || results[i - 1].group !== item.group;
                  return (
                    <div key={item.id}>
                      {isFirstOfGroup && (
                        <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#4a4a54]">
                          {item.group}
                        </p>
                      )}
                      <button
                        data-index={i}
                        onClick={() => runItem(item)}
                        onMouseMove={() => setActive(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          i === active ? "bg-white/6" : "hover:bg-white/4"
                        }`}
                      >
                        {item.imageUrl ? (
                          <div className="w-9 h-6 rounded bg-[#1a1a24] overflow-hidden shrink-0">
                            <img
                              src={assetUrl(item.imageUrl)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-9 h-6 rounded bg-white/4 flex items-center justify-center shrink-0">
                            {Icon ? (
                              <Icon className="w-3.5 h-3.5 text-[#737380]" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-[#737380]" />
                            )}
                          </div>
                        )}
                        <span
                          className={`text-[13px] truncate flex-1 ${
                            i === active ? "text-white" : "text-[#737380]"
                          }`}
                        >
                          {item.label}
                        </span>
                        {i === active && (
                          <CornerDownLeft className="w-3 h-3 text-[#4a4a54] shrink-0" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
