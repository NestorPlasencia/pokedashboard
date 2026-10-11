import { useState } from 'react';

export const ReportFilterPicker = ({ label, options, included = [], excluded = [], onChange, allowExclude = true, emptyLabel = 'Todos', defaultOpen = false, noOptionsLabel = 'Elige una serie para cargar las opciones.' }: {
  label: string; options: string[]; included?: string[]; excluded?: string[]; allowExclude?: boolean;
  emptyLabel?: string; defaultOpen?: boolean; noOptionsLabel?: string;
  onChange: (included: string[], excluded: string[]) => void;
}) => {
  const [search, setSearch] = useState('');
  const values = [...new Set([...included, ...excluded, ...options])].sort((a, b) => a.localeCompare(b));
  const toggle = (value: string, exclude: boolean) => {
    const selected = exclude ? excluded : included;
    const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
    onChange(exclude ? included.filter(item => item !== value) : next, exclude ? next : excluded.filter(item => item !== value));
  };
  return <details className="report-filter-picker" open={defaultOpen || undefined}>
    <summary>{label}<span>{included.length || excluded.length ? `${included.length} incluidos${excluded.length ? ` · ${excluded.length} excluidos` : ''}` : emptyLabel}</span></summary>
    <div className="report-filter-options">
      <input type="search" aria-label={`Buscar en ${label}`} placeholder="Buscar opciones…" value={search} onChange={event => setSearch(event.target.value)} />
      {included.length || excluded.length ? <button type="button" className="report-text-button" onClick={() => onChange([], [])}>Limpiar selección</button> : null}
      {allowExclude && <div className="report-filter-columns"><span>Incluir</span><span>Excluir</span></div>}
      <div className="report-filter-scroll">
        {values.filter(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(value => <div key={value} className="report-filter-option">
          <label><input type="checkbox" checked={included.includes(value)} onChange={() => toggle(value, false)} />{value}</label>
          {allowExclude && <input type="checkbox" aria-label={`Excluir ${value} de ${label}`} checked={excluded.includes(value)} onChange={() => toggle(value, true)} />}
        </div>)}
        {!values.length && <p>{noOptionsLabel}</p>}
      </div>
    </div>
  </details>;
};
