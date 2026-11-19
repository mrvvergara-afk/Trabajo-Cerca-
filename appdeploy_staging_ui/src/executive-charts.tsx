import {useState} from 'react';
import {chartValues,engineStatus,formatRatio,knownCount,percent,type CityCount,
 type DayPoint,type EngineRow,type Telemetry} from './executive-metrics';

const PALETTE:{[key:string]:string}={A:'#2876d4',B:'#1c9d9d',C:'#825ad5'};
function ShortDay({date}:{date:string}){
 const parts=date.split('-');return <>{parts[2]}/{parts[1]}</>;
}
export function ActivityChart({history,complete}:{history?:DayPoint[];complete?:boolean}){
 const [engine,setEngine]=useState<'A'|'B'|'C'>('A');
 const pts=chartValues(history||[],engine),values=pts.map(x=>x.value);
 const max=Math.max(1,...values),w=580,h=178,left=35,top=16,plotW=525,plotH=130;
 const coords=pts.map((p,i)=>({
  x:left+(pts.length<2?plotW/2:(i/(pts.length-1))*plotW),
  y:top+plotH-(p.value/max)*plotH,value:p.value,day:p.day
 }));
 const colour=PALETTE[engine];
 const line=coords.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
 const area=coords.length>1
  ?line+' L '+coords.at(-1)!.x.toFixed(1)+' '+(top+plotH)+' L '+coords[0].x.toFixed(1)+' '+(top+plotH)+' Z':'';
 return <section className='tcBIChartCard tcBIActivity' aria-label='Actividad histórica observada'>
   <header className='tcBIChartHead'>
    <div><h4>Actividad por día</h4>
      <p>Últimas ejecuciones disponibles. Cada motor conserva su propia unidad.</p></div>
    <div className='tcBITabs' role='group' aria-label='Seleccionar motor'>
      {(['A','B','C'] as const).map(id=><button key={id} type='button'
        aria-pressed={engine===id} onClick={()=>setEngine(id)}>{id}</button>)}
    </div>
   </header>
   {pts.length===0?<div className='tcBIEmptyChart'>Sin historial disponible para Motor {engine}.</div>:
    <svg viewBox={'0 0 '+w+' '+h} className='tcBILineSVG' role='img'
      aria-label={'Actividad de '+engine+': '+pts.map(x=>x.day+': '+x.value).join(', ')}>
      <defs><linearGradient id={'tcBIGradient'+engine} x1='0' y1='0' x2='0' y2='1'>
       <stop offset='0%' stopColor={colour} stopOpacity='.2'/>
       <stop offset='100%' stopColor={colour} stopOpacity='0'/>
      </linearGradient></defs>
      {[0,0.5,1].map(f=><g key={f}>
        <line x1={left} x2={left+plotW} y1={top+plotH*f} y2={top+plotH*f} stroke='#e7edf2' strokeDasharray='4 4'/>
        <text x={left-8} y={top+plotH*f+4} textAnchor='end' fill='#728297' fontSize='11'>
          {Math.round(max*(1-f))}
        </text>
      </g>)}
      {area&&<path d={area} fill={'url(#tcBIGradient'+engine+')'}/>}
      {coords.length>1&&<path d={line} fill='none' stroke={colour} strokeWidth='3'
        strokeLinecap='round' strokeLinejoin='round'/>}
      {coords.map((p,i)=><g key={p.day}>
        <circle cx={p.x} cy={p.y} r='4.3' fill='#fff' stroke={colour} strokeWidth='2.4'><title>{p.day+': '+p.value}</title></circle>
        {(pts.length<=6||i%2===0)&&<text x={p.x} y={top+plotH+21} textAnchor='middle'
          fill='#708099' fontSize='11'><ShortDay date={p.day}/></text>}
      </g>)}
    </svg>}
   <footer className='tcBIChartFoot'>
    <span>{engine==='A'?'Fuentes intentadas':engine==='B'?'Documentos/páginas procesadas':'Documentos/enlaces procesados'}</span>
    <span>{complete===false?'Historial muestral (no exhaustivo)':'Ejecuciones registradas'}</span>
   </footer>
 </section>;
}
export function SourceDonut({engines}:{engines?:EngineRow[]}){
 const [choice,setChoice]=useState<'D'|'A'>('D');
 const row=engines?.find(x=>x.id===choice);
 const attempted=row?.counts.attempted??null,useful=row?.counts.useful??null;
 const pct=percent(useful,attempted);
 const circumference=2*Math.PI*55,filled=(pct??0)/100*circumference;
 return <section className='tcBIChartCard tcBIDonutCard'>
   <header className='tcBIChartHead'><div><h4>Lectura de fuentes</h4>
    <p>Efectividad técnica del último barrido medido, sin confundirla con ofertas.</p></div>
    <div className='tcBITabs' role='group' aria-label='Motor de fuentes'>
      {(['D','A'] as const).map(x=><button type='button' key={x} aria-pressed={choice===x}
        onClick={()=>setChoice(x)}>{x}</button>)}
    </div>
   </header>
   {pct===null?<div className='tcBIEmptyChart'>Sin registro comparable de fuentes para Motor {choice}.</div>:
    <div className='tcBIDonutLayout'>
      <svg viewBox='0 0 152 152' role='img' aria-label={'Motor '+choice+', lectura útil '+pct+' por ciento'}
        className='tcBIDonutSVG'>
       <circle cx='76' cy='76' r='55' fill='none' stroke='#e8eff5' strokeWidth='15'/>
       <circle cx='76' cy='76' r='55' fill='none' stroke='#2b90c8' strokeWidth='15'
        strokeDasharray={filled+' '+(circumference-filled)} strokeLinecap='round'
        transform='rotate(-90 76 76)'/>
       <text x='76' y='76' textAnchor='middle' fontSize='27' fill='#173d58' fontWeight='800'>{pct}%</text>
       <text x='76' y='96' textAnchor='middle' fontSize='10' fill='#76879a'>lectura útil</text>
      </svg>
      <dl className='tcBIDonutFacts'>
       <div><dt>Intentadas</dt><dd>{knownCount(attempted)}</dd></div>
       <div><dt>Accesibles</dt><dd>{knownCount(useful)}</dd></div>
       <div><dt>No útiles / bloqueadas</dt><dd>{attempted!==null&&useful!==null?knownCount(attempted-useful):'Sin datos'}</dd></div>
      </dl>
    </div>}
   <footer className='tcBIChartFoot'>Fuente: última ejecución del motor {choice}. No representa cobertura de todo el inventario.</footer>
 </section>;
}
export function TerritoryBars({cities,feedComplete}:{cities:CityCount[];feedComplete?:boolean}){
 const available=cities.filter(c=>c.visible!=='Sin datos');
 const max=Math.max(1,...available.map(x=>Number(x.visible)||0));
 return <section className='tcBIChartCard tcBITerritory'>
   <header className='tcBIChartHead'><div><h4>Ofertas visibles por comuna</h4>
     <p>Distribución del catálogo principal. Temuco y Los Ángeles no se mezclan.</p></div></header>
   {available.length===0?<div className='tcBIEmptyChart'>No hay datos territoriales confirmados.</div>:
    <div className='tcBICityGrid'>{cities.map(row=>{
      const n=row.visible==='Sin datos'?null:Number(row.visible);
      return <div className='tcBICity' key={row.city}>
       <span className='tcBICityName'>{row.city}</span>
       <div className='tcBICityTrack' aria-hidden='true'><div style={{width:n===null?'0%':(n/max*100)+'%'}}/></div>
       <strong>{row.visible}</strong>
      </div>;
    })}</div>}
   <footer className='tcBIChartFoot'>
    {feedComplete===true?'Feed público completo consultado':feedComplete===false
      ?'Feed parcial: los recuentos pueden estar incompletos':'Integridad del feed sin confirmar'}
   </footer>
 </section>;
}
export function EnginesTable({telemetry}:{telemetry?:Telemetry|null}){
 const engines=telemetry?.engines||[];
 return <section className='tcBIChartCard tcBIEngines'>
  <header className='tcBIChartHead'><div><h4>Desempeño de los seis motores</h4>
   <p>Última medición disponible por motor. Las unidades de B/C no son equivalentes a las de A/D.</p></div></header>
  {!engines.length?<div className='tcBIEmptyChart'>La telemetría aún no se encuentra disponible.</div>:
   <div className='tcBITableWrap'><table className='tcBIEngineTable'>
    <thead><tr><th scope='col'>Motor</th><th scope='col'>Estado</th>
      <th scope='col'>Intentos / procesos</th><th scope='col'>Lecturas útiles</th>
      <th scope='col'>Candidatos / revisiones</th><th scope='col'>En cola</th>
      <th scope='col'>Visibles atribuibles</th></tr></thead>
    <tbody>{engines.map(e=><tr key={e.id}>
      <th scope='row'><strong>{e.name}</strong><small>{e.role==='documents'?'Documentos / cola':'Rastreo'}</small></th>
      <td><span className='tcBIEngineStatus' data-state={e.status}>{engineStatus(e.status)}</span></td>
      <td>{knownCount(e.counts.attempted)}</td><td>{knownCount(e.counts.useful)}</td>
      <td>{knownCount(e.counts.candidates)}</td><td>{knownCount(e.counts.queued)}</td>
      <td>{knownCount(e.counts.publishedConfirmed)}</td>
    </tr>)}</tbody>
   </table></div>}
  <footer className='tcBIChartFoot'>«Sin datos» significa que la fuente aún no permite acreditar esa métrica. Publicación = confirmada en feed y conciliada con el origen.</footer>
 </section>;
}
export function ExecutiveStatusBar({telemetry}:{telemetry?:Telemetry|null}){
 if(!telemetry)return null;
 return <div className='tcBIDataQuality'>
  <strong>Calidad del dato</strong>
  <span>{knownCount(telemetry.rollup.reporting)}/{knownCount(telemetry.rollup.total)} motores con reportes consultables</span>
  <span>Historial {telemetry.historyComplete?'disponible en la muestra':'parcial'}</span>
  {telemetry.missingOrFailed.length>0&&<span>Por conectar/revisar: {telemetry.missingOrFailed.join(', ')}</span>}
 </div>;
}
