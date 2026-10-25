type Ingestion = { status:string; stored:number; published:number };
type Dependencies = {
  ingest:()=>Promise<Ingestion>;
  advance:()=>Promise<Record<string,unknown>>;
  confirm:()=>Promise<{status:string;published:number}>;
};

// Consume only the existing GitHub-signed exchange. No request data, source
// collection, OCR, AI, document revalidation or notification capability is used.
export function reviewedReceiver(dependencies:Dependencies, clock=Date.now) {
  let running:Promise<Record<string,unknown>> | null=null;
  let lastStarted=Number.NEGATIVE_INFINITY;
  return ():Promise<Record<string,unknown>> => {
    if (running) return running;
    const now=clock();
    if (now-lastStarted<60000) return Promise.resolve({
      status:'cooldown', retryAfterSeconds:Math.ceil((60000-now+lastStarted)/1000), providerCalls:0,
    });
    lastStarted=now;
    running=(async()=>{
      const ingestion=await dependencies.ingest();
      if (!['stored_waiting_for_feed','published','unchanged','unchanged_batch'].includes(ingestion.status)) {
        return {status:ingestion.status,ingestion,providerCalls:0};
      }
      const feed=await dependencies.advance();
      const receipts=await dependencies.confirm();
      return {status:receipts.status,ingestion,feed,receipts,providerCalls:0};
    })().finally(()=>{running=null;});
    return running;
  };
}
