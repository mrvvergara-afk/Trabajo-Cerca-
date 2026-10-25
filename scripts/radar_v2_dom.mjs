// These functions execute only in the public browser through their source text.
export function postSnapshot(url) {
  const clean=value=>{try{const item=new URL(value);return item.origin+item.pathname.replace(/\/$/,'');}catch{return '';}};
  const anchors=[...document.querySelectorAll('a[href]')].filter(a=>clean(a.href)===url);
  const times=anchors.filter(a=>{const b=a.getBoundingClientRect();return b.width>0 && b.width<180 && b.height>0 && b.height<60;});
  times.sort((a,b)=>Number(!/ago|hace|^\d+\s*[hdwm]$/i.test(a.innerText || ''))-Number(!/ago|hace|^\d+\s*[hdwm]$/i.test(b.innerText || '')));
  const rect=times[0]?.getBoundingClientRect();
  const article=[...document.querySelectorAll('[role="article"]')].find(node=>[...node.querySelectorAll('a[href]')].some(a=>clean(a.href)===url));
  const message=article?.querySelector('[data-ad-comet-preview="message"],[data-ad-preview="message"],[data-ad-rendering-role="story_message"]');
  const og=document.querySelector('meta[property="og:url"]')?.content;
  const caption=message?.innerText || (clean(og)===url ? document.querySelector('meta[property="og:description"]')?.content : '') || '';
  const images=[...(article?.querySelectorAll('img[src]') || [])].filter(img=>img.naturalWidth>=250 && img.naturalHeight>=180).slice(0,6).map(img=>({url:img.src,alt:img.alt}));
  const ogImage=clean(og)===url ? document.querySelector('meta[property="og:image"]')?.content : null;
  if(!images.length && ogImage)images.push({url:ogImage,alt:''});
  return {url,caption,images,hover:rect?{x:rect.x+rect.width/2,y:rect.y+rect.height/2}:null};
}

export function hoveredDate() {
  const label=[...document.querySelectorAll('[role="tooltip"]')].map(node=>node.innerText).find(text=>/\b20\d{2}\b/.test(text)) || '';
  const date=Date.parse(label.replace(/ at /i,' ').replace(/(\d)(AM|PM)/gi,'$1 $2'));
  return {date_label:label,literal_epoch:Number.isFinite(date)?date/1000:null,timezone:'America/Santiago'};
}
