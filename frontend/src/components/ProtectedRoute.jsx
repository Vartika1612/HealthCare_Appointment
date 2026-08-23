import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ role, children }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (role && auth.role !== role) return <Navigate to={`/${auth.role}`} replace />;
  return children;
}
