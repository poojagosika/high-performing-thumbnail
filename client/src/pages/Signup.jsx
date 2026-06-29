import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await register(name, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(0)}
          >
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#737380] hover:text-white transition-colors mb-8"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(1)}
          >
            <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
              Create your account
            </h1>
            <p className="text-[14px] text-[#737380] mt-1.5">
              Start creating thumbnails that convert.
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

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-[#737380]">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-[#737380]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-[#737380]">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="w-full h-9 px-3 pr-9 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737380] hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-9 mt-1 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Create account"
              )}
            </Button>
          </motion.form>

          {/* Divider */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(3)}
            className="flex items-center gap-3 my-6"
          >
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-[12px] text-[#4a4a54]">or</span>
            <div className="flex-1 h-px bg-white/6" />
          </motion.div>

          {/* Google */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(4)}
          >
            <Button
              variant="outline"
              className="w-full h-9 text-[13px] border-white/8 text-[#737380] hover:text-white hover:border-white/12 bg-transparent font-medium"
            >
              Continue with Google
            </Button>
          </motion.div>

          {/* Terms */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(5)}
            className="text-[12px] text-[#4a4a54] text-center mt-5 leading-relaxed"
          >
            By creating an account, you agree to our{" "}
            <a
              href="#"
              className="text-[#737380] hover:text-white underline underline-offset-2"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="text-[#737380] hover:text-white underline underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </motion.p>

          {/* Login link */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(6)}
            className="text-[13px] text-[#737380] text-center mt-4"
          >
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-white hover:underline underline-offset-2"
            >
              Log in
            </Link>
          </motion.p>
        </div>
      </div>

      {/* Right — decorative panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-[#111118] border-l border-white/6">
        <div className="max-w-xs text-center">
          <div className="font-heading text-lg font-semibold text-white mb-2">
            ThumbCraft
          </div>
          <p className="text-[14px] text-[#737380] leading-relaxed">
            Join 10,000+ creators making thumbnails that get clicked.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;
