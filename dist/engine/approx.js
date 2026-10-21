const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});export function marketRs(v){if(typeof v !=='number'||!Number.isFinite(v)||v<=0)return '';const step=10**(Math.floor(Math.log10(v))-2);return `Rs ${nf.format(Math.round(v/step)*step)}`;}
export function lakhRs(v){if(typeof v !=='number'||!Number.isFinite(v)||v<=0)return '';if(v<1e5)return marketRs(v);return `Rs ${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Math.round(v/1e4)/10)} lakh`;}
export function roughHours(v){if(typeof v !=='number'||!Number.isFinite(v)||v<0)return '';if(v>=1){const h=Math.floor(v*2+1e-9)/2;return `${nf.format(h)} ${h===1?'hour':'hours'}`;}
const m=Math.floor((v*60)/5+1e-9)*5;return m===0?'under 5 min':`${m} min`;}
