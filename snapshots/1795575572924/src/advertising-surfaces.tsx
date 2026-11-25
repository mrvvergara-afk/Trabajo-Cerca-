import { useEffect, useRef } from 'react';
import {useRespectfulCarousel} from './respectful-carousel';
import { recordCommercialEvent } from './commercial-event-client';
import { ArrowRight, MapPin, Megaphone, Store, TreePine } from 'lucide-react';
import type { Goal, Selection, Slot } from '../shared/house-ads';
import { useAdvertising, sendHouseEvent, type HouseAttribution } from './house-advertising';
import { safeSponsorUrl } from './territorial-exploration';
import { presentHouseCreative } from './house-creative-presentation';
import { AdImage } from './ad-image';
import {STORIES,houseSequence} from './house-slide-content';
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
  const {index:illustrationSlide,choose,attach,onTouchStart,onTouchEnd,hoverHandlers}=
    useRespectfulCarousel((house?.campaign.id||'house-explore')+':'+(house?.creative.id||'a'),6);
  const goal=house?.campaign.goal??'explore';
  const creative=house?presentHouseCreative(house.campaign.id,house.creative):null;
  const isPhotoOffer=house?.campaign.id==='house-inclusion';
  const galleryImages=houseSequence(house?.campaign.id||'house-explore');
  const artwork=galleryImages[illustrationSlide]||'explore';
  const story=STORIES[artwork],first=illustrationSlide===0;
  const title=first&&creative?.title?creative.title:story.title;
  const copy=first&&creative?.mobileMessage?creative.mobileMessage:story.mobile;
  const cta=first&&creative?.button?creative.button:story.cta;
  const label=story.eyebrow,slideGoal=first?goal:story.goal;

  function click() {
    const attribution={campaignId:house?.campaign.id??'house-explore',creativeId:house?.creative.id??'a'};
    if(house)sendHouseEvent(attribution,'click');
    onGoal(slideGoal,attribution);
  }

  return <aside className='tcInlineHousePromo' data-placement={slot} data-goal={goal}
    data-house-kind={isPhotoOffer?'showcase':'community'} aria-label='Autopromoción de Trabajo Cerca'
    onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} {...hoverHandlers}>
    <span className='tcInlineHouseIcon' ref={attach}>
      <img className='tcHouseFallbackThumb' src={'/house-creatives/'+artwork+'.svg'} alt=''
        loading={slot==='search'?'eager':'lazy'} decoding='async'/>
      {first && creative?.storagePath && !creative.imageDisabled && creative.imageUrl && <AdImage url={creative.imageUrl}/>}
      <Megaphone aria-hidden='true'/>
      <span className='tcInlineGalleryControls' role='group' aria-label='Cambiar imagen de la campaña'>
        {galleryImages.map((art,index)=><button type='button' key={art}
          aria-label={'Ver imagen '+(index+1)+' de 6: '+STORIES[art].eyebrow}
          aria-pressed={illustrationSlide===index} title={STORIES[art].eyebrow}
          onClick={()=>choose(index)}><span className='tcScreenreaderOnly'>{index+1}</span></button>)}
      </span>
    </span>
    <div className='tcInlineHouseCopy'>
      <small>{label}{place==='Todas'?'':' · '+place}</small>
      <strong>{title}</strong>
      <p>{copy}</p>
      {first && isPhotoOffer && <span className='tcPromoBenefit'>📸 Fotos de tus trabajos · Contacto directo</span>}
    </div>
    <button type='button' onClick={click}>{cta} <ArrowRight aria-hidden='true'/></button>
  </aside>;
}

/** Boceto 3 aprobado: publicidad editorial, discreta, debajo del selector de localidad. */
export function FormEditorialPromotion({place}:{place:string}) {
  const advertising=useAdvertising(place,'Todas','forms',['form']);
  const selected=advertising.selections.form;
  const commercial=selected?.type==='COMMERCIAL'?selected.campaign:null;
  const house=selected?.type==='HOUSE_AD'?selected:null;
  const creative=house?presentHouseCreative(house.campaign.id,house.creative):null;
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
        recordCommercialEvent({
          campaignId:commercial.id,event:'impression',place,placement:'form',
        });
      },1000);
    },{threshold:[0,.5,1]});
    observer.observe(node.current);
    return()=>{observer.disconnect();if(timer)clearTimeout(timer);};
  },[commercial?.id,place]);

  function trackClick() {
    if(!commercial)return;
    recordCommercialEvent({
      campaignId:commercial.id,event:'click',place,placement:'form',
    });
  }

  return <aside ref={node} className='tcFormEditorialAd'
    data-ad-type={commercial?'COMMERCIAL':'HOUSE_AD'}
    aria-label={commercial?'Publicidad local de '+commercial.businessName:'Autopromoción de Trabajo Cerca'}>
    <div className='tcFormEditorialArt' aria-hidden='true'>
      {!commercial && <img className='tcFormHouseFallback' src={'/house-creatives/'+(house?.campaign.id.replace(/^house-/,'')||'explore')+'.svg'} alt='' loading='lazy'/>}
      {!commercial && creative?.imageUrl && <AdImage url={creative.imageUrl}/>}
      <Store />
      <TreePine />
    </div>
    <div className='tcFormEditorialCopy'>
      <small><MapPin aria-hidden='true'/> {commercial?'PUBLICIDAD LOCAL':'PROMOCIÓN PROPIA'} · {place}</small>
      <p><strong>{commercial?.businessName||creative?.title||'Tu comuna, tus oportunidades.'}</strong>{' '}
        {commercial?.headline||creative?.mobileMessage||'Muestra tu experiencia y encuentra personas cerca.'}</p>
    </div>
    {commercial && url ?
      <a className='tcFormEditorialLink' href={url} target='_blank'
        rel='noopener noreferrer sponsored' onClick={trackClick}>
        {commercial.ctaLabel||'Ver negocio'} <ArrowRight aria-hidden='true'/>
      </a>
    : !commercial ?
      <a className='tcFormEditorialLink' href={window.location.pathname} target='_blank'
        rel='noopener noreferrer'>Explorar Trabajo Cerca <ArrowRight aria-hidden='true'/></a>
    : null}
  </aside>;
}
