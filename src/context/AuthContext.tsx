import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../services/supabase";
import { clearInventoryCache } from "../services/inventory";
import { clearRuntimeCardsCache } from "../services/runtimeCards";

type AuthContextValue = {
  session: Session | null;
  isAuthLoading: boolean;
  inventoryRevision: number;
  refreshInventory: () => void;
  requestSignIn: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthForm = ({ onClose }: { onClose: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) setError(signInError.message);
    setIsSubmitting(false);
  };

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <form className="auth-card" onSubmit={handleSubmit}>
        <button className="auth-card__close" type="button" onClick={onClose} aria-label="Close sign in">
          ×
        </button>
        <div className="app-brand auth-card__brand">
          <span className="app-brand__mark" aria-hidden="true">P</span>
          <span className="app-brand__name">PokéDashboard</span>
        </div>
        <h1 id="auth-title">Sign in to Collections</h1>
        <p>Your Collectr inventory is private and requires a Supabase session.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <div className="auth-card__error" role="alert">{error}</div>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [inventoryRevision, setInventoryRevision] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setIsAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      clearInventoryCache();
      clearRuntimeCardsCache();
      setSession(next);
      setIsAuthLoading(false);
      if (next) setIsSignInOpen(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthLoading,
      inventoryRevision,
      refreshInventory: () => {
        clearInventoryCache();
        clearRuntimeCardsCache();
        setInventoryRevision((current) => current + 1);
      },
      requestSignIn: () => setIsSignInOpen(true),
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
      },
    }),
    [session, isAuthLoading, inventoryRevision]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isSignInOpen && !session && (
        isSupabaseConfigured ? (
          <AuthForm onClose={() => setIsSignInOpen(false)} />
        ) : (
          <div className="auth-modal" role="dialog" aria-modal="true">
            <div className="auth-card" role="alert">
              <button className="auth-card__close" type="button" onClick={() => setIsSignInOpen(false)} aria-label="Close">×</button>
              <h1>Supabase is not configured</h1>
              <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the app.</p>
            </div>
          </div>
        )
      )}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
