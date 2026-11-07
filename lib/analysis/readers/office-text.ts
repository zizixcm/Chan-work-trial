import {unzipSync} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

/** Reject archive expansion, external entities, embedded executable content. */
export function wordParts(bytes:Uint8Array){
 let expanded=0,count=0;
 const parts=unzipSync(bytes,{filter(entry){
  expanded+=entry.originalSize;if(expanded>30*1024*1024||++count>3000)throw Error('Word archive bounds');
  if(/vbaProject|\.bin$/i.test(entry.name))throw Error('Embedded binary content');
  return true;
 }});
 if(!parts['[Content_Types].xml']||!parts['word/document.xml'])throw Error('Invalid Word file');
 for(const [name,value] of Object.entries(parts))if(/\.xml$|\.rels$/.test(name)){
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(value);
  if(/<!DOCTYPE|<!ENTITY|documentProtection/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('Invalid or protected Word XML');
 }
 return parts;
}
export function wordParagraphs(bytes:Uint8Array){
 const parts=wordParts(bytes),paragraphs:Array<{location:string;text:string}>=[];
 const limitations:string[]=[];
 if(Object.keys(parts).some(k=>/^word\/(media|charts|embeddings)\//.test(k)))limitations.push('Word embedded visuals/objects are not covered by text extraction.');
 for(const name of Object.keys(parts).filter(k=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(k)).sort()){
  const xml=new TextDecoder().decode(parts[name]);
  if(/<(?:\w+:)?(?:del|ins|altChunk)\b/.test(xml))limitations.push('Word tracked changes or imported content require original-document review.');
  const tree=new XMLParser({preserveOrder:true,removeNSPrefix:true,ignoreAttributes:true,parseTagValue:false}).parse(xml);
  let index=0;
  const text=(nodes:any[]):string=>nodes.map(node=>Object.entries(node).map(([key,value])=>key==='#text'?String(value):key==='tab'?'\t':key==='br'?'\n':Array.isArray(value)?text(value):'').join('')).join('');
  const walk=(nodes:any[])=>{for(const node of nodes)for(const [key,value] of Object.entries(node))if(Array.isArray(value)){
   if(key==='p')paragraphs.push({location:`${name}, paragraph ${++index}`,text:text(value)});
   else walk(value);
  }};walk(tree);
 }
 return {paragraphs,limitations};
}
export function plainText(bytes:Uint8Array){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(!text.trim()||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text))throw Error('Not plain text');
 return text;
}
