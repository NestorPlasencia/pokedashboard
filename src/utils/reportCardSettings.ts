import type { OptionsCollection } from '../types/dashboard';
import type { Wishlist } from '../services/wishlists';
import { collectionGroupIds, ownedCollectionAddTargets } from './collectionTree.ts';

export type ReportAddTarget = { kind: 'collection' | 'wishlist'; id: string };
export type ReportAddOption = ReportAddTarget & { label: string };
export type ReportCardSettings = { addTarget: ReportAddTarget | null };
export const reportCardSettingsKey = (userId: string) => `pokedashboard:report-cards:v1:${userId || 'guest'}`;

export function normalizeReportCardSettings(value: unknown): ReportCardSettings {
  const target = value && typeof value === 'object' ? (value as Partial<ReportCardSettings>).addTarget : null;
  return { addTarget: target && (target.kind === 'collection' || target.kind === 'wishlist') && typeof target.id === 'string' && target.id.trim()
    ? { kind: target.kind, id: target.id.trim() } : null };
}

export function readReportCardSettings(userId: string, storage: Pick<Storage, 'getItem'>): ReportCardSettings {
  try { return normalizeReportCardSettings(JSON.parse(storage.getItem(reportCardSettingsKey(userId)) ?? 'null')); }
  catch { return { addTarget: null }; }
}

/** Only destinations supported by the existing Add controls are offered. */
export function reportAddOptions(collections: OptionsCollection[], wishlists: Wishlist[]): ReportAddOption[] {
  const groups = collectionGroupIds(collections);
  return [
    ...ownedCollectionAddTargets(collections)
      .map(collection => ({ kind: 'collection' as const, id: collection.id, label: collection.name })),
    ...wishlists.flatMap(wishlist => wishlist.subcollections.filter(sub => !groups.has(sub.id)).map(sub => ({ kind: 'wishlist' as const, id: sub.id, label: `${wishlist.name} / ${sub.name}` }))),
  ].sort((left, right) => left.label.localeCompare(right.label));
}

/** A deleted destination or one unavailable to this account cannot arm the link. */
export const resolveReportAddTarget = (target: ReportAddTarget | null, options: ReportAddOption[]): ReportAddOption | null =>
  target ? options.find(option => option.kind === target.kind && option.id === target.id) ?? null : null;
