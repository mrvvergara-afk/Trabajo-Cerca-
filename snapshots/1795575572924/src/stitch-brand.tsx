/** Identidad común de Trabajo Cerca en web, PWA y secciones de la aplicación. */
export function StitchBrand({subtitle='Inicio'}:{subtitle?:string}) {
  return <span className='tcStitchBrand tcUnifiedBrand' aria-label='Trabajo Cerca'>
    <img className='tcStitchBrandArt' src='/brand/trabajo-cerca-simbolo.svg?v=20261121-lab-reference'
      width='64' height='64' alt='' decoding='async'/>
    <span className='tcOfficialBrandName'>Trabajo Cerca</span>
    <span className='tcBrandSubtitle' aria-hidden='true'>{subtitle}</span>
  </span>;
}
