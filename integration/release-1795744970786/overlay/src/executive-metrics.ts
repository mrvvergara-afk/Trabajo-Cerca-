/** Presentation contracts for read-only backend metrics.
 * Figures are measured, never filled with simulated data.
 */
export type AdminSnapshot = {
  publicVisible?: number;
  jobs?: number;
  verified?: number;
  pending?: number;
  campaigns?: number;
  requests?: number;
  lastSweep?: string;
};
export type EngineId = 'A' | 'B' | 'C' | 'D' | 'CHATGPT' | 'GEMINI';
export type EngineRole = 'discovery' | 'documents';
export type EngineStatus = 'recent' | 'stale' | 'unreported' | 'error';
export type EngineRow = {
  id: EngineId;
  name: string;
  role: EngineRole;
  status: EngineStatus;
  observedAt: string | null;
  source: string;
  scope: string;
  notes: string[];
  counts: {
    scheduled: number | null;
    attempted: number | null;
    useful: number | null;
    blocked: number | null;
    candidates: number | null;
    verified: number | null;
    queued: number | null;
    publishedConfirmed: number | null;
    processed: number | null;
  };
};
export type DayPoint = {
  day: string;
  engine: EngineId;
  measure: 'sources_attempted' | 'docs_processed' | 'links_detected';
  value: number;
};
export type Telemetry = {
  schemaVersion: number;
  readOnly: boolean;
  generatedAt: string;
  engines: EngineRow[];
  rollup: { recent: number; reporting: number; total: number };
  history: DayPoint[];
  historyComplete: boolean;
  historyQuality?: {windowDays:number;fullyRecovered:boolean;producerHistoryDays?:number;producerHistoryDaysByEngine?:Record<string,number>;warnings?:string[];overlapLegacyBCDays?:string[];sources:Array<{table:string;scanned:number;pages:number;complete:boolean;readError:boolean}>;note:string};
  missingOrFailed: EngineId[];
  bcOperations?: {at:string|null;pdf:{processed:number|null;pending:number|null;decisions:Record<string,unknown>;queuedByA?:number|null;eligible?:number|null;excluded?:number|null;deferred?:number|null;terminal?:number|null;oldestObservedPendingMs?:number|null;averageProcessingMs?:number|null};html:{found:number|null;checked:number|null;verified:number|null;blocked:number|null;archived:number|null;already:number|null;deferredOutside:number|null;deferredIndex:number|null;unsupported?:number|null;budgetDeferred?:number|null;storedForFeed:number|null;storageFailures:number|null};idle:boolean;provenance?:string};
  stageRead?: Array<{engine:string;latest:{runId:string;at:string|null;status:string;processed:number|null;inputCount:number|null;verified:number|null;blocked:number|null;already?:number|null;deferredOutside?:number|null;deferredIndex?:number|null;archived?:number|null;storedForFeed?:number|null;storageFailures?:number|null;error:unknown}|null;sampledRuns:number;complete:boolean}>;
  jointBC?: {at:string|null;scanned:number|null;remainingPdf:number|null;decisions?:{not_job?:number;blocked?:number};html?:{verified?:number};idle:boolean;note:string};
  warning: string;
};
export type ExecutiveKpi = {
  key: string;
  label: string;
  value: string;
  note: string;
  accent: string;
};
export const MAIN_CITIES = [
  'Angol',
  'Collipulli',
  'Ercilla',
  'Lumaco',
  'Los Sauces',
  'Purén',
  'Renaico',
  'Traiguén',
  'Victoria',
  'Mulchén',
  'Negrete',
  'Nacimiento',
] as const;
export function knownCount(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : 'Sin datos';
}
export function percent(part: unknown, total: unknown): number | null {
  return typeof part === 'number' &&
    typeof total === 'number' &&
    Number.isSafeInteger(part) &&
    part >= 0 &&
    Number.isSafeInteger(total) &&
    total > 0 &&
    part <= total
    ? Math.round((part / total) * 100)
    : null;
}
export function formatRatio(part: unknown, total: unknown): string {
  const p = percent(part, total);
  return p === null ? 'Sin datos' : p + ' %';
}
export function executiveKpis(
  s?: AdminSnapshot,
  t?: Telemetry | null,
  officialPublicVerified?: number | null
): ExecutiveKpi[] {
  // Resumen ejecutivo: las lecturas de fuentes se comparan en su propio gráfico.
  return [
    {
      key: 'visible',
      label: 'Ofertas públicas',
      value: knownCount(officialPublicVerified),
      note: 'Catálogo oficial',
      accent: 'blue',
    },
    {
      key: 'motors',
      label: 'Motores con informe reciente',
      value: t
        ? knownCount(t.rollup.recent) + ' / ' + knownCount(t.rollup.total)
        : 'Sin datos',
      note: 'De 6 motores',
      accent: 'violet',
    },
    {
      key: 'pending',
      label: 'Pendientes internos',
      value: knownCount(s?.pending),
      note: 'Requiere conciliación',
      accent: 'amber',
    },
    {
      key: 'ads',
      label: 'Campañas activas',
      value: knownCount(s?.campaigns),
      note: 'Por revisar: ' + knownCount(s?.requests),
      accent: 'green',
    },
  ];
}
export type CityCount = {
  city: string;
  visible: string;
  audited: string;
  expected: string;
  failed: string;
};
type Row = Record<string, unknown>;
export function cityCounts(payload: unknown): CityCount[] {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const items = Array.isArray(record.communes) ? record.communes : [];
  const byCity = new Map<string, Row>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Row;
    if (
      typeof row.city === 'string' &&
      MAIN_CITIES.includes(row.city as (typeof MAIN_CITIES)[number])
    )
      byCity.set(row.city, row);
  }
  return MAIN_CITIES.map(city => {
    const row = byCity.get(city);
    return {
      city,
      visible: knownCount(row?.publicJobs),
      audited: knownCount(row?.sourceChecked),
      expected: knownCount(row?.sourceConfigured),
      failed: knownCount(row?.sourceFailed),
    };
  });
}
export function chartValues(
  points: DayPoint[],
  engine: EngineId,
  measure?: DayPoint['measure']
): DayPoint[] {
  const wanted = measure ?? (engine === 'B'||engine === 'C'
    ? 'docs_processed' : 'sources_attempted');
  return points
    .filter(
      p =>
        p.engine === engine &&
        p.measure === wanted &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.day) &&
        Number.isSafeInteger(p.value) &&
        p.value >= 0
    )
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);
}
export function engineStatus(status: EngineStatus): string {
  return {
    recent: 'Registro reciente',
    stale: 'Sin ejecución reciente',
    unreported: 'Sin reporte',
    error: 'Requiere revisión',
  }[status];
}
