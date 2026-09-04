import { createContext, useContext, useState, useEffect } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password, turnstileToken) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: { email, password, turnstileToken },
    });
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password, turnstileToken) => {
    const data = await api("/auth/register", {
      method: "POST",
      body: { name, email, password, turnstileToken },
    });
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  };

  const logoutAll = async () => {
    const data = await api("/auth/logout-all", { method: "POST" });
    setUser(null);
    return data;
  };

  const deleteAccount = async (password) => {
    const data = await api("/auth/account", {
      method: "DELETE",
      body: { password },
    });
    setUser(null);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        register,
        logout,
        logoutAll,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
