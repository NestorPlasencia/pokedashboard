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

type AuthContextValue = {
  session: Session | null;
  isAuthLoading: boolean;
  inventoryRevision: number;
  refreshInventory: () => void;
  /**
   * A lighter signal than `refreshInventory`: it tells `useLoadCards` to re-read the
   * cached snapshot (already updated in place by `patchInventoryCopy`) without forcing a
   * network refetch. Used after a single add/remove that already patched the cache, so a
   * write to one card does not re-download the whole inventory just to reflect itself.
   */
  inventoryPatchTick: number;
  notifyInventoryPatched: () => void;
  requestSignIn: () => void;
  signOut: () => Promise<void>;
  /**
   * Adds or replaces the password on the signed-in account, whatever it was created
   * with. Supabase ties email+password sign-in to the account's email rather than to a
   * separate identity, so this is what lets a Google account also sign in with a
   * password - no linking step, just set one while already signed in with Google.
   * Returns an error message, or null on success.
   */
  setPassword: (password: string) => Promise<string | null>;
  /**
   * Emails a recovery link for the given address. Clicking it brings the browser back
   * here with a short-lived recovery session - `onAuthStateChange` fires
   * `PASSWORD_RECOVERY` for it, which opens the form that calls `setPassword` to finish.
   * Returns an error message, or null once the email is on its way.
   */
  requestPasswordReset: (email: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthForm = ({ onClose }: { onClose: () => void }) => {
  const { requestPasswordReset } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Sign in is the default - most visits are a returning user - and switches to sign up
  // or reset only on request, so a typo'd email doesn't accidentally create a second
  // account, and "forgot password" doesn't need its own separate entry point.
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Supabase rate-limits /recover per email (a 429 past a couple of requests a minute).
  // A client-side cooldown after each attempt keeps a second click from ever reaching
  // that limit instead of just showing whatever message comes back once it already has.
  const [resetCooldown, setResetCooldown] = useState(0);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setInterval(() => setResetCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resetCooldown]);

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Supabase owns the provider callback; this is only the final URL where the
        // hosted flow returns the browser after the session is created.
        redirectTo: window.location.origin,
      },
    });
    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (mode === "reset" && resetCooldown > 0) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    if (mode === "reset") {
      const message = await requestPasswordReset(email);
      if (message) {
        setError(message);
        // Supabase's own message names the wait ("...after 46 seconds"); fall back to a
        // flat guess when it doesn't, so a click still can't fire right into another 429.
        const seconds = Number(message.match(/(\d+)\s*seconds?/)?.[1]);
        setResetCooldown(Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
      } else {
        setNotice("If that email has an account, a reset link is on its way.");
        setResetCooldown(60);
      }
    } else if (mode === "signIn") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      // A successful sign-in fires onAuthStateChange, which closes this form itself.
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else if (data.user && data.user.identities?.length === 0) {
        // Supabase hides "this email already exists" behind a look-alike success to
        // avoid leaking which emails have accounts - an empty identities array is the
        // tell. Likely a Google account: sign in with that, then set a password for it
        // from Settings, since that ties a password to the same email either way.
        setError("An account with this email already exists. Sign in with Google instead, then add a password for it from Settings.");
        setMode("signIn");
      } else if (!data.session) {
        // Email confirmation is on: there is a genuinely new account, but no session yet.
        setNotice("Check your email to confirm the account, then sign in.");
        setMode("signIn");
      }
    }
    setIsSubmitting(false);
  };

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="auth-card">
        <button className="auth-card__close" type="button" onClick={onClose} aria-label="Close sign in">
          ×
        </button>
        <h1 id="auth-title">{mode === "reset" ? "Reset your password" : "Sign in to Collections"}</h1>
        <p>
          {mode === "reset"
            ? "Enter the email on the account and we'll send a link to set a new password."
            : "Your Collectr inventory is private and requires a Supabase session."}
        </p>
        {error && <div className="auth-card__error" role="alert">{error}</div>}
        {notice && <div className="auth-card__notice" role="status">{notice}</div>}
        {mode !== "reset" && (
          <>
            <button type="button" onClick={handleGoogleSignIn} disabled={isSubmitting}>
              {isSubmitting ? "Connecting..." : "Continue with Google"}
            </button>
            <div className="auth-card__divider"><span>or</span></div>
          </>
        )}
        <form className="auth-card__form" onSubmit={handlePasswordSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
            />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
              />
            </label>
          )}
          {mode === "signIn" && (
            <button
              type="button"
              className="auth-card__mode-toggle auth-card__forgot"
              onClick={() => { setMode("reset"); setError(null); setNotice(null); }}
              disabled={isSubmitting}
            >
              Forgot password?
            </button>
          )}
          <button type="submit" disabled={isSubmitting || (mode === "reset" && resetCooldown > 0)}>
            {isSubmitting
              ? "Please wait..."
              : mode === "reset" && resetCooldown > 0 ? `Resend in ${resetCooldown}s`
                : mode === "signIn" ? "Sign in" : mode === "signUp" ? "Create account" : "Send reset link"}
          </button>
        </form>
        <button
          type="button"
          className="auth-card__mode-toggle"
          onClick={() => {
            setMode((current) => (current === "signUp" ? "signIn" : current === "reset" ? "signIn" : "signUp"));
            setError(null);
            setNotice(null);
          }}
          disabled={isSubmitting}
        >
          {mode === "signIn" ? "Need an account? Sign up"
            : mode === "signUp" ? "Already have an account? Sign in"
              : "Back to sign in"}
        </button>
      </div>
    </div>
  );
};

