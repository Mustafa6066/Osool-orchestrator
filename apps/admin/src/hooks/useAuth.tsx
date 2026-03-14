import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { isAuthenticated, login as apiLogin, logout as apiLogout } from '../api/client';

interface AuthCtx {
  authed: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  authed: false,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setAuthed(isAuthenticated());
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
