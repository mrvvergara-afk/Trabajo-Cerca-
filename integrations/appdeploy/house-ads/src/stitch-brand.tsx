/** Assets supplied in the approved Stitch export; no tracking or data access. */
export function StitchBrand({subtitle='Inicio'}:{subtitle?:string}) {
  return <span className='tcStitchBrand'>
    <picture className='tcStitchBrandArt'>
      <source media='(max-width: 767px)' srcSet='/brand/trabajo-cerca-compact.svg' />
      <img src='/brand/trabajo-cerca-horizontal.svg' width='520' height='120' alt='Trabajo Cerca · Radar laboral territorial' />
    </picture>
    <span className='tcStitchMobileWordmark' aria-hidden='true'><b>Trabajo Cerca</b><small>{subtitle}</small></span>
  </span>;
}
