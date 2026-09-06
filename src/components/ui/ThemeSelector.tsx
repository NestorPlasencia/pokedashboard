import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

type ThemePreference = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

const STORAGE_KEY = "pokedashboard-theme";
const systemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const readPreference = (): ThemePreference => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
};

export const ThemeSelector = () => {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = preference === "system" ? systemTheme() : preference;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = preference;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#0b1020" : "#ffffff"
      );
    };

    applyTheme();
    if (preference === "system") media.addEventListener("change", applyTheme);

    return () => media.removeEventListener("change", applyTheme);
  }, [preference]);

  const handleChange = (nextPreference: ThemePreference) => {
    if (nextPreference === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, nextPreference);
    }
    setPreference(nextPreference);
  };

  return (
    <div className="theme-selector">
      <span className="theme-selector__label" id="theme-selector-label">Appearance</span>
      <div className="theme-selector__options" role="group" aria-labelledby="theme-selector-label">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            className={`theme-selector__option${preference === value ? " is-active" : ""}`}
            aria-pressed={preference === value}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => handleChange(value)}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
};
