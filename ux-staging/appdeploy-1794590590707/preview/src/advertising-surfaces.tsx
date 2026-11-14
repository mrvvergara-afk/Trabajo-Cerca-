import { useEffect, useRef } from 'react';
import { api } from '@appdeploy/client';
import { ArrowRight, MapPin, Megaphone, Store, TreePine } from 'lucide-react';
import type { Goal, Selection, Slot } from '../shared/house-ads';
import { useAdvertising, sendHouseEvent, type HouseAttribution } from './house-advertising';
import { safeSponsorUrl } from './territorial-exploration';
import { presentHouseCreative } from './house-creative-presentation';
import './advertising-surfaces.css';

/** Se muestra como campaña propia cuando no existe una reserva comercial válida. */
export function InlineHousePromotion({
  selection,
  place,
  slot,
  onGoal,
}: {
  selection: Selection;
  place: string;
  slot: Slot;
  onGoal: (goal: Goal, attribution: HouseAttribution) => void;
}) {
  const house=selection?.type==='HOUSE_AD'?selection:null;
  const goal=house?.campaign.goal??'explore';
  const creative=house?presentHouseCreative(house.campaign.id,house.creative):null;
  const title=creative?.title||'Lo que necesitas puede estar cerca.';
  const copy=creative?.mobileMessage||'Encuentra empleos, personas y servicios de tu territorio.';
  const cta=creative?.button||'Explorar oportunidades';
  const isPhotoOffer=house?.campaign.id==='house-inclusion';
  const label=isPhotoOffer?'PUBLICAR ES GRATIS':goal==='professional'?'TU TRABAJO VALE'
    :goal==='advertiser'?'DA A CONOCER TU NEGOCIO'
    :goal==='employer'?'PERSONAS CERCA DE TI':'TRABAJO CERCA · 12 COMUNAS';

  function click() {
    const attribution={campaignId:house?.campaign.id??'house-explore',creativeId:house?.creative.id??'a'};
    if(house)sendHouseEvent(attribution,'click');
    onGoal(goal,attribution);
  }

  return <aside className='tcInlineHousePromo' data-placement={slot} data-goal={goal}
    data-house-kind={isPhotoOffer?'showcase':'community'} aria-label='Autopromoción de Trabajo Cerca'>
    <span className='tcInlineHouseIcon'><Megaphone aria-hidden='true'/></span>
    <div className='tcInlineHouseCopy'>
      <small>{label}{place==='Todas'?'':' · '+place}</small>
      <strong>{title}</strong>
      <p>{copy}</p>
      {isPhotoOffer && <span className='tcPromoBenefit'>📸 Fotos de tus trabajos · Contacto directo</span>}
    </div>
    <button type='button' onClick={click}>{cta} <ArrowRight aria-hidden='true'/></button>
  </aside>;
}

/** Boceto 3 aprobado: publicidad editorial, discreta, debajo del selector de localidad. */
export function FormEditorialPromotion({place}:{place:string}) {
  const advertising=useAdvertising(place,'Todas','forms',['form']);
  const selected=advertising.selections.form;
  const commercial=selected?.type==='COMMERCIAL'?selected.campaign:null;
  const url=safeSponsorUrl(commercial?.url);
  const node=useRef<HTMLElement>(null);
  const seen=useRef(new Set<string>());

  useEffect(()=>{
    if(!commercial||!node.current||typeof IntersectionObserver==='undefined')return;
    const key=commercial.id+':'+place;
    if(seen.current.has(key))return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let visible=false;
    const observer=new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=0.5);
      if(timer)clearTimeout(timer);
      if(!visible||document.visibilityState!=='visible'||seen.current.has(key))return;
      timer=setTimeout(()=>{
        if(!visible||seen.current.has(key)||document.visibilityState!=='visible')return;
        seen.current.add(key);
        void api.post('/api/growth/commercial-events',{
          campaignId:commercial.id,event:'impression',eventId:crypto.randomUUID(),place,placement:'form',
        }).catch(()=>undefined);
      },1000);
    },{threshold:[0,.5,1]});
    observer.observe(node.current);
    return()=>{observer.disconnect();if(timer)clearTimeout(timer);};
  },[commercial?.id,place]);

  function trackClick() {
    if(!commercial)return;
    void api.post('/api/growth/commercial-events',{
      campaignId:commercial.id,event:'click',eventId:crypto.randomUUID(),place,placement:'form',
    }).catch(()=>undefined);
  }

  return <aside ref={node} className='tcFormEditorialAd'
    data-ad-type={commercial?'COMMERCIAL':'HOUSE_AD'}
    aria-label={commercial?'Publicidad local de '+commercial.businessName:'Autopromoción de Trabajo Cerca'}>
    <div className='tcFormEditorialArt' aria-hidden='true'>
      <Store />
      <TreePine />
    </div>
    <div className='tcFormEditorialCopy'>
      <small><MapPin aria-hidden='true'/> {commercial?'PUBLICIDAD LOCAL':'PROMOCIÓN PROPIA'} · {place}</small>
      <p><strong>{commercial?.businessName||'Trabajo Cerca'}</strong>{' '}
        {commercial?.headline||'Conectamos personas, empleo y servicios de tu zona.'}</p>
    </div>
    {commercial && url ?
      <a className='tcFormEditorialLink' href={url} target='_blank'
        rel='noopener noreferrer sponsored' onClick={trackClick}>
        {commercial.ctaLabel||'Ver negocio'} <ArrowRight aria-hidden='true'/>
      </a>
    : !commercial ?
      <a className='tcFormEditorialLink' href={window.location.pathname} target='_blank'
        rel='noopener noreferrer'>Conocer plataforma <ArrowRight aria-hidden='true'/></a>
    : null}
  </aside>;
}
