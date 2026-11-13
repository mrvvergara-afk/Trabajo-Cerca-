import {useState,type FormEvent} from 'react';
import {api} from '@appdeploy/client';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
export function OwnedPublicationEditor({item,ownerToken,onSaved}:{item:{id:string;title:string;note:string;workLocation:string};ownerToken:string;onSaved:()=>void}){
  const [title,setTitle]=useState(item.title);const [detail,setDetail]=useState(item.note);
  const [place,setPlace]=useState(item.workLocation);const [contact,setContact]=useState('');
  const [renew,setRenew]=useState(false);const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function save(e:FormEvent){e.preventDefault();setBusy(true);try{await api.post('/api/listings/'+item.id+'/manage',{ownerToken,title,detail,workLocation:place,contact,renew,consent});onSaved();}catch{setMessage('No se guardó. Revisa los datos y utiliza el dispositivo desde el que publicaste.');}finally{setBusy(false);}}
  return <details className='tcOwnedEditor'><summary>Editar o renovar mi publicación gratuita</summary><form onSubmit={save}>
    <label>Oficio, servicio o necesidad<input required maxLength={140} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Descripción<textarea maxLength={1200} value={detail} onChange={e=>setDetail(e.target.value)}/></label>
    <label>Comuna<select value={place} onChange={e=>setPlace(e.target.value)}>{COMMERCIAL_PLACES.map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Nuevo contacto, opcional; vacío conserva el actual<input maxLength={100} value={contact} onChange={e=>setContact(e.target.value)}/></label>
    <label><input type='checkbox' checked={renew} onChange={e=>setRenew(e.target.checked)}/>Renovar vigencia gratuitamente desde hoy</label>
    <label><input type='checkbox' required checked={consent} onChange={e=>setConsent(e.target.checked)}/>Autorizo a publicar estos cambios y facilitar mi contacto.</label>
    <p role='status'>{message}</p><button disabled={busy} type='submit'>{busy?'Guardando…':'Guardar cambios'}</button>
  </form></details>;
}
