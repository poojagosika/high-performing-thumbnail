import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  User,
  Lock,
  Loader2,
  Camera,
  MonitorSmartphone,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardNav from "../components/DashboardNav";
import DeleteAccountModal from "../components/DeleteAccountModal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import api, { uploadFile } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const stagger = (i) => ({ duration: 0.4, delay: i * 0.06, ease: "easeOut" });

function Settings() {
  const { user, setUser, logoutAll, deleteAccount } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [signingOutAll, setSigningOutAll] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSignOutEverywhere = async () => {
    setSigningOutAll(true);
    try {
      await logoutAll();
      toast.success("Signed out of all devices");
      navigate("/login");
    } catch (err) {
      toast.error(err.message || "Failed to sign out");
      setSigningOutAll(false);
    }
  };

  const handleDeleteAccount = async (password) => {
    await deleteAccount(password);
    toast.success("Your account has been deleted");
    navigate("/");
  };

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef(null);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    setAvatarUploading(true);
    try {
      const data = await uploadFile("/auth/avatar", formData);
      setUser(data.user);
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err.message || "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  };

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

      <main id="main" className="max-w-xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#7b7b88] hover:text-white transition-colors mb-6"
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
          <p className="text-[14px] text-[#7b7b88] mt-1">Manage your account</p>
        </motion.div>

        {/* Avatar section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-4 h-4 text-[#7b7b88]" />
            <h2 className="text-[14px] font-medium text-white">Avatar</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group">
              {user?.avatar ? (
                <img
                  src={assetUrl(user.avatar)}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover border border-white/6"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/6 border border-white/6 flex items-center justify-center">
                  <span className="font-heading text-xl font-semibold text-white">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <button
                aria-label="Upload a new avatar"
                type="button"
                onClick={() => avatarRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {avatarUploading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-white" />
                )}
              </button>
              <input
                ref={avatarRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-[13px] text-white">{user?.name}</p>
              <p className="text-[12px] text-[#61616b] mt-0.5">
                Click to upload (JPEG, PNG, WebP)
              </p>
            </div>
          </div>
        </motion.div>

        {/* Profile section */}
        <motion.form
          onSubmit={handleProfileUpdate}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#7b7b88]" />
            <h2 className="text-[14px] font-medium text-white">Profile</h2>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
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
          transition={stagger(4)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-[#7b7b88]" />
            <h2 className="text-[14px] font-medium text-white">
              Change Password
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#7b7b88] mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/8 bg-white/3 text-[14px] text-white placeholder:text-[#7b7b88] outline-none focus:border-white/16 transition-colors"
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

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(5)}
          className="rounded-xl border border-white/6 bg-[#111118] p-5 mt-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <MonitorSmartphone className="w-4 h-4 text-[#7b7b88]" />
            <h2 className="text-[14px] font-medium text-white">Sessions</h2>
          </div>

          <p className="text-[13px] text-[#7b7b88]">
            Signs out every browser and device where you are logged in,
            including this one. Use it if you have signed in somewhere you no
            longer trust.
          </p>

          <div className="flex justify-end mt-4">
            <Button
              onClick={handleSignOutEverywhere}
              disabled={signingOutAll}
              variant="outline"
              className="h-8 text-[13px] border-white/8 text-[#7b7b88] hover:text-white hover:border-white/12 bg-transparent font-medium gap-1.5"
            >
              {signingOutAll && <Loader2 className="w-3 h-3 animate-spin" />}
              Sign Out Everywhere
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(6)}
          className="rounded-xl border border-red-400/20 bg-[#111118] p-5 mt-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-[14px] font-medium text-white">Danger Zone</h2>
          </div>

          <p className="text-[13px] text-[#7b7b88]">
            Permanently delete your account and everything in it — thumbnails,
            versions, collections, comparisons and share links. This cannot be
            undone.
          </p>

          <div className="flex justify-end mt-4">
            <Button
              onClick={() => setDeleteOpen(true)}
              className="h-8 text-[13px] bg-red-500 text-white hover:bg-red-500/90 font-medium"
            >
              Delete Account
            </Button>
          </div>
        </motion.div>
      </main>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}

export default Settings;
