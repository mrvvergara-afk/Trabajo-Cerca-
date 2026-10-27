import {useState, type ReactNode} from 'react';

type CampaignView = {id:string; label:string; banner:ReactNode};
/** Present allocated slots in Stitch's single editorial viewport.
 * Only the visible banner intersects; mounted observers keep their per-creative deduplication.
 * No additional campaign is selected, no timer rotates inventory, and paid slots stay outside.
 */
export function StitchAdvertising({campaigns}:{campaigns:CampaignView[]}) {
  const [selected,setSelected]=useState('search');
  const active=campaigns.find(c=>c.id===selected)??campaigns[0];
  if(!active)return null;
  return <>
    <div className='tcCampaignSelector' role='group' aria-label='Campañas disponibles'>
      {campaigns.map(c=><button key={c.id} type='button' aria-pressed={active.id===c.id} aria-controls={'tc-editorial-'+c.id} onClick={()=>setSelected(c.id)}>{c.label}</button>)}
    </div>
    {campaigns.map(c=><div key={c.id} id={'tc-editorial-'+c.id} hidden={active.id!==c.id}>{c.banner}</div>)}
  </>;
}
