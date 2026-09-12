import { useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Lets a signed-in account add or replace its password, whatever it signed up with -
 * Google included. Supabase ties email+password sign-in to the account's email rather
 * than to a separate identity, so setting a password here is what makes the same email
 * work both ways, with no separate linking step.
 */
export const AccountPasswordForm = () => {
  const { session, setPassword } = useAuth();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!session) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setIsSubmitting(true);
    const message = await setPassword(password);
    setIsSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirm("");
  };

  return (
    <div className="section-sidebar">
      <CollapsibleSection title="Sign-in methods">
        <div className="account-password-form">
          <p>
            Signed in as <strong>{session.user.email}</strong>. Add a password below to
            also sign in with this email directly, alongside Google.
          </p>
          {error && <p className="auth-card__error" role="alert">{error}</p>}
          {success && <p className="auth-card__notice" role="status">Password set. You can now sign in with this email and password too.</p>}
          <form className="account-password-form__form" onSubmit={handleSubmit}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => { setPasswordValue(event.target.value); setSuccess(false); }}
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
                onChange={(event) => { setConfirm(event.target.value); setSuccess(false); }}
                disabled={isSubmitting}
              />
            </label>
            <button type="submit" className="account-password-form__submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Set password"}
            </button>
          </form>
        </div>
      </CollapsibleSection>
    </div>
  );
};
