import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";
import { useOfflineStatus } from "../../hooks/useOfflineStatus";
import {
  ALL_CACHE_NAMES,
  clearCaches,
  readCacheOverview,
  type CacheOverview,
} from "../../services/offlineCache";
import { unregisterServiceWorker } from "../../services/serviceWorker";

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};

const formatWhen = (timestamp: number): string => {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString();
};

const STATUS_LABELS: Record<CacheOverview["serviceWorker"], string> = {
  active: "Images are being saved for offline use.",
  starting: "Image caching is starting up…",
  unregistered: "Image caching starts after the next reload.",
  unsupported: "This browser cannot cache images offline.",
};

export const CachePanel = () => {
  const { online, servingStale, oldestStoredAt } = useOfflineStatus();
  const [overview, setOverview] = useState<CacheOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      setOverview(await readCacheOverview());
    } catch (error) {
      console.warn("[cache] Unable to read the cache overview", error);
      setOverview(null);
    }
  }, []);

  // Reading the overview walks every cache entry, so it happens on demand rather than on
  // every render of the sidebar. The second read is for the worker: on a first visit it is
  // still installing when the panel first looks, and would otherwise stay reported as
  // missing until the user pressed Recheck.
  useEffect(() => {
    refresh();
    navigator.serviceWorker?.ready.then(refresh).catch(() => undefined);
  }, [refresh]);

  const clear = async (names: string[], label: string) => {
    setBusy(true);
    setNotice("");
    try {
      await clearCaches(names);
      await refresh();
      // The loaders keep their own in-memory copies, so what is on screen right now did
      // not come back from the network just because the stored copy is gone.
      setNotice(`${label} cleared. Reload to fetch it again.`);
    } catch (error) {
      console.warn("[cache] Unable to clear caches", error);
      setNotice("Could not clear the cache. Check your browser storage permissions.");
    } finally {
      setBusy(false);
    }
  };

  const resetEverything = async () => {
    setBusy(true);
    setNotice("");
    try {
      await clearCaches(ALL_CACHE_NAMES);
      await unregisterServiceWorker();
      window.location.reload();
    } catch (error) {
      console.warn("[cache] Unable to reset offline storage", error);
      setNotice("Could not reset offline storage.");
      setBusy(false);
    }
  };

  const summary = !online
    ? "Offline"
    : servingStale
      ? "Saved data"
      : overview?.usage != null
        ? formatBytes(overview.usage)
        : undefined;

  return (
    <div className="section-sidebar">
      <CollapsibleSection
        title="Offline & cache"
        defaultCollapsed={true}
        persistKey="offline-cache"
        collapsedSummary={summary && <div className="filter-collapsed-summary">{summary}</div>}
      >
        <div className="cache-panel">
          {!online && (
            <p className="cache-panel__status cache-panel__status--warning" role="status">
              <WifiOff size={13} aria-hidden="true" />
              You are offline. Saved data is being used.
            </p>
          )}
          {servingStale && oldestStoredAt !== null && (
            <p className="cache-panel__status cache-panel__status--warning" role="status">
              Showing data saved {formatWhen(oldestStoredAt)}; prices may be out of date.
            </p>
          )}

          <ul className="cache-panel__list">
            {overview?.reports.map((report) => (
              <li key={report.name} className="cache-panel__row">
                <div className="cache-panel__info">
                  <strong>{report.label}</strong>
                  <small>{report.description}</small>
                  <small className="cache-panel__metrics">
                    {report.entries === 0
                      ? "Nothing saved"
                      : `${report.entries.toLocaleString()} item${report.entries === 1 ? "" : "s"}${report.bytes !== null ? ` · ${formatBytes(report.bytes)}` : ""}`}
                  </small>
                </div>
                <button
                  type="button"
                  className="cache-panel__clear"
                  disabled={busy || report.entries === 0}
                  onClick={() => clear([report.name], report.label)}
                  aria-label={`Clear ${report.label} cache`}
                  title={`Clear ${report.label}`}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
            {!overview && <li><small>Reading cache usage…</small></li>}
          </ul>

          {overview && (
            <small className="cache-panel__total">
              <HardDrive size={12} aria-hidden="true" />
              {overview.usage !== null
                ? `${formatBytes(overview.usage)} used${overview.quota ? ` of ${formatBytes(overview.quota)} available` : ""}`
                : "Total usage unavailable in this browser"}
            </small>
          )}
          <small className="cache-panel__total">{STATUS_LABELS[overview?.serviceWorker ?? "unregistered"]}</small>

          <div className="cache-panel__actions">
            <button type="button" onClick={refresh} disabled={busy}>
              <RefreshCw size={12} aria-hidden="true" /> Recheck
            </button>
            <button type="button" className="cache-panel__reset" onClick={resetEverything} disabled={busy}>
              <Trash2 size={12} aria-hidden="true" /> Clear everything and reload
            </button>
          </div>
          {notice && <small role="status">{notice}</small>}
        </div>
      </CollapsibleSection>
    </div>
  );
};
