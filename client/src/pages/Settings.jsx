import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, User, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import api from "../lib/api";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setProfileError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setProfileError("Name and email are required");
      return;
    }

    if (trimmedName === user.name && trimmedEmail === user.email) {
      setProfileError("No changes to save");
      return;
    }

    setProfileSaving(true);
    try {
      const data = await api("/auth/profile", {
        method: "PATCH",
        body: { name: trimmedName, email: trimmedEmail },
      });
      setUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All fields are required");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordSaving(true);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <DashboardNav />

      <main className="max-w-xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#737380] hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
          className="mb-8"
        >
          <h1 className="font-heading text-2xl font-semibold text-white tracking-[-0.01em]">
            Settings
          </h1>
          <p className="text-[14px] text-[#737380] mt-1">Manage your account</p>
        </motion.div>

        {/* Profile section */}
        <motion.form
          onSubmit={handleProfileUpdate}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#737380]" />
            <h2 className="text-[14px] font-medium text-white">Profile</h2>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[12px] text-[#737380] mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#737380] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
          </div>

          {profileError && (
            <p className="text-[12px] text-red-400 mt-3">{profileError}</p>
          )}

          <div className="flex justify-end mt-4">
            <Button
              type="submit"
              disabled={profileSaving}
              className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              {profileSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </motion.form>

        {/* Password section */}
        <motion.form
          onSubmit={handlePasswordChange}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-[#737380]" />
            <h2 className="text-[14px] font-medium text-white">
              Change Password
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[12px] text-[#737380] mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#737380] mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#737380] mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#4a4a54] outline-none focus:border-white/16 transition-colors"
              />
            </div>
          </div>

          {passwordError && (
            <p className="text-[12px] text-red-400 mt-3">{passwordError}</p>
          )}

          <div className="flex justify-end mt-4">
            <Button
              type="submit"
              disabled={passwordSaving}
              className="h-8 text-[13px] bg-white text-[#0a0a0f] hover:bg-white/90 font-medium gap-1.5"
            >
              {passwordSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              Update Password
            </Button>
          </div>
        </motion.form>
      </main>
    </div>
  );
}

export default Settings;
