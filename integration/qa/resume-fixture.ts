import { createHash } from 'node:crypto';
import { db } from '@appdeploy/sdk';

export const tables = {
  queue: 'qa_resume_a_queue_20261127',
  attempts: 'qa_resume_b_attempts_20261127',
  docs: 'qa_resume_b_docs_20261127',
  receipts: 'qa_resume_b_receipts_20261127',
  checkpoint: 'qa_resume_bc_state_20261127',
  proof: 'qa_resume_proof_20261127',
};
const names = ['completed', 'deferred', 'ready'] as const;
export const inputs = names.map(name => ({
  kind: 'document', url: 'https://fixture.invalid/' + name + '.pdf', source: 'QA synthetic',
  publisher_page: 'https://fixture.invalid/notices',
}));
export const ids = inputs.map(input => 'pdf-' + createHash('sha256').update(input.url).digest('hex').slice(0, 42));
export async function readPublicDocumentWork() {
  const [restored] = await db.get<{ items: typeof inputs }>(tables.queue, ['cursor'], { consistent: true });
  if (!restored) throw Error('qa_resume_queue_missing');
  return { items: restored.items, rawDocumentInputs: restored.items.length,
    eligibleDocuments: restored.items.length, excludedDocumentInputs: 0 };
}

function pdf() {
  const stream = 'BT /F1 14 Tf 45 750 Td (Oferta laboral) Tj 0 -20 Td (Cargo: Tecnico electrico) Tj 0 -20 Td (Lugar de trabajo: Angol) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let file = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = file.length;
    file += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return offset;
  });
  const xref = file.length;
  file += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) file += String(offset).padStart(10, '0') + ' 00000 n \n';
  return file + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
}

export async function openPublicResponse(url: string, _signal: AbortSignal, _accept: string) {
  if (!inputs.some(row => row.url === url) || url === inputs[0].url)
    return { error: 'qa_unexpected_fixture_read' } as const;
  return { url, response: new Response(pdf(), { headers: { 'Content-Type': 'application/pdf' } }) };
}
