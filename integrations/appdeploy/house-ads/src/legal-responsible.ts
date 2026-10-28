// Owner-supplied details only. Release gate must reject pending identification.
type Responsible = {
  fullName:string|null;
  address?:string|null;
  commune:string|null;
  country:string|null;
  privacyEmail:string;
  ownerConfirmed:boolean;
};
export const LEGAL_RESPONSIBLE:Responsible = {
  fullName:null as string|null,
  commune:null as string|null,
  country:null as string|null,
  privacyEmail:'trabajocerca.malleco.biobio@gmail.com',
  ownerConfirmed:false,
};