/** Shown once the recovery link's redirect lands back here, in place of the sign-in form. */
const PasswordRecoveryForm = ({ onClose }: { onClose: () => void }) => {
  const { setPassword } = useAuth();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const message = await setPassword(password);
    setIsSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <div className="auth-card">
        <button className="auth-card__close" type="button" onClick={onClose} aria-label="Close">×</button>
        <h1 id="recovery-title">Choose a new password</h1>
        {done ? (
          <>
            <p>Your password is set. Use it to sign in from now on.</p>
            <button type="button" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p>You followed a password reset link. Pick a new password to finish.</p>
            {error && <div className="auth-card__error" role="alert">{error}</div>}
            <form className="auth-card__form" onSubmit={handleSubmit}>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Set password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [inventoryPatchTick, setInventoryPatchTick] = useState(0);
  // Set when the recovery link's redirect lands back here - Supabase turns it into a
  // real (short-lived) session and fires this event for it, rather than a normal sign-in.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("[auth] Unable to restore the Supabase session", error);
      setSession(data.session);
      setIsAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      clearInventoryCache();
      setSession(next);
      setIsAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setIsSignInOpen(false);
      } else if (next) {
        setIsSignInOpen(false);
      }
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
        setInventoryRevision((current) => current + 1);
      },
      inventoryPatchTick,
      notifyInventoryPatched: () => {
        setInventoryPatchTick((current) => current + 1);
      },
      requestSignIn: () => setIsSignInOpen(true),
      signOut: async () => {
        if (!supabase) return;
        clearInventoryCache({
          userId: session?.user.id,
          includePersistent: true,
        });
        await supabase.auth.signOut();
      },
      setPassword: async (password: string) => {
        if (!supabase) return "Supabase is not configured.";
        const { error } = await supabase.auth.updateUser({ password });
        return error ? error.message : null;
      },
      requestPasswordReset: async (email: string) => {
        if (!supabase) return "Supabase is not configured.";
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        return error ? error.message : null;
      },
    }),
    [session, isAuthLoading, inventoryRevision, inventoryPatchTick]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isPasswordRecovery && session ? (
        <PasswordRecoveryForm onClose={() => setIsPasswordRecovery(false)} />
      ) : isSignInOpen && !session && (
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
