/** Conservative commercial-media policy. Legacy cover can be a logo,
 * and needs to remain visible when additional photographs are present.
 * The logo is never inferred from any unrelated supplemental slide.
 */
export type AdSlide = {
  id:string; kind:'image'|'hours'|'products'|'contact';
  title:string; body:string; imageUrl?:string;
};
export type AdMediaCampaign={
  headline:string; imageUrl?:string; logoUrl?:string; slides?:AdSlide[];
};
export function persistentBusinessLogo(campaign:AdMediaCampaign):string|undefined {
  if(campaign.logoUrl) return campaign.logoUrl;
  if((campaign.slides?.length??0)>0) return campaign.imageUrl;
  return undefined;
}
export function gallerySlides(campaign:AdMediaCampaign):AdSlide[] {
  const extras=(campaign.slides??[]).slice(0,4);
  const cover=campaign.imageUrl||campaign.logoUrl;
  // A separate approved logo must not consume the primary photo's slot.
  if(extras.length) {
    return campaign.logoUrl&&campaign.imageUrl&&campaign.logoUrl!==campaign.imageUrl
      ?[{id:'cover',kind:'image',title:campaign.headline,body:'',imageUrl:campaign.imageUrl},...extras]
      :extras;
  }
  return [{id:'cover',kind:'image',title:campaign.headline,body:'',imageUrl:cover}];
}
