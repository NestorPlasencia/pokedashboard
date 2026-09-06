import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Eye, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { CollapsibleFieldset } from './CollapsibleFieldset';
import { useWishlists } from '../../context/WishlistsContext';
import { useCardContext } from '../../context/CardContext';
import type { Card } from '../../types/dashboard';

export function Wishlists({ busy }: { busy: boolean }) {
  const wishlists = useWishlists();
  const { renderCards, trendLoading } = useCardContext();
  const [draft, setDraft] = useState<{ parentId: string | null; name: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const cards = renderCards.filter((c): c is Card => !('isPlaceholder' in c));
  const additions = cards.filter(c => !wishlists.contains(c));
  const startCreate = (parentId: string | null) => {
    setDraft({ parentId, name: '' });
    setMenu(null);
    if (parentId) {
      setExpanded(prev => new Set([...prev, parentId]));
      setCollapsed(prev => { const next = new Set(prev); next.delete(parentId); return next; });
    }
  };
  const select = (id: string, subId = '') => {
    wishlists.select(id, subId, wishlists.viewing);
    setExpanded(prev => new Set([...prev, id]));
    setCollapsed(prev => { const next = new Set(prev); next.delete(id); return next; });
    setMenu(null);
    setNotice('');
  };
  const creationForm = (parentId: string | null) => draft?.parentId === parentId && <form className="wishlist-tree-create" onSubmit={event => {
    event.preventDefault();
    if (wishlists.create(draft.name, parentId !== null, parentId ?? undefined)) {
      setDraft(null);
      setNotice(parentId ? 'Subcollection created. You can start adding cards.' : 'Wishlist created. Add a subcollection next.');
    }
  }}>
    <input autoFocus className="filter-search-input" aria-label={parentId ? 'Subcollection name' : 'Wishlist name'} placeholder={parentId ? 'New subcollection' : 'New wishlist'} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') setDraft(null); }} maxLength={120} required />
    {draft.name.trim() && <button type="submit" title="Create" aria-label="Create"><Check size={14} aria-hidden="true" /></button>}
    <button type="button" onClick={() => setDraft(null)} aria-label="Cancel creation" title="Cancel"><X size={14} aria-hidden="true" /></button>
  </form>;
  return <div className="section-sidebar wishlists">
    <CollapsibleFieldset legend="Wishlists" defaultCollapsed={true} persistKey="wishlists"
      collapsedSummary={wishlists.wishlist && <div className="filter-collapsed-summary">{wishlists.wishlist.name}{wishlists.subcollection && ` / ${wishlists.subcollection.name}`}</div>}>
      <div className="wishlists-controls">
        {wishlists.error && <p role="alert">{wishlists.error}</p>}
        {wishlists.loading
          ? <small role="status">Loading wishlists…</small>
          : <small>{wishlists.synced ? 'Synced with your account.' : 'Saved in this browser only. Sign in to sync them.'}</small>}
        {!wishlists.loading && !wishlists.wishlists.length && !draft && <small>Create a wishlist to group the cards you want.</small>}
        <ul className="wishlist-tree" aria-label="Wishlists and subcollections">
          {wishlists.wishlists.map(collection => {
            const active = wishlists.wishlist?.id === collection.id;
            const open = !collapsed.has(collection.id) && (expanded.has(collection.id) || active);
            const count = new Set(collection.subcollections.flatMap(sub => sub.cards.map(card => JSON.stringify([card.era, card.id])))).size;
            return <li key={collection.id}>
              <div className={`wishlist-tree-row ${active && !wishlists.subcollection ? 'is-selected' : ''}`}>
                <button className="wishlist-tree-toggle" type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${collection.name}`} aria-expanded={open} onClick={() => {
                  setExpanded(prev => new Set([...prev, collection.id]));
                  setCollapsed(prev => { const next = new Set(prev); if (open) next.add(collection.id); else next.delete(collection.id); return next; });
                }}>{open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button>
                <button className="wishlist-tree-name" type="button" aria-pressed={active && !wishlists.subcollection} onClick={() => select(collection.id)} title={collection.name}>{collection.name}</button>
                <span className="wishlist-tree-count">{count}</span>
                {count > 0 && <button className="wishlist-tree-view" type="button" title="View wishlist" aria-label={`View cards in ${collection.name}`} onClick={() => { wishlists.select(collection.id, '', true); setMenu(null); }}><Eye size={13} aria-hidden="true" /> View</button>}
                <button className="wishlist-tree-more" type="button" aria-label={`Actions for ${collection.name}`} aria-expanded={menu === collection.id} onClick={() => setMenu(menu === collection.id ? null : collection.id)}><MoreHorizontal size={16} aria-hidden="true" /></button>
              </div>
              {menu === collection.id && <div className="wishlist-tree-actions">
                <button onClick={() => startCreate(collection.id)}><Plus size={12} aria-hidden="true" /> Subcollection</button>
                <button className="wishlist-tree-delete" onClick={() => { wishlists.deleteNode(collection.id); setMenu(null); if (draft?.parentId === collection.id) setDraft(null); }}><Trash2 size={12} aria-hidden="true" /> Delete wishlist</button>
              </div>}
              {open && <ul className="wishlist-tree-children">
                {collection.subcollections.map((sub, index) => {
                  const selected = active && wishlists.subcollection?.id === sub.id;
                  return <li key={sub.id}>
                    <div className={`wishlist-tree-row ${selected ? 'is-selected' : ''}`}>
                      <span className="wishlist-tree-leaf" aria-hidden="true">&#8722;</span>
                      <button className="wishlist-tree-name" type="button" aria-pressed={selected} onClick={() => select(collection.id, sub.id)} title={sub.name}>{sub.name}</button>
                      <span className="wishlist-tree-count">{sub.cards.length}</span>
                      {sub.cards.length > 0 && <button className="wishlist-tree-view" type="button" title="View subcollection" aria-label={`View cards in ${sub.name}`} onClick={() => { wishlists.select(collection.id, sub.id, true); setMenu(null); }}><Eye size={13} aria-hidden="true" /> View</button>}
                      <button className="wishlist-tree-more" type="button" aria-label={`Actions for ${sub.name}`} aria-expanded={menu === sub.id} onClick={() => setMenu(menu === sub.id ? null : sub.id)}><MoreHorizontal size={16} aria-hidden="true" /></button>
                    </div>
                    {menu === sub.id && <div className="wishlist-tree-actions">
                      <button disabled={index === 0} aria-label={`Move ${sub.name} up`} onClick={() => wishlists.moveSubcollection(collection.id, sub.id, 'up')}><ArrowUp size={12} aria-hidden="true" /> Up</button>
                      <button disabled={index === collection.subcollections.length - 1} aria-label={`Move ${sub.name} down`} onClick={() => wishlists.moveSubcollection(collection.id, sub.id, 'down')}><ArrowDown size={12} aria-hidden="true" /> Down</button>
                      <button className="wishlist-tree-delete" onClick={() => { wishlists.deleteNode(collection.id, sub.id); setMenu(null); }}><Trash2 size={12} aria-hidden="true" /> Delete subcollection</button>
                    </div>}
                  </li>;
                })}
                <li>{draft?.parentId === collection.id ? creationForm(collection.id) : <button className="wishlist-tree-new" onClick={() => startCreate(collection.id)}><Plus size={12} aria-hidden="true" /> Subcollection</button>}</li>
              </ul>}
            </li>;
          })}
        </ul>
        {draft?.parentId === null ? creationForm(null) : <button className="wishlist-tree-new" onClick={() => startCreate(null)}><Plus size={12} aria-hidden="true" /> Wishlist</button>}
        {wishlists.wishlist && <div className="wishlist-tree-context">
          {wishlists.viewing ? <button onClick={() => wishlists.setViewing(false)}><ArrowLeft size={13} aria-hidden="true" /> Back to catalog</button> : <>
            {wishlists.subcollection && !busy && !trendLoading && additions.length > 0 && <button className="wishlist-tree-add" onClick={() => { const added = wishlists.add(cards); if (added) setNotice(`${added} cards added to ${wishlists.subcollection!.name}.`); }}><Plus size={12} aria-hidden="true" /> Add everything shown ({additions.length})</button>}
            {wishlists.subcollection && <small>{busy || trendLoading ? 'Loading results…' : !cards.length ? 'Search for cards to add them here.' : !additions.length ? 'Every card shown is already saved.' : `Target: ${wishlists.subcollection.name}`}</small>}
            {wishlists.keys.size > 0 && <button className="wishlist-tree-new" onClick={() => wishlists.setViewing(true)}>View saved cards <ArrowRight size={13} aria-hidden="true" /></button>}
          </>}
        </div>}
        {notice && <small role="status">{notice}</small>}
        {wishlists.deleted && <div className="wishlist-tree-undo" role="status"><span>{wishlists.deleted.subId ? 'Subcollection deleted.' : 'Wishlist deleted.'}</span><button onClick={wishlists.undoDelete}>Undo</button></div>}
      </div>
    </CollapsibleFieldset>
  </div>;
}

export function WishlistCardButton({ card }: { card: Card }) {
  const wishlists = useWishlists();
  if (!wishlists.canToggle(card)) return null;
  const saved = wishlists.contains(card);
  const target = wishlists.subcollection?.name ?? wishlists.wishlist!.name;
  const description = `${saved ? 'Remove' : 'Add'} ${card.name} ${card.variant} ${saved ? 'from' : 'to'} ${target}`;
  // Only inside the wishlist view does this take over the "Missing" badge slot; in the
  // catalog, Missing keeps its corner and the control sits out of its way.
  const className = `wishlist-card-button${saved ? ' wishlist-card-button--saved' : ''}${wishlists.viewing ? ' wishlist-card-button--slot' : ''}`;
  return <button type="button" className={className} title={description} onClick={e => { e.stopPropagation(); if (saved) wishlists.remove(card); else if (wishlists.subcollection) wishlists.add([card]); }} aria-label={description}>
    {saved ? <><Check size={12} aria-hidden="true" /> Remove</> : <><Plus size={12} aria-hidden="true" /> Add</>}
  </button>;
}

/** Sits in the search row so the current mode is stated without spending a row on it. */
/** Sits in the search row: states the current mode and, in a wishlist, exits back to
 *  the catalog. Doubling as the exit keeps it to one element and costs no extra row. */
export function ViewModeBadge() {
  const wishlists = useWishlists();
  const { allCards, viewedCollection, setViewedCollection } = useCardContext();
  if (viewedCollection) {
    return <button
      type="button"
      className="view-mode-badge view-mode-badge--collection"
      onClick={() => setViewedCollection('')}
      aria-label={`${viewedCollection} — back to catalog`}
      title="Back to catalog"
    >
      <span className="view-mode-badge__name">{viewedCollection}</span>
      <X size={12} aria-hidden="true" />
    </button>;
  }
  if (!wishlists.viewing || !wishlists.wishlist) {
    return <span className="view-mode-badge" title="Browsing the full card catalog">Catalog</span>;
  }
  const loaded = allCards.filter(c => wishlists.keys.has(JSON.stringify([c.setSeries, c.id]))).length;
  const missing = wishlists.keys.size - loaded;
  const name = wishlists.wishlist.name + (wishlists.subcollection ? ` / ${wishlists.subcollection.name}` : '');
  return <button
    type="button"
    className="view-mode-badge view-mode-badge--wishlist"
    onClick={() => wishlists.setViewing(false)}
    aria-label={`${name} — back to catalog`}
    title={`Back to catalog${missing > 0 ? ` · ${missing} saved cards are not in the loaded catalog` : ''}`}
  >
    <span className="view-mode-badge__name">{name}</span>
    {missing > 0 && <span className="view-mode-badge__warning" role="status">{missing}!</span>}
    <X size={12} aria-hidden="true" />
  </button>;
}

