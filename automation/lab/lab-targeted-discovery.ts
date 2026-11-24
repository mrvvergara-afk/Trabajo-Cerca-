// One real source verification in a cold lab. The regular source schedule stays enabled.
import {db} from '@appdeploy/sdk';
import {runFreePublicSources} from './free-public-sources';

export async function runLabTargetedDiscovery(){
 const [seen]=await db.get('tc_lab_source_probe_v1',['stable'],{consistent:true});
 if(seen)return;
 const outcome:Record<string,unknown>=await runFreePublicSources([{
  key:'lab-real-angol-3934484',
  name:'ChileTrabajos · ficha pública de Angol',
  territory:'Angol',
  url:'https://www.chiletrabajos.cl/trabajo/conductor-a-clinico-urgencias-angol-3934484',
  discoveryGroup:'portal',
  bootstrap:true,
 }],'lab-real-angol-20261124-3934484');
 if(outcome.deferred)return;
 const record={id:'stable',at:new Date().toISOString(),stored:outcome.stored??null,verified:outcome.verified??null};
 await db.tx.add('tc_lab_source_probe_v1',[record]);
 console.warn('LAB_REAL_SOURCE '+JSON.stringify(record));
}
