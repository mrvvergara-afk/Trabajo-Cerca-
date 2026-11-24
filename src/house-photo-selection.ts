import {safeAdImage} from '../shared/ad-images';

/**
 * Institutional carousel media: prefer the administrator-approved creative on
 * the campaign's first slide; use the matching original institutional photo
 * on secondary slides. Disabled means disabled across the entire carousel.
 *
 * Fail closed for arbitrary URLs. <AdImage> handles image load failures and
 * exposes the existing SVG underneath rather than rendering a broken card.
 */
export function selectHousePhotoUrl(input:{
  imageDisabled?:boolean;
  customUrl?:string;
  defaultUrl?:string;
  firstSlide:boolean;
}):string|undefined {
  if(input.imageDisabled===true) return undefined;
  const custom=input.firstSlide?safeAdImage(input.customUrl):undefined;
  return custom??safeAdImage(input.defaultUrl);
}
