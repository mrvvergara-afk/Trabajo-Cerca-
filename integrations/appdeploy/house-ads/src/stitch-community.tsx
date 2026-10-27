import {ArrowRight, BadgeCheck, LockKeyhole, MapPin, PlusCircle, UserRoundSearch, Wrench} from 'lucide-react';

type Person = {id:string; title:string; workLocation:string; note:string};

/** Stitch's community block, populated only from public, approved profiles. */
export function StitchCommunity({person, onOffer, onBrowse, onSelect}:{
  person?:Person; onOffer:()=>void; onBrowse:()=>void; onSelect:(id:string)=>void;
}) {
  return <section className='tcStitchCommunity' aria-labelledby='tc-community-title'>
    <div className='tcStitchCommunityInner'>
      <div className='tcCommunityCopy'>
        <span className='tcStitchEyebrow'><Wrench aria-hidden='true'/> <span className='tcDesktopText'>Comunidad de Oficios Locales</span><span className='tcMobileText'>Fricción cero</span></span>
        <h2 id='tc-community-title'>¿Sabes hacer algo? <span>Que te encuentren<span className='tcDesktopText'> en tu comuna.</span></span></h2>
        <p>Electricidad, costura, jardinería, clases, mecánica o servicios profesionales. Sin currículum y 100% gratuito. Tu talento vale en tu propia comunidad.</p>
        <div className='tcCommunityBenefits'>
          <div><BadgeCheck aria-hidden='true'/><b>Publicación gratis</b><small>Sin comisiones por contacto ni cobros ocultos.</small></div>
          <div><LockKeyhole aria-hidden='true'/><b>Contacto directo</b><small>Con permisos y datos de contacto protegidos.</small></div>
          <div><Wrench aria-hidden='true'/><b>Todos los oficios</b><small>Desde reparaciones hasta servicios técnicos.</small></div>
        </div>
        <button type='button' className='tcCommunityOffer' onClick={onOffer}><PlusCircle aria-hidden='true'/> Ofrecer mi trabajo gratis</button>
      </div>
      <aside className='tcCommunityProfile' aria-label='Personas y oficios locales'>
        <div className='tcCommunityProfileTop'><span>Personas y oficios</span><UserRoundSearch aria-hidden='true'/></div>
        {person ? <>
          <h3>{person.title}</h3><p className='tcCommunityLocation'><MapPin aria-hidden='true'/>{person.workLocation}</p>
          <p className='tcCommunityDescription'>{person.note || 'Consulta el perfil para conocer su disponibilidad y forma de contacto.'}</p>
          <button type='button' onClick={()=>onSelect(person.id)}>Ver perfil <ArrowRight aria-hidden='true'/></button>
        </> : <>
          <h3>Tu oficio tiene un lugar aquí.</h3><p className='tcCommunityDescription'>Publica lo que sabes hacer y dónde puedes trabajar. Los perfiles disponibles se muestran en el catálogo.</p>
          <button type='button' onClick={onBrowse}>Ver personas y oficios <ArrowRight aria-hidden='true'/></button>
        </>}
      </aside>
    </div>
  </section>;
}
