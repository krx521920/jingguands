/** 有限十进制；计算全程 BigInt，公开接口使用字符串。 */
import {normalize} from './vendor_D9/decimal_D9.mts';
export function decimal(v){
  if(!['string','number'].includes(typeof v)||(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)))return null;
  const s=String(v).trim();if(s.length>120||! /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))return null;
  const t=s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;return t==='-0'?'0':t;
}
const parts=s=>{const [a,b='']=s.split('.');return [BigInt(a+b),b.length];};
const render=(v,n)=>{const sign=v<0n?'-':'';const s=(v<0n?-v:v).toString().padStart(n+1,'0');return decimal(sign+(n?s.slice(0,-n)+'.'+s.slice(-n):s));};
export function sum(xs){const ds=xs.map(decimal);if(ds.some(x=>x===null))return null;const n=Math.max(0,...ds.map(x=>parts(x)[1]));return render(ds.reduce((s,x)=>{const [v,k]=parts(x);return s+v*10n**BigInt(n-k);},0n),n);}
export function multiply(a,b){a=decimal(a);b=decimal(b);if(a===null||b===null)return null;const [x,m]=parts(a),[y,n]=parts(b);return render(x*y,m+n);}
export function compare(a,b){a=decimal(a);b=decimal(b);if(a===null||b===null)return null;const [x,m]=parts(a),[y,n]=parts(b),k=Math.max(m,n);const d=x*10n**BigInt(k-m)-y*10n**BigInt(k-n);return d<0n?-1:d>0n?1:0;}
export function normalizeStated(raw,unit,kind='shares'){
  const v=decimal(raw);if(v===null)return null;
  try{return normalize({kind,rawText:`${raw}${unit}`,rawValue:v,sourceUnit:unit,qualifier:'exact',scope:'unknown',status:v==='0'?'explicit_zero':'present',denominator:null},{allowUnknownRatioDenominator:true}).value;}catch{return null;}
}
export function roundHalfUp(value,places){
  const d=decimal(value);if(d===null||!Number.isInteger(places)||places<0||places>30)return null;
  const [v,n]=parts(d);if(n<=places)return d;const div=10n**BigInt(n-places),abs=v<0n?-v:v;
  return render((abs/div+(abs%div*2n>=div?1n:0n))*(v<0n?-1n:1n),places);
}
