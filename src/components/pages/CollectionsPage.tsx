import { useMemo, useState } from "react";
import { Check, Eye, FolderInput, Globe, Link2, Lock, Palette, Pencil, PencilOff, Plus, RefreshCw, TextCursorInput, Trash2, X } from "lucide-react";
import { COLLECTION_PRINTING_ORDER } from "../../services/inventory";
import type { CollectionTag } from "../../services/appCollections";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { useAuth } from "../../context/AuthContext";
import { useOwnedCollections } from "../../context/OwnedCollectionsContext";
import type { InventoryStatus } from "../../hooks/useLoadCards";
import type { OptionsCollection } from "../../types/dashboard";
import { CATALOG_VIEW, toggleViewedCollection } from "../../utils/viewMode";
import { navigate, pathForPublicCollection } from "../../utils/route";
import { childrenByParent, collectionSubtree } from "../../utils/collectionTree";
import { byTag } from "../../utils/collectionTags";

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [printingsDraft, setPrintingsDraft] = useState<{ id: string; printings: string[] } | null>(null);
  const [copiedId, setCopiedId] = useState("");
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
      items: topLevel
        .filter((collection) => collection.editable && collection.kind === "owned")
        .sort(byTag),
    },
    {
      key: "collectr",
      title: "Synced from Collectr",
      description: "Read-only here: the Collectr extension rebuilds them on every sync.",
      empty: "Nothing synced from Collectr yet.",
      // Ordered by tag. `sort` is stable, so collections sharing a tag keep the order they
      // arrived in - by printing, then name.
      items: topLevel
        .filter((collection) => !collection.editable && collection.kind === "owned")
        .sort(byTag),
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

  const viewedCollections = viewMode.kind === "collection" ? viewMode.names : [];

  // Adds or removes this one collection from whatever is being browsed - several can be
  // viewed together - and always lands you on the catalog to see the result.
  const browse = (name: string) => {
    setViewMode(toggleViewedCollection(viewMode, name));
    navigate("catalog");
  };

  // Collections are addressed by name in the view mode and in the filter, so both follow a
  // rename and let go of deleted collections instead of pointing at nothing.
  const followRename = (from: string, to: string) => {
    if (viewMode.kind === "collection" && viewMode.names.includes(from)) {
      setViewMode({ kind: "collection", names: viewMode.names.map((name) => (name === from ? to : name)) });
    }
    if (collectionFilter.selectedCollections.includes(from)) {
      setCollectionFilter((prev) => ({
        ...prev,
        selectedCollections: prev.selectedCollections.map((name) => (name === from ? to : name)),
      }));
    }
  };

  const forget = (names: string[]) => {
    if (viewMode.kind === "collection" && viewMode.names.some((name) => names.includes(name))) {
      const remaining = viewMode.names.filter((name) => !names.includes(name));
      setViewMode(remaining.length > 0 ? { kind: "collection", names: remaining } : CATALOG_VIEW);
    }
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
    setMovingId(null);
    setPrintingsDraft(null);
    setCopiedId("");
  };

  // Folders a collection can be nested under: any of your own collections, minus itself
  // and its own subtree - the database would reject that cycle anyway, but filtering it
  // out here keeps the dropdown honest. A Collectr collection's own subtree is empty
  // since it can only ever be a leaf here, but the check is harmless either way.
  const folderOptions = (collection: OptionsCollection) => {
    const excluded = new Set(collectionSubtree(collections, collection.name).map((entry) => entry.id));
    return collections.filter((entry) => entry.editable && entry.kind === "owned" && entry.id && !excluded.has(entry.id));
  };

  const handleMove = async (collection: OptionsCollection, parentId: string) => {
    setBusyId(collection.id);
    const moved = await owned.move(collection.id, parentId || null);
    setBusyId("");
    setMovingId(null);
    if (!moved) return;
    const parent = parentId ? collections.find((entry) => entry.id === parentId) : null;
    setNotice(parent ? `${collection.name} moved into ${parent.name}.` : `${collection.name} moved to the top level.`);
  };

  const handleToggleTag = async (collection: OptionsCollection, tag: CollectionTag) => {
    const enabled = !collection.tags.includes(tag);
    setBusyId(collection.id);
    const saved = await owned.setTag(collection.id, tag, enabled);
    setBusyId("");
    if (!saved) return;
    setNotice(enabled
      ? `${collection.name} tagged ${tag}.`
      : `The ${tag} tag was removed from ${collection.name}.`);
  };

  const handleToggleVisibility = async (collection: OptionsCollection) => {
    const isPublic = !collection.isPublic;
    setBusyId(collection.id);
    const saved = await owned.setVisibility(collection.id, isPublic);
    setBusyId("");
    if (!saved) return;
    setNotice(isPublic
      ? `${collection.name} is public. Anyone with the link can open it.`
      : `${collection.name} is private again.`);
  };

  const copyShareLink = async (collection: OptionsCollection) => {
    const link = `${window.location.origin}${pathForPublicCollection(collection.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(collection.id);
    } catch {
      // Clipboard access can be refused outright - an insecure origin, a denied
      // permission - so the link is shown instead of the copy silently doing nothing.
      setNotice(link);
    }
  };

  const handleSavePrintings = async (collection: OptionsCollection) => {
    if (!printingsDraft) return;
    setBusyId(collection.id);
    const saved = await owned.setPrintings(collection.id, collection.printings, printingsDraft.printings);
    setBusyId("");
    if (!saved) return;
    setPrintingsDraft(null);
    setNotice(`Printings updated for ${collection.name}.`);
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
    const isMoving = movingId === collection.id;
    // Subcollections of your own collections are yours too; Collectr's stay read-only.
    const canManage = collection.editable && collection.kind === "owned" && Boolean(collection.id);
    // `parent_id` stays editable on a Collectr collection even though its name and copies
    // don't, so nesting is offered for both - just never into a Collectr folder itself.
    const canMove = collection.kind === "owned" && Boolean(collection.id);
    const isEditingPrintings = printingsDraft?.id === collection.id;
    // Tags are editable everywhere, Collectr's rows included - except `wish`, because a
    // wishlist is only ever read back as one when it is a top-level collection of your
    // own (see fetchRemoteWishlists). Offering it elsewhere would write a tag that the
    // Wishlists panel then refuses to show.
    const canTagWish = collection.editable && collection.parentId === null;
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
              {collection.id && (["own", "wish", "watch"] as const).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="collections-page__tag"
                  aria-pressed={collection.tags.includes(tag)}
                  disabled={isBusy || owned.remoteUnavailable || (tag === "wish" && !canTagWish)}
                  title={tag === "wish" && !canTagWish
                    ? "A wishlist has to be one of your own top-level collections"
                    : `${collection.tags.includes(tag) ? "Remove" : "Add"} the ${tag} tag`}
                  onClick={() => handleToggleTag(collection, tag)}
                >
                  {tag}
                </button>
              ))}
              {collection.isPublic && (
                <span className="collections-page__public-tag">
                  <Globe size={11} aria-hidden="true" /> Public
                </span>
              )}
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
                className={`collections-page__btn${viewedCollections.includes(collection.name) ? " is-armed" : ""}`}
                aria-pressed={viewedCollections.includes(collection.name)}
                title={viewedCollections.includes(collection.name)
                  ? `Stop browsing ${collection.name}`
                  : children.length > 0
                    ? `Add ${collection.name} and its subcollections to the catalog view`
                    : `Add ${collection.name} to the catalog view`}
                onClick={() => browse(collection.name)}
              >
                <Eye size={14} aria-hidden="true" /> {viewedCollections.includes(collection.name) ? "Browsing" : "Browse"}
              </button>
              {canMove && (
                <button
                  type="button"
                  className={`collections-page__btn${isMoving ? " is-armed" : ""}`}
                  aria-pressed={isMoving}
                  aria-label={`Move ${collection.name} into another collection`}
                  onClick={() => { startAction(); setMovingId(collection.id); }}
                  disabled={owned.remoteUnavailable}
                >
                  <FolderInput size={14} aria-hidden="true" /> Move
                </button>
              )}
              {/* Sharing works on a Collectr collection too: `is_public` and `parent_id`
                  are the two columns the database leaves to the client on a managed row. */}
              {Boolean(collection.id) && (
                <button
                  type="button"
                  className={`collections-page__btn${collection.isPublic ? " is-armed" : ""}`}
                  aria-pressed={collection.isPublic}
                  onClick={() => handleToggleVisibility(collection)}
                  disabled={isBusy || owned.remoteUnavailable}
                >
                  {collection.isPublic
                    ? <><Lock size={14} aria-hidden="true" /> Make private</>
                    : <><Globe size={14} aria-hidden="true" /> Share</>}
                </button>
              )}
              {collection.isPublic && Boolean(collection.id) && (
                <button
                  type="button"
                  className="collections-page__btn"
                  onClick={() => copyShareLink(collection)}
                >
                  {copiedId === collection.id
                    ? <><Check size={14} aria-hidden="true" /> Copied</>
                    : <><Link2 size={14} aria-hidden="true" /> Copy link</>}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  className={`collections-page__btn${isEditingPrintings ? " is-armed" : ""}`}
                  aria-pressed={isEditingPrintings}
                  aria-label={`Edit the printings of ${collection.name}`}
                  onClick={() => { startAction(); setPrintingsDraft({ id: collection.id, printings: [...collection.printings] }); }}
                  disabled={owned.remoteUnavailable}
                >
                  <Palette size={14} aria-hidden="true" /> Printings
                </button>
              )}
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

        {isMoving && (
          <form
            className="collections-page__form collections-page__form--sub"
            onSubmit={(event) => event.preventDefault()}
          >
            <select
              autoFocus
              aria-label={`Move ${collection.name} into`}
              defaultValue={collection.parentId ?? ""}
              disabled={busyId === collection.id}
              onChange={(event) => handleMove(collection, event.target.value)}
            >
              <option value="">Top level (no folder)</option>
              {folderOptions(collection).map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <button type="button" className="collections-page__btn" onClick={() => setMovingId(null)} disabled={busyId === collection.id}>
              Cancel
            </button>
          </form>
        )}

        {isEditingPrintings && printingsDraft && (
          <div className="collections-page__printings" role="group" aria-label={`Printings of ${collection.name}`}>
            {/* Rendered in the schema's canonical order, never alphabetically. */}
            {COLLECTION_PRINTING_ORDER.map((printing) => (
              <label key={printing}>
                <input
                  type="checkbox"
                  checked={printingsDraft.printings.includes(printing)}
                  disabled={isBusy}
                  onChange={(event) => setPrintingsDraft({
                    id: collection.id,
                    printings: event.target.checked
                      ? [...printingsDraft.printings, printing]
                      : printingsDraft.printings.filter((entry) => entry !== printing),
                  })}
                />
                {printing}
              </label>
            ))}
            <button
              type="button"
              className="collections-page__btn collections-page__btn--primary"
              onClick={() => handleSavePrintings(collection)}
              disabled={isBusy}
            >
              <Check size={14} aria-hidden="true" /> {isBusy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="collections-page__btn" onClick={() => setPrintingsDraft(null)} disabled={isBusy}>
              Cancel
            </button>
          </div>
        )}

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
