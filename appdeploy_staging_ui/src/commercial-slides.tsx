import {useRespectfulCarousel} from './respectful-carousel';
import type {CommercialSlide} from '../shared/house-ads';
import {gallerySlides} from './commercial-media-policy';
import './commercial-slides.css';
type Campaign={id:string;businessName:string;headline:string;imageUrl?:string;logoUrl?:string;slides?:CommercialSlide[]};
export function CommercialSlides({campaign}:{campaign:Campaign}){
 const slides=gallerySlides(campaign);
 const {index,choose,attach,onTouchStart,onTouchEnd,hoverHandlers}=
   useRespectfulCarousel(campaign.id+':'+slides.map(s=>s.id).join('|'),slides.length);
 const slide=slides[index]||slides[0];
 const info=!slide.imageUrl && slide.kind!=='image';
 return <div className='tcCommercialSlides' ref={attach} role='group' aria-label={'Galería de '+campaign.businessName}
   data-slide-kind={slide.kind} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} {...hoverHandlers}>
   {slide.imageUrl?<img key={slide.id} loading='lazy' decoding='async' src={slide.imageUrl}
      alt={'Imagen de '+campaign.businessName+' · '+slide.title}/>:
      info?<div className='tcCommercialSlideInfo' key={slide.id}>
        <small>{slide.kind==='hours'?'HORARIOS':slide.kind==='contact'?'DÓNDE ENCONTRARNOS':'PRODUCTOS Y SERVICIOS'}</small>
        <strong>{slide.title}</strong><span>{slide.body}</span>
      </div>:
      <span className='tcCommercialSlideInitial'>{campaign.businessName.slice(0,1)}</span>}
   {slide.imageUrl&&slide.id!=='cover'&&<div className='tcCommercialSlideCaption'><strong>{slide.title}</strong><span>{slide.body}</span></div>}
   {slides.length>1&&<div className='tcCommercialSlideButtons' role='group' aria-label='Ver más información'>
      {slides.map((s,i)=><button type='button' key={s.id} aria-pressed={index===i}
        aria-label={'Ver lámina '+(i+1)+' de '+slides.length} onClick={()=>choose(i)}><span className='tcScreenreaderOnly'>{i+1}</span></button>)}
   </div>}
 </div>;
}
