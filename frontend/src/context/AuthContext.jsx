import { createContext, useContext, useState, useCallback } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const fullName = localStorage.getItem("fullName");
    const userId = localStorage.getItem("userId");
    return token ? { token, role, fullName, userId } : null;
  });

  const login = useCallback(async (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const { data } = await api.post("/api/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    persist(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/api/auth/register", payload);
    persist(data);
    return data;
  }, []);

  function persist(data) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("fullName", data.full_name);
    localStorage.setItem("userId", data.user_id);
    setAuth({ token: data.access_token, role: data.role, fullName: data.full_name, userId: data.user_id });
  }

  const logout = useCallback(() => {
    localStorage.clear();
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
