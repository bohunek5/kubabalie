(() => {
  'use strict';
  const FORMAT='ssc-pages-v2',encoder=new TextEncoder();
  const base=new URL('./',document.currentScript.src);
  const storageKey=`ssc-demo-access:${base.pathname}`;
  const form=document.getElementById('gate-form'),input=document.getElementById('gate-password'),remember=document.getElementById('gate-remember'),submit=document.getElementById('gate-submit'),label=document.getElementById('gate-submit-label'),message=document.getElementById('gate-message');
  const from64=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
  const to64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
  let busy=false,pendingEnvelope;
  function clearAccess(){try{sessionStorage.removeItem(storageKey);}catch{}}
  function setBusy(value){busy=value;input.disabled=value;submit.disabled=value;form.setAttribute('aria-busy',String(value));label.textContent=value?'Otwieranie prezentacji…':'Otwórz prezentację';}
  async function envelope(){
    if(!pendingEnvelope)pendingEnvelope=(async()=>{
      const response=await fetch(new URL('app.encrypted.json',base),{cache:'no-cache',credentials:'same-origin'});
      if(!response.ok)throw new Error('download');
      const data=await response.json();
      if(data.format!==FORMAT||data.kdf!=='PBKDF2'||data.hash!=='SHA-256'||data.iterations!==600000||from64(data.salt).length!==32||from64(data.iv).length!==12||typeof data.ciphertext!=='string'||data.ciphertext.length>12000000)throw new Error('package');
      return data;
    })();
    try{return await pendingEnvelope;}catch(error){pendingEnvelope=undefined;throw error;}
  }
  async function derive(password,data){
    const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:from64(data.salt),iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},true,['decrypt']);
  }
  function filenameOf(value,applicationBase){
    const url=new URL(value,applicationBase);
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
    return decodeURIComponent(url.pathname.slice(base.pathname.length));
  }
  function absoluteStylesheet(css,filename){
    return css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi,(match,quote,value)=>/^(?:data:|blob:|#)/i.test(value)?match:`url("${new URL(value,new URL(filename,base)).href}")`);
  }
  function openApplication(app){
    if(app.format!==FORMAT||app.deployment?.base!==base.pathname||!app.files?.['index.html']||!app.files?.['js/main.js'])throw new Error('package');
    const original=location.pathname.startsWith(base.pathname+'oryginalny-konfigurator');
    const htmlFile=original?'oryginalny-konfigurator/index.html':'index.html';
    const applicationBase=original?new URL('oryginalny-konfigurator/',base):base;
    const parsed=new DOMParser().parseFromString(app.files[htmlFile],'text/html');
    const mappings={},urls=new Map();
    for(const script of parsed.querySelectorAll('script[type="importmap"]')){
      const prior=JSON.parse(script.textContent);
      if(prior.scopes)throw new Error('Unsupported scoped imports');
      for(const[specifier,target]of Object.entries(prior.imports||{}))if(!specifier.startsWith('aqua-private/'))mappings[specifier]=new URL(target,applicationBase).href;
      script.remove();
    }
    for(const[filename,contents]of Object.entries(app.files)){
      if(!filename.endsWith('.js'))continue;
      const url=URL.createObjectURL(new Blob([contents],{type:'text/javascript'}));
      urls.set(filename,url);mappings[`ssc-private/${filename}`]=url;
    }
    for(const link of parsed.querySelectorAll('link[rel="stylesheet"][href]')){
      const filename=filenameOf(link.getAttribute('href'),applicationBase);
      if(filename&&Object.hasOwn(app.files,filename)){
        const style=parsed.createElement('style');style.textContent=absoluteStylesheet(app.files[filename],filename);link.replaceWith(style);
      }else link.href=new URL(link.getAttribute('href'),applicationBase).href;
    }
    for(const script of parsed.querySelectorAll('script[type="module"][src]')){
      const filename=filenameOf(script.getAttribute('src'),applicationBase);
      if(!urls.has(filename))throw new Error('Missing private entry module');
      script.src=urls.get(filename);
    }
    parsed.querySelectorAll('base').forEach(element=>element.remove());
    const deployment=parsed.createElement('script');deployment.textContent=`globalThis.__SSC_DEPLOYMENT__=${JSON.stringify(app.deployment).replaceAll('<','\\u003c')};`;
    const importmap=parsed.createElement('script');importmap.type='importmap';importmap.textContent=JSON.stringify({imports:mappings});
    parsed.head.prepend(deployment,importmap);
    if(original){const tag=parsed.createElement('base');tag.href=applicationBase.href;parsed.head.prepend(tag);}
    input.value='';
    // Module blob URLs remain valid while this document is open, including lazy imports.
    document.open();document.write('<!doctype html>\n'+parsed.documentElement.outerHTML);document.close();
  }
  async function unlock(password,cached=null){
    if(busy)return;message.textContent='';setBusy(true);
    try{
      if(!crypto?.subtle)throw new Error('crypto');
      const data=await envelope();let key;
      if(cached){if(cached.salt!==data.salt)throw new Error('expired');key=await crypto.subtle.importKey('raw',from64(cached.key),'AES-GCM',false,['decrypt']);}
      else key=await derive(password,data);
      password='';
      const cleartext=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(data.iv),additionalData:encoder.encode(FORMAT),tagLength:128},key,from64(data.ciphertext));
      const app=JSON.parse(new TextDecoder().decode(cleartext));
      if(!cached){clearAccess();if(remember.checked){const raw=await crypto.subtle.exportKey('raw',key);try{sessionStorage.setItem(storageKey,JSON.stringify({salt:data.salt,key:to64(raw)}));}catch{}}}
      openApplication(app);
    }catch(error){
      if(cached)clearAccess();
      message.textContent=error.message==='crypto'?'Otwórz stronę przez HTTPS w aktualnej przeglądarce.':error.message==='download'||error instanceof TypeError?'Nie udało się pobrać prezentacji. Sprawdź połączenie i spróbuj ponownie.':error.message==='expired'?'Prezentacja została zaktualizowana. Wprowadź hasło ponownie.':error.name==='OperationError'?'Nieprawidłowe hasło. Spróbuj ponownie.':'Nie udało się otworzyć prezentacji. Odśwież stronę i spróbuj ponownie.';
      setBusy(false);input.focus();input.select();
    }
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())unlock(input.value);});
  document.getElementById('gate-reveal').addEventListener('click',event=>{const show=input.type==='password';input.type=show?'text':'password';event.currentTarget.setAttribute('aria-pressed',String(show));event.currentTarget.setAttribute('aria-label',show?'Ukryj hasło':'Pokaż hasło');input.focus();});
  try{const cached=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(cached?.key&&cached?.salt)unlock('',cached);}catch{clearAccess();}
})();
