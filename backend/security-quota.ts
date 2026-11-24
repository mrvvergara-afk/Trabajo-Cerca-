import { createHash } from 'node:crypto';
import { db, error, isAppDatabaseError, type RouterMiddleware } from '@appdeploy/sdk';

type Counter = { count:number; endsAt:string };
type QuotaStore = {
  read:(key:string)=>Promise<Counter | null>;
  create:(key:string,value:Counter)=>Promise<boolean>;
  compareAndSet:(key:string,count:number,value:Counter)=>Promise<boolean>;
};
const TABLE = 'security_request_limits';

// Distinguish client throttling (429) from protection-store unavailability (503).
function limitedResponse(message:string,status:429|503,retrySeconds:number) {
  const result=error(message,status);
  return {...result,headers:{...(result.headers||{}),
    'Cache-Control':'no-store','Retry-After':String(retrySeconds)}};
}

export async function takeQuota(store:QuotaStore, scope:string, subject:string,
  limit:number, windowMs:number, now=Date.now()):Promise<boolean> {
  const window = Math.floor(now/windowMs);
  const key = createHash('sha256').update(scope+'\0'+subject+'\0'+window).digest('hex');
  for (let attempt=0;attempt<6;attempt++) {
    const current = await store.read(key);
    if (current && (!Number.isSafeInteger(current.count) || current.count<0)) {
      throw new Error('invalid_security_counter');
    }
    if (current && current.count>=limit) return false;
    const next = { count:(current?.count || 0)+1, endsAt:new Date((window+1)*windowMs).toISOString() };
    if (!current ? await store.create(key,next) : await store.compareAndSet(key,current.count,next)) return true;
  }
  // A CAS race is not evidence that the caller exceeded its limit.
  throw new Error('security_counter_contention');
}

const store:QuotaStore = {
  async read(key) { const [row]=await db.get<Counter>(TABLE,[key],{consistent:true});return row; },
  async create(key,value) { const [id]=await db.tx.add(TABLE,[{id:key,...value}]);return Boolean(id); },
  async compareAndSet(key,count,value) {
    const [ok]=await db.tx.update(TABLE,[{id:key,if:{count},record:value}],{patch:true});
    return ok;
  },
};

export function publicQuota(scope:string, limit:number, windowMs:number, globalLimit:number):RouterMiddleware {
  return async ctx => {
    const candidate:unknown = ctx.event?.requestContext?.http?.sourceIp;
    const address = typeof candidate==='string' && candidate.length<=64 && /^[a-f0-9:.]+$/i.test(candidate)
      ? candidate.toLowerCase() : 'unattributed';
    try {
      const subject = ctx.user?.userId ? 'user-'+ctx.user.userId : address;
      // Reject a client over its own limit before charging the shared global budget.
      if (!await takeQuota(store,scope,subject,limit,windowMs) ||
          !await takeQuota(store,scope,'global',globalLimit,windowMs)) {
        return limitedResponse('Límite de solicitudes alcanzado. Intenta nuevamente más tarde.',429,Math.max(1,Math.ceil(windowMs/1000)));
      }
    } catch (cause) {
      if (isAppDatabaseError(cause) && cause.code==='AppDatabaseQuotaExceeded') {
        return limitedResponse('Límite de protección de la plataforma alcanzado.',503,30);
      }
      console.warn('PUBLIC_QUOTA_PROTECTION_UNAVAILABLE '+JSON.stringify({scope,reason:cause instanceof Error && cause.message==='security_counter_contention'?'counter_contention':'storage_unavailable'}));
      return limitedResponse('La protección de solicitudes no está disponible. Intenta más tarde.',503,30);
    }
  };
}
