import { socialApplicationDestination, socialExplicitClosure, type SocialEvidence } from './social-evidence';

type ApplicationPage = { status:number; raw:string; error?:string };

// The original caption and poster have already been read. Check the stated
// application route without reading the social platform a second time.
export async function checkSocialApplication(evidence:SocialEvidence, readPage:(url:string)=>Promise<ApplicationPage>) {
  const application=socialApplicationDestination(evidence.text,evidence.contact);
  if (!application) return {status:'pending',reason:'Falta una forma de postular en el aviso.'};
  if (socialExplicitClosure(evidence.text)) return {status:'closed',reason:'La publicación indica que la postulación está cerrada.'};
  if (application.kind!=='url') return {status:'ready',reason:'Postulación por '+
    (application.kind==='address' ? 'dirección presencial' : application.kind==='email' ? 'correo' : 'teléfono')+' indicada en el aviso.'};
  try {
    const page=await readPage(application.value);
    if (page.error || page.status!==200) return {status:'pending',reason:'No se pudo comprobar el destino de postulación: '+(page.error || 'HTTP '+page.status)+'.'};
    const text=page.raw.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
    if (/verify you are human|captcha|iniciar sesi[oó]n|log in to continue/i.test(text)) return {status:'pending',reason:'El destino de postulación requiere acceso no disponible en esta lectura pública.'};
    if (socialExplicitClosure(text)) return {status:'closed',reason:'El destino indicado informa el cierre de la postulación.'};
    return {status:'ready',reason:'Enlace de postulación accesible; datos del empleo conservados en afiche y texto originales.'};
  } catch {
    return {status:'pending',reason:'El destino de postulación no estuvo disponible en esta lectura pública.'};
  }
}
