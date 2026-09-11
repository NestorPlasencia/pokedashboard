import { useMemo, useState } from "react";
import { Check, Eye, Lock, Pencil, PencilOff, Plus, RefreshCw, TextCursorInput, Trash2, X } from "lucide-react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { useAuth } from "../../context/AuthContext";
import { useOwnedCollections } from "../../context/OwnedCollectionsContext";
import type { InventoryStatus } from "../../hooks/useLoadCards";
import type { OptionsCollection } from "../../types/dashboard";
import { CATALOG_VIEW } from "../../utils/viewMode";
import { navigate } from "../../utils/route";
import { childrenByParent, collectionSubtree } from "../../utils/collectionTree";
import { AppNav } from "../ui/AppNav";

type CollectionsPageProps = {
  inventoryStatus: InventoryStatus;
  inventoryUpdatedAt: number | null;
  /** Cards per collection name, or null until the inventory has loaded. */
  cardCounts: Map<string, number> | null;
  /** Physical copies per collection name, or null until the inventory has loaded. */
  copyCounts: Map<string, number> | null;
};

type Group = {
  key: string;
  title: string;
  description: string;
  empty: string;
  items: OptionsCollection[];
};

/**
 * Where collections are managed: created and nested, renamed, deleted, chosen as the
 * destination for the cards you add, and opened in the catalog.
 *
 * The catalog keeps only what shapes the card list - filtering by collection. Everything
 * that changes the collections themselves lives here, where a destructive action can ask
 * before it acts and a name has room to be read.
 */
