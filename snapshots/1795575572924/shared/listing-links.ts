export function listingShareUrl(base:string,id:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Error('invalid_listing_id');
  const url=new URL(base);url.search='';url.hash='';url.searchParams.set('listing',id);return url.toString();
}
