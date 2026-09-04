import { useState, useCallback } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../lib/api";
import Turnstile from "../components/Turnstile";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const handleTurnstileToken = useCallback((t) => setTurnstileToken(t), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: { email, turnstileToken },
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
      setTurnstileReset((n) => n + 1);
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

          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(1)}
            >
              <div className="w-9 h-9 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center mb-4">
                <MailCheck className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
                Check your inbox
              </h1>
              <p className="text-[14px] text-[#7b7b88] mt-1.5 leading-relaxed">
                If an account exists for{" "}
                <span className="text-white">{email}</span>, a reset link is on
                its way. It expires in 30 minutes and can only be used once.
              </p>
              <p className="text-[13px] text-[#61616b] mt-4 leading-relaxed">
                Nothing arrived? Check your spam folder, or try again in a
                minute.
              </p>
              <Button
                onClick={() => setSent(false)}
                variant="outline"
                className="w-full h-9 mt-6 text-[13px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium"
              >
                Use a different email
              </Button>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(1)}
              >
                <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
                  Forgot your password?
                </h1>
                <p className="text-[14px] text-[#7b7b88] mt-1.5">
                  Enter your email and we&apos;ll send you a link to set a new
                  one.
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
                  <label className="text-[13px] text-[#7b7b88]">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
                  />
                </div>

                <Turnstile
                  onToken={handleTurnstileToken}
                  resetSignal={turnstileReset}
                />

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-9 mt-1 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </motion.form>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stagger(3)}
                className="text-[13px] text-[#7b7b88] text-center mt-6"
              >
                Remembered it?{" "}
                <Link
                  to="/login"
                  className="text-white hover:underline underline-offset-2"
                >
                  Log in
                </Link>
              </motion.p>
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

export default ForgotPassword;
