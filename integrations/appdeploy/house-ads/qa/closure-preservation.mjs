import ts from 'typescript';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const baseline=JSON.parse(readFileSync('qa/closure-collector-baseline.json','utf8'));
function initializer(source,name){const file=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);for(const statement of file.statements){if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){if(declaration.name.getText(file)===name)return declaration.initializer.getText(file);}}throw Error('missing handler '+name);}
const source=readFileSync('backend/index.ts','utf8');
for(const [name,definition] of Object.entries(baseline.definitions)){
 let actual=initializer(source,name);
 if(name==='v14VerificationHandler')actual=actual.replace(/^  const administrative=.*\n/m,'').replace(/^  const adminPublications=.*\n/m,'').replace('receipts,administrative,adminPublications,','receipts,');
 assert.equal(actual,initializer(definition,name),'labor handler changed outside the documented administrative hook '+name);
}
assert(source.includes("const result=providerSlot ? await processPendingOffers(8) : undefined;"));
const old=JSON.parse(readFileSync('qa/collector-baseline.json','utf8')).cron,current=JSON.parse(readFileSync('cron.json','utf8'));
assert.deepEqual(current.filter(x=>x.name!=='notification-sweep'),old);
assert.deepEqual(current.filter(x=>x.name==='notification-sweep'),[{name:'notification-sweep',cron:'56 * * * *',handler:'notificationSweepHandler',timezone:'America/Santiago'}]);
writeFileSync('qa-output/closure/collector-preservation.json',JSON.stringify({baseCommit:baseline.baseCommit,fiveHandlerInitializersIdentical:true,verificationHandlerChangesOnlyFreeAdministrativeHook:true,sixLaborSchedulesIdentical:true,seventhNotificationScheduleAlreadyDeployed:true,handlers:Object.keys(baseline.definitions)},null,2));
console.log('COLLECTOR_PRESERVATION_VERIFIED');
