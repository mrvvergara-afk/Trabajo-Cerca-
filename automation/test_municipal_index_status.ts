import assert from 'node:assert/strict';
import { municipalOfferStatusFromHtml } from '../appdeploy_staging/municipal-index-status';
const index='https://www.munimulchen.cl/pagina-central-ofertas-laborales/';
const target='https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/';
const another='https://www.munimulchen.cl/oferta-laboral-otra/';
const html='<div><a href="'+another+'">Postulación Cerrada OTRA OFERTA</a></div>'+
  '<section><a href="'+target+'"><span>Postulación Abierta</span> OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS</a></section>';
assert.equal(municipalOfferStatusFromHtml(html,target,index),'open');
assert.equal(municipalOfferStatusFromHtml(html,another,index),'closed');
assert.equal(municipalOfferStatusFromHtml('<a href="'+target+'">Postulación Cerrada OPERARIOS</a>',target,index),'closed');
assert.equal(municipalOfferStatusFromHtml('<div>Postulación Abierta</div><a href="'+target+'">Operarios</a>',target,index),'unknown');
assert.equal(municipalOfferStatusFromHtml('<a href="'+another+'">Postulación Abierta</a>',target,index),'unknown');
assert.equal(municipalOfferStatusFromHtml('<a href="https://evil.example/'+target.split('/').pop()+'">Postulación Abierta</a>',target,index),'unknown');
console.log('Municipal individual index status: 6 safety cases passed');