export const CollectionsPage = ({ inventoryStatus, inventoryUpdatedAt, cardCounts, copyCounts }: CollectionsPageProps) => {
  const { collections } = useOptionsContext();
  const { collectionFilter, setCollectionFilter, viewMode, setViewMode } = useCardContext();
  const { session, isAuthLoading, refreshInventory, requestSignIn, signOut } = useAuth();
  const owned = useOwnedCollections();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState<{ parentId: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const childrenOf = useMemo(() => childrenByParent(collections), [collections]);

  // Groups hold top-level collections; each one's subcollections are drawn under it.
  const topLevel = collections.filter((collection) => collection.parentId === null);
  const groups: Group[] = [
    {
      key: "owned",
      title: "Your collections",
      description: "Created here for the cards you buy outside Collectr. Nest them to keep related cards together.",
      empty: "No collections yet. Create one to start recording the cards you buy.",
      items: topLevel.filter((collection) => collection.editable && collection.kind === "owned"),
    },
    {
      key: "collectr",
      title: "Synced from Collectr",
      description: "Read-only here: the Collectr extension rebuilds them on every sync.",
      empty: "Nothing synced from Collectr yet.",
      items: topLevel.filter((collection) => !collection.editable && collection.kind === "owned"),
    },
    {
      key: "wishlist",
      title: "Wishlists",
      description: "Created and edited from the Wishlists panel in the catalog.",
      empty: "No wishlists yet.",
      items: topLevel.filter((collection) => collection.kind === "wishlist"),
    },
  ];

  const isInventoryBusy = inventoryStatus === "loading" || inventoryStatus === "refreshing";
  // The list arrives once the catalog has finished its first load, which can take a moment
  // on a cold start; an empty page in that window would read as "you have none".
  const isListLoading = collections.length === 0 && inventoryStatus !== "ready" && inventoryStatus !== "error";

  // A collection counts the cards of its subcollections too - the same cards Browse shows.
  const countLabel = (collection: OptionsCollection) => {
    if (cardCounts === null) return "…";
    const count = collectionSubtree(collections, collection.name)
      .reduce((sum, entry) => sum + (cardCounts.get(entry.name) ?? 0), 0);
    const copies = collectionSubtree(collections, collection.name)
      .reduce((sum, entry) => sum + (copyCounts?.get(entry.name) ?? 0), 0);
    const cardLabel = count === 1 ? "1 card" : `${count.toLocaleString()} cards`;
    if (copies <= count) return cardLabel;
    const copyLabel = copies === 1 ? "1 copy" : `${copies.toLocaleString()} copies`;
    return `${cardLabel} · ${copyLabel}`;
  };

  const browse = (name: string) => {
    setViewMode({ kind: "collection", name });
    navigate("catalog");
  };

  // Collections are addressed by name in the view mode and in the filter, so both follow a
  // rename and let go of deleted collections instead of pointing at nothing.
  const followRename = (from: string, to: string) => {
    if (viewMode.kind === "collection" && viewMode.name === from) setViewMode({ kind: "collection", name: to });
    if (collectionFilter.selectedCollections.includes(from)) {
      setCollectionFilter((prev) => ({
        ...prev,
        selectedCollections: prev.selectedCollections.map((name) => (name === from ? to : name)),
      }));
    }
  };

  const forget = (names: string[]) => {
    if (viewMode.kind === "collection" && names.includes(viewMode.name)) setViewMode(CATALOG_VIEW);
    if (collectionFilter.selectedCollections.some((name) => names.includes(name))) {
      setCollectionFilter((prev) => {
        const selectedCollections = prev.selectedCollections.filter((entry) => !names.includes(entry));
        return {
          ...prev,
          enabled: selectedCollections.length > 0,
          selectedCollections,
        };
      });
    }
  };

  // Opening one inline editor closes the others, so only one form is ever open.
  const startAction = () => {
    setNotice("");
    setConfirmingDelete("");
    setRenaming(null);
    setSubDraft(null);
  };

  const handleCreate = async () => {
    if (draftName === null) return;
    const name = draftName.trim();
    if (!name) return;
    // The row is written before the form closes, so a failure leaves the name in the box.
    if (!(await owned.create(name))) return;
    setDraftName(null);
    setNotice(`${name} created. Cards you add in the catalog now go there.`);
  };

  const handleCreateSub = async (parent: OptionsCollection) => {
    if (!subDraft) return;
    const name = subDraft.name.trim();
    if (!name) return;
    setBusyId(parent.id);
    const created = await owned.create(name, parent.id);
    setBusyId("");
    if (!created) return;
    setSubDraft(null);
    setNotice(`${name} created inside ${parent.name}. Cards you add in the catalog now go there.`);
  };

  const handleRename = async (collection: OptionsCollection) => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name || name === collection.name) {
      setRenaming(null);
      return;
    }
    setBusyId(collection.id);
    const renamed = await owned.rename(collection.id, name);
    setBusyId("");
    if (!renamed) return;
    followRename(collection.name, name);
    setRenaming(null);
    setNotice(`${collection.name} renamed to ${name}.`);
  };

  const handleDelete = async (collection: OptionsCollection) => {
    // Read before the delete: the subcollections go with it.
    const subtree = collectionSubtree(collections, collection.name);
    setBusyId(collection.id);
    const removed = await owned.remove(collection.id);
    setBusyId("");
    setConfirmingDelete("");
    if (!removed) return;
    forget(subtree.map((entry) => entry.name));
    // The context only disarms the deleted collection itself; a subcollection that was the
    // destination is gone too.
    if (subtree.some((entry) => entry.id === owned.selectedId)) owned.setSelectedId("");
    setNotice(`${collection.name} deleted.`);
  };

  const deleteQuestion = (collection: OptionsCollection) => {
    const subcollections = collectionSubtree(collections, collection.name).length - 1;
    if (subcollections === 0) return `Delete ${collection.name} and its ${countLabel(collection)}?`;
    const nested = subcollections === 1 ? "1 subcollection" : `${subcollections} subcollections`;
    return `Delete ${collection.name}, its ${nested} and ${countLabel(collection)}?`;
  };

  const renderRow = (collection: OptionsCollection, depth: number) => {
    const isTarget = owned.selectedId === collection.id;
    const isBusy = busyId === collection.id;
    const isRenaming = renaming?.id === collection.id;
    const isConfirming = confirmingDelete === collection.id;
    const isAddingSub = subDraft?.parentId === collection.id;
    // Subcollections of your own collections are yours too; Collectr's stay read-only.
    const canManage = collection.editable && collection.kind === "owned" && Boolean(collection.id);
    const children = collection.id ? childrenOf.get(collection.id) ?? [] : [];

    return (
      <li key={collection.id || collection.name} className="collections-page__item">
        <div className={`collections-page__row${isTarget ? " is-target" : ""}`}>
          <div className="collections-page__info">
            {isRenaming ? (
              <form
                className="collections-page__form"
                onSubmit={(event) => { event.preventDefault(); handleRename(collection); }}
              >
                <input
                  autoFocus
                  aria-label={`New name for ${collection.name}`}
                  value={renaming.name}
                  maxLength={120}
                  required
                  disabled={isBusy}
                  onChange={(event) => setRenaming({ id: collection.id, name: event.target.value })}
                  onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }}
                />
                <button type="submit" className="collections-page__btn collections-page__btn--primary" disabled={isBusy || !renaming.name.trim()}>
                  <Check size={14} aria-hidden="true" /> Save
                </button>
                <button type="button" className="collections-page__btn" onClick={() => setRenaming(null)} disabled={isBusy}>
                  Cancel
                </button>
              </form>
            ) : (
              <span className="collections-page__name">
                {collection.name}
                {!collection.editable && <Lock size={12} aria-label="Read-only" />}
              </span>
            )}
            <span className="collections-page__meta">
              <span>{countLabel(collection)}</span>
              {children.length > 0 && (
                <span>{children.length === 1 ? "1 subcollection" : `${children.length} subcollections`}</span>
              )}
              {/* The printings behind the collection, so its type is readable without opening it. */}
              {collection.printings.map((printing) => (
                <span key={printing} className="collection-printing-tag">{printing}</span>
              ))}
              {isTarget && <span className="collections-page__armed-tag">Adding cards here</span>}
            </span>
          </div>

          {isConfirming ? (
            <div className="collections-page__actions collections-page__confirm" role="group" aria-label={`Confirm deleting ${collection.name}`}>
              <span>{deleteQuestion(collection)}</span>
              <button type="button" className="collections-page__btn collections-page__btn--danger" onClick={() => handleDelete(collection)} disabled={isBusy}>
                <Trash2 size={14} aria-hidden="true" /> {isBusy ? "Deleting…" : "Delete"}
              </button>
              <button type="button" className="collections-page__btn" onClick={() => setConfirmingDelete("")} disabled={isBusy}>
                Cancel
              </button>
            </div>
          ) : !isRenaming && (
            <div className="collections-page__actions">
              {/* Adding is armed on purpose, never as a side effect of opening a collection, so
                  a stray click on a card cannot record a purchase. */}
              {canManage && (
                <button
                  type="button"
                  className={`collections-page__btn${isTarget ? " is-armed" : ""}`}
                  aria-pressed={isTarget}
                  title={isTarget ? `Stop adding cards to ${collection.name}` : `Cards you add in the catalog go to ${collection.name}`}
                  onClick={() => { startAction(); owned.setSelectedId(isTarget ? "" : collection.id); }}
                >
                  {isTarget ? <PencilOff size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
                  {isTarget ? "Stop adding" : "Add cards here"}
                </button>
              )}
              <button
                type="button"
                className="collections-page__btn"
                title={children.length > 0
                  ? `Open ${collection.name} and its subcollections in the catalog`
                  : `Open ${collection.name} in the catalog`}
                onClick={() => browse(collection.name)}
              >
                <Eye size={14} aria-hidden="true" /> Browse
              </button>
              {canManage && (
                <>
                  <button
                    type="button"
                    className="collections-page__btn"
                    aria-label={`Add a subcollection to ${collection.name}`}
                    onClick={() => { startAction(); setDraftName(null); setSubDraft({ parentId: collection.id, name: "" }); }}
                    disabled={owned.remoteUnavailable}
                  >
                    <Plus size={14} aria-hidden="true" /> Subcollection
                  </button>
                  <button
                    type="button"
                    className="collections-page__btn"
                    aria-label={`Rename ${collection.name}`}
                    onClick={() => { startAction(); setRenaming({ id: collection.id, name: collection.name }); }}
                  >
                    <TextCursorInput size={14} aria-hidden="true" /> Rename
                  </button>
                  <button
                    type="button"
                    className="collections-page__btn collections-page__btn--danger"
                    aria-label={`Delete ${collection.name}`}
                    onClick={() => { startAction(); setConfirmingDelete(collection.id); }}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isAddingSub && (
          <form
            className="collections-page__form collections-page__form--sub"
            onSubmit={(event) => { event.preventDefault(); handleCreateSub(collection); }}
          >
            <input
              autoFocus
              placeholder="Subcollection name"
              aria-label={`New subcollection in ${collection.name}`}
              value={subDraft.name}
              maxLength={120}
              required
              disabled={isBusy}
              onChange={(event) => setSubDraft({ parentId: collection.id, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Escape") setSubDraft(null); }}
            />
            <button type="submit" className="collections-page__btn collections-page__btn--primary" disabled={isBusy || !subDraft.name.trim()}>
              <Check size={14} aria-hidden="true" /> Create
            </button>
            <button type="button" className="collections-page__btn" onClick={() => setSubDraft(null)} disabled={isBusy}>
              Cancel
            </button>
          </form>
        )}

        {children.length > 0 && (
          <ul className="collections-page__children" aria-label={`Subcollections of ${collection.name}`}>
            {children.map((child) => renderRow(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const renderContent = () => {
    if (isAuthLoading) {
      return <p className="collections-page__notice" role="status">Checking your session…</p>;
    }
    if (!session) {
      return (
        <div className="collections-page__signin">
          <Lock size={22} aria-hidden="true" />
          <h2>Your collections are private</h2>
          <p>Sign in to create collections, choose where new cards go and browse what you own.</p>
          <button type="button" className="collections-page__btn collections-page__btn--primary" onClick={requestSignIn}>
            Sign in with Google
          </button>
        </div>
      );
    }

    return (
      <>
        {owned.selected && (
          <div className="collections-page__notice collections-page__notice--armed" role="status">
            <span>Cards you add in the catalog go to <strong>{owned.selected.name}</strong>.</span>
            <button type="button" className="collections-page__btn" onClick={() => navigate("catalog")}>
              Go to catalog
            </button>
            <button type="button" className="collections-page__btn" onClick={() => owned.setSelectedId("")}>
              <X size={14} aria-hidden="true" /> Stop adding
            </button>
          </div>
        )}
        {owned.remoteUnavailable && (
          <p className="collections-page__notice collections-page__notice--error">
            Apply the shared Supabase schema and its RLS policies to create and edit collections here.
          </p>
        )}
        {owned.error && <p className="collections-page__notice collections-page__notice--error" role="alert">{owned.error}</p>}
        {inventoryStatus === "error" && (
          <p className="collections-page__notice collections-page__notice--error" role="alert">
            Collections could not be loaded. Try refreshing.
          </p>
        )}
        {notice && <p className="collections-page__notice" role="status">{notice}</p>}

        {isListLoading ? (
          <p className="collections-page__notice" role="status">Loading collections…</p>
        ) : groups.map((group) => {
          // Sections that only mirror something else stay out of the way until they have rows.
          if (group.key !== "owned" && group.items.length === 0) return null;
          return (
            <section key={group.key} className="collections-page__group" aria-labelledby={`collections-group-${group.key}`}>
              <header className="collections-page__group-header">
                <div>
                  <h2 id={`collections-group-${group.key}`}>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <span className="collections-page__group-count">{group.items.length}</span>
              </header>

              {group.key === "owned" && draftName !== null && (
                <form
                  className="collections-page__form collections-page__form--create"
                  onSubmit={(event) => { event.preventDefault(); handleCreate(); }}
                >
                  <input
                    autoFocus
                    placeholder="Collection name"
                    aria-label="New collection name"
                    value={draftName}
                    maxLength={120}
                    required
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") setDraftName(null); }}
                  />
                  <button type="submit" className="collections-page__btn collections-page__btn--primary" disabled={!draftName.trim()}>
                    <Check size={14} aria-hidden="true" /> Create
                  </button>
                  <button type="button" className="collections-page__btn" onClick={() => setDraftName(null)}>
                    Cancel
                  </button>
                </form>
              )}

              {group.items.length === 0 ? (
                draftName === null && <p className="collections-page__empty">{group.empty}</p>
              ) : (
                <ul className="collections-page__list">
                  {group.items.map((collection) => renderRow(collection, 0))}
                </ul>
              )}
            </section>
          );
        })}
      </>
    );
  };

  return (
    <div className="collections-page">
      <div className="collections-page__header">
        <AppNav />
        {/* Everything on this page depends on who is signed in, so the account sits in view
            rather than at the bottom of the catalog's sidebar. Signed out, the page body is
            already the sign-in prompt, so a second button here would only repeat it. */}
        {session && (
          <div className="collections-page__account">
            <span className="collections-page__email" title={session.user.email}>{session.user.email}</span>
            <button type="button" className="collections-page__btn" onClick={() => { void signOut(); }}>
              Sign out
            </button>
          </div>
        )}
      </div>
      <main className="collections-page__body">
        <div className="collections-page__intro">
          <h1>Collections</h1>
          <p>Keep track of the cards you own, choose where new cards are recorded and open any collection in the catalog.</p>
          {session && (
            <div className="collections-page__toolbar">
              <button
                type="button"
                className="collections-page__btn collections-page__btn--primary"
                onClick={() => { startAction(); setDraftName(""); }}
                disabled={draftName !== null || owned.remoteUnavailable}
              >
                <Plus size={14} aria-hidden="true" /> New collection
              </button>
              <button type="button" className="collections-page__btn" onClick={refreshInventory} disabled={isInventoryBusy}>
                <RefreshCw size={14} aria-hidden="true" />
                {inventoryStatus === "refreshing" ? "Refreshing collections…" : "Refresh collections"}
              </button>
              {inventoryStatus === "ready" && inventoryUpdatedAt && (
                <small>Updated {new Date(inventoryUpdatedAt).toLocaleTimeString()}</small>
              )}
            </div>
          )}
        </div>
        {renderContent()}
      </main>
    </div>
  );
};
