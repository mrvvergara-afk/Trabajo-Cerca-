import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStories,extractJsonText,postIdentity,mergeStories,visiblePost } from '../scripts/radar_v2_social.mjs';
import { postSnapshot,hoveredDate } from '../scripts/radar_v2_dom.mjs';
import vm from 'node:vm';

const profile='https://www.facebook.com/municipalidadrenaico';
const url=profile+'/posts/pfbidABCDEFGHIJKLMNOPQRSTUVWX';
const now=Date.parse('2026-10-14T10:00:00Z'),epoch=Math.floor(Date.parse('2026-10-12T10:00:00Z')/1000);
const story={__typename:'Story',id:'public-story-id',permalink_url:url,creation_time:epoch,
  message:{text:'Se necesita operador. Empresa: Ficticia. Lugar de trabajo: Renaico.'},
  attachments:[{media:{image:{uri:'https://scontent.example.fbcdn.net/notice.png'}}}]};

test('Only individual posts from the reviewed publisher retain identity; tracking is removed',()=>{
  assert.equal(postIdentity(url+'?__cft__=opaque',profile),url);
  for(const value of [profile,'https://www.facebook.com/other/posts/pfbidABCDEFGHIJKLMNOPQRSTUVWX',
    'https://facebook.com.evil.example/municipalidadrenaico/posts/12345','https://user:secret@www.facebook.com/municipalidadrenaico/posts/12345'])assert.equal(postIdentity(value,profile),null);
});
test('A literal timestamp and attachment belong to the same Story and exact post URL',()=>{
  const [row]=extractStories({data:{story}},profile,now,'a'.repeat(64));
  assert.equal(row.source_published_at,'2026-10-12T10:00:00.000Z');
  assert.equal(row.date_proof.post_url,url);assert.equal(row.date_proof.literal_epoch,epoch);
  assert.equal(row.media.length,1);assert.match(row.text,/Empresa: Ficticia/);
});
test('Related posts, current capture time, relative labels and another Story ID cannot supply a date',()=>{
  const values=[{...story,creation_time:undefined,message:{text:'Se necesita operador hace 4 días'}},
    {...story,creation_time:undefined}, {...story,creation_time:Math.floor(now/1000)+100}];
  for(const value of values)assert.equal(extractStories(value,profile,now)[0].source_published_at,null);
  const rows=extractStories([{...story,creation_time:undefined},{__typename:'Story',id:'another-story',creation_time:epoch}],profile,now);
  assert.equal(rows[0].source_published_at,null);
});
test('Fragments join only by their exact Story ID and ambiguous dates remain unknown',()=>{
  const rows=extractStories([{...story,creation_time:undefined},{__typename:'Story',id:story.id,creation_time:epoch}],profile,now);
  assert.equal(rows[0].source_published_at,'2026-10-12T10:00:00.000Z');
  assert.equal(extractStories([story,{...story,creation_time:epoch+86400}],profile,now)[0].source_published_at,null);
});
test('Ordinary profile text and credentials in a response are never emitted as notice evidence',()=>{
  const raw=JSON.stringify({token:'private-token',cookie:'private-cookie',story:{...story,message:{text:'Actividad cultural municipal'}}});
  const row=extractJsonText(raw,profile,now)[0];assert.equal(row.text,'');
  assert.ok(!JSON.stringify(row).includes('private-token'));assert.ok(!JSON.stringify(row).includes('private-cookie'));
});
test('A later undated observation never revives a conflicted original timestamp',()=>{
  const a=extractStories(story,profile,now)[0],b={...a,source_published_at:'2026-10-13T10:00:00.000Z'};
  const [row]=mergeStories([a,b,{...a,source_published_at:null,date_proof:null}]);
  assert.equal(row.source_published_at,null);assert.equal(row.date_proof,null);
});
test('A visible full date requires a bound public post and never accepts a relative label',()=>{
  const base={url,caption:'Se necesita operador',images:[{url:'https://scontent.example.fbcdn.net/notice.png',alt:'image of text'}],
    date_label:'Monday, October 12, 2026 at 7:00AM',literal_epoch:epoch,timezone:'America/Santiago'};
  assert.equal(visiblePost(base,profile,now).date_proof.kind,'facebook_visible_datetime');
  assert.equal(visiblePost({...base,date_label:'2 days ago'},profile,now).source_published_at,null);
  assert.equal(visiblePost({...base,url:'https://www.facebook.com/other/posts/12345'},profile,now),null);
});
test('Browser function transport preserves regexes and cannot borrow a related article or a yearless tooltip',()=>{
  const fakeDocument={querySelectorAll:()=>[],querySelector:selector=>selector.includes('og:url')?{content:url}:selector.includes('og:description')?{content:'Se necesita operador'}:null};
  const result=vm.runInNewContext('('+postSnapshot.toString()+')('+JSON.stringify(url)+')',{document:fakeDocument,URL});
  assert.equal(result.caption,'Se necesita operador');assert.equal(result.hover,null);
  const label=vm.runInNewContext('('+hoveredDate.toString()+')()',{document:{querySelectorAll:()=>[{innerText:'2 days ago'}]},Date});
  assert.equal(label.literal_epoch,null);
});
