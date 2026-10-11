import { useReportCardSettings } from '../../context/ReportCardSettingsContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import { useWishlists } from '../../context/WishlistsContext';
import { reportAddOptions, resolveReportAddTarget } from '../../utils/reportCardSettings';
import type { InventoryStatus } from '../../hooks/useLoadCards';
import { CollapsibleSection } from '../ui/CollapsibleSection';

export function ReportCardSettings({ inventoryStatus }: { inventoryStatus: InventoryStatus }) {
  const { settings, setSettings, persistenceError } = useReportCardSettings();
  const owned = useOwnedCollections();
  const wishlists = useWishlists();
  const options = reportAddOptions(owned.collections, wishlists.wishlists);
  const target = resolveReportAddTarget(settings.addTarget, options);
  const loading = owned.loading || wishlists.loading || inventoryStatus === 'loading';
  return <div className="section-sidebar">
    <CollapsibleSection title="Abrir cartas desde informes" defaultCollapsed={false}>
      <div className="report-card-settings">
        <label>Colección para agregar cartas
          <select value={target ? `${target.kind}:${target.id}` : ''} onChange={event => {
            const selected = options.find(option => `${option.kind}:${option.id}` === event.target.value);
            setSettings({ addTarget: selected ? { kind: selected.kind, id: selected.id } : null });
          }}>
            <option value="">No activar el modo Agregar</option>
            <optgroup label="Colecciones">{options.filter(option => option.kind === 'collection').map(option => <option key={option.id} value={`collection:${option.id}`}>{option.label}</option>)}</optgroup>
            <optgroup label="Wishlists">{options.filter(option => option.kind === 'wishlist').map(option => <option key={option.id} value={`wishlist:${option.id}`}>{option.label}</option>)}</optgroup>
          </select>
        </label>
        <p>Al pulsar «Abrir cartas» en un informe, activa el modo Agregar en este destino. Las cartas se guardan cuando pulses Add. Mantiene Hide owned y Trend points.</p>
        {loading ? <p role="status">Cargando colecciones…</p>
          : settings.addTarget && !target ? <p role="status">El destino guardado no está disponible. Elige otro para activar el modo Agregar.</p>
          : !options.length ? <p>Crea una colección editable o una subcolección de wishlist en Collections para elegirla aquí.</p> : null}
        {inventoryStatus === 'error' && <p role="alert">No se pudieron cargar las colecciones del inventario. Reintenta desde Collections.</p>}
        {wishlists.error && <p role="alert">{wishlists.error}</p>}
        <small role="status">{persistenceError ? 'No se pudo guardar la configuración en este navegador.' : 'Se guarda automáticamente en este navegador para tu cuenta.'}</small>
      </div>
    </CollapsibleSection>
  </div>;
}
