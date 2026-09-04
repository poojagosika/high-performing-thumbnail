import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const tokenLooksValid = TOKEN_PATTERN.test(token);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      toast.success("Password updated. Log in with your new password.");
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(0)}
          >
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#7b7b88] hover:text-white transition-colors mb-8"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to log in
            </Link>
          </motion.div>

          {!tokenLooksValid ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(1)}
            >
              <div className="w-9 h-9 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center mb-4">
                <ShieldAlert className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
                This link isn&apos;t valid
              </h1>
              <p className="text-[14px] text-[#7b7b88] mt-1.5 leading-relaxed">
                Reset links expire after 30 minutes and only work once. Request
                a fresh one and it&apos;ll be in your inbox in a moment.
              </p>
              <Link to="/forgot-password">
                <Button className="w-full h-9 mt-6 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium">
                  Request a new link
                </Button>
              </Link>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(1)}
              >
                <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
                  Set a new password
                </h1>
                <p className="text-[14px] text-[#7b7b88] mt-1.5">
                  Choose something you haven&apos;t used before. This signs you
                  out everywhere else.
                </p>
              </motion.div>

              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(2)}
                className="mt-8 flex flex-col gap-4"
                onSubmit={handleSubmit}
              >
                {error && (
                  <div className="text-[13px] text-red-400 bg-red-400/10 border border-red-400/10 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-[#7b7b88]">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoFocus
                      className="w-full h-9 px-3 pr-9 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7b7b88] hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-[#7b7b88]">
                    Confirm password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-9 mt-1 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Update password"
                  )}
                </Button>
              </motion.form>
            </>
          )}
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-[#111118] border-l border-white/6">
        <div className="max-w-xs text-center">
          <div className="font-heading text-lg font-semibold text-white mb-2">
            Thumbnail
          </div>
          <p className="text-[14px] text-[#7b7b88] leading-relaxed">
            Thumbnails that drive clicks. Analyze, test, and create designs that
            actually convert.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
