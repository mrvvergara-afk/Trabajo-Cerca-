import { knownCount } from './executive-metrics';

type CommuneCoverage = {
  city: string;
  publicJobs: number;
  sourceConfigured: number;
  sourceChecked: number;
  sourceFailed: number;
  sourceWithFindings: number;
  internalPending: number;
  unpublishedEligible: number;
};
export type TerritorialCoverageReport = {
  checkedAt?: string;
  feedComplete?: boolean;
  sourceAuditComplete?: boolean;
  communes?: CommuneCoverage[];
  note?: string;
};

export function TerritorialCoverageAudit({ report }: { report: TerritorialCoverageReport }) {
  return <details className="tcBICityDetails tcSourceCoverage">
    <summary>Cobertura de las 12 comunas</summary>
    <p>Catálogo {report.feedComplete === true ? 'completo' : report.feedComplete === false ? 'parcial' : 'sin datos'}.</p>
    {report.note && <p>{report.note}</p>}
    <div className="tcSourceTableWrap" tabIndex={0} role="region" aria-label="Cobertura por comuna">
      <table>
        <thead><tr><th scope="col">Comuna</th><th scope="col">Publicadas</th><th scope="col">Fuentes previstas</th><th scope="col">Revisadas</th><th scope="col">Con hallazgos</th><th scope="col">Con fallo</th><th scope="col">Pendientes internos</th><th scope="col">Aptas ausentes</th></tr></thead>
        <tbody>
          {(report.communes ?? []).map(row => <tr key={row.city}>
            <th scope="row">{row.city}</th>
            <td>{knownCount(row.publicJobs)}</td><td>{knownCount(row.sourceConfigured)}</td>
            <td>{knownCount(row.sourceChecked)}</td><td>{knownCount(row.sourceWithFindings)}</td>
            <td>{knownCount(row.sourceFailed)}</td><td>{knownCount(row.internalPending)}</td>
            <td>{knownCount(row.unpublishedEligible)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}
