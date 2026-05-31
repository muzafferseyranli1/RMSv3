const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-Fj3Oy67d.js","assets/index-CAVMx4m9.css"])))=>i.map(i=>d[i]);
import{r as b,j as a,_ as q,ay as H,d as T}from"./index-Fj3Oy67d.js";let ae={data:""},te=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||ae},re=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,se=/\/\*[^]*?\*\/|  +/g,W=/\n+/g,S=(e,t)=>{let s="",c="",u="";for(let d in e){let r=e[d];d[0]=="@"?d[1]=="i"?s=d+" "+r+";":c+=d[1]=="f"?S(r,d):d+"{"+S(r,d[1]=="k"?"":t)+"}":typeof r=="object"?c+=S(r,t?t.replace(/([^,])+/g,m=>d.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,p=>/&/.test(p)?p.replace(/&/g,m):m?m+" "+p:p)):d):r!=null&&(d=d[1]=="-"?d:d.replace(/[A-Z]/g,"-$&").toLowerCase(),u+=S.p?S.p(d,r):d+":"+r+";")}return s+(t&&u?t+"{"+u+"}":u)+c},A={},V=e=>{if(typeof e=="object"){let t="";for(let s in e)t+=s+V(e[s]);return t}return e},ie=(e,t,s,c,u)=>{let d=V(e),r=A[d]||(A[d]=(p=>{let f=0,y=11;for(;f<p.length;)y=101*y+p.charCodeAt(f++)>>>0;return"go"+y})(d));if(!A[r]){let p=d!==e?e:(f=>{let y,j,g=[{}];for(;y=re.exec(f.replace(se,""));)y[4]?g.shift():y[3]?(j=y[3].replace(W," ").trim(),g.unshift(g[0][j]=g[0][j]||{})):g[0][y[1]]=y[2].replace(W," ").trim();return g[0]})(e);A[r]=S(u?{["@keyframes "+r]:p}:p,s?"":"."+r)}let m=s&&A.g;return s&&(A.g=A[r]),((p,f,y,j)=>{j?f.data=f.data.replace(j,p):f.data.indexOf(p)===-1&&(f.data=y?p+f.data:f.data+p)})(A[r],t,c,m),r},le=(e,t,s)=>e.reduce((c,u,d)=>{let r=t[d];if(r&&r.call){let m=r(s),p=m&&m.props&&m.props.className||/^go/.test(m)&&m;r=p?"."+p:m&&typeof m=="object"?m.props?"":S(m,""):m===!1?"":m}return c+u+(r??"")},"");function B(e){let t=this||{},s=e.call?e(t.p):e;return ie(s.unshift?s.raw?le(s,[].slice.call(arguments,1),t.p):s.reduce((c,u)=>Object.assign(c,u&&u.call?u(t.p):u),{}):s,te(t.target),t.g,t.o,t.k)}let Q,$,D;B.bind({g:1});let _=B.bind({k:1});function oe(e,t,s,c){S.p=t,Q=e,$=s,D=c}function E(e,t){let s=this||{};return function(){let c=arguments;function u(d,r){let m=Object.assign({},d),p=m.className||u.className;s.p=Object.assign({theme:$&&$()},m),s.o=/go\d/.test(p),m.className=B.apply(s,c)+(p?" "+p:"");let f=e;return e[0]&&(f=m.as||e,delete m.as),D&&f[0]&&D(m),Q(f,m)}return u}}var ne=e=>typeof e=="function",F=(e,t)=>ne(e)?e(t):e,ce=(()=>{let e=0;return()=>(++e).toString()})(),de=(()=>{let e;return()=>{if(e===void 0&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),me=20,X="default",J=(e,t)=>{let{toastLimit:s}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,s)};case 1:return{...e,toasts:e.toasts.map(r=>r.id===t.toast.id?{...r,...t.toast}:r)};case 2:let{toast:c}=t;return J(e,{type:e.toasts.find(r=>r.id===c.id)?1:0,toast:c});case 3:let{toastId:u}=t;return{...e,toasts:e.toasts.map(r=>r.id===u||u===void 0?{...r,dismissed:!0,visible:!1}:r)};case 4:return t.toastId===void 0?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(r=>r.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let d=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(r=>({...r,pauseDuration:r.pauseDuration+d}))}}},ue=[],pe={toasts:[],pausedAt:void 0,settings:{toastLimit:me}},I={},R=(e,t=X)=>{I[t]=J(I[t]||pe,e),ue.forEach(([s,c])=>{s===t&&c(I[t])})},ee=e=>Object.keys(I).forEach(t=>R(e,t)),ge=e=>Object.keys(I).find(t=>I[t].toasts.some(s=>s.id===e)),P=(e=X)=>t=>{R(t,e)},fe=(e,t="blank",s)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...s,id:(s==null?void 0:s.id)||ce()}),L=e=>(t,s)=>{let c=fe(t,e,s);return P(c.toasterId||ge(c.id))({type:2,toast:c}),c.id},h=(e,t)=>L("blank")(e,t);h.error=L("error");h.success=L("success");h.loading=L("loading");h.custom=L("custom");h.dismiss=(e,t)=>{let s={type:3,toastId:e};t?P(t)(s):ee(s)};h.dismissAll=e=>h.dismiss(void 0,e);h.remove=(e,t)=>{let s={type:4,toastId:e};t?P(t)(s):ee(s)};h.removeAll=e=>h.remove(void 0,e);h.promise=(e,t,s)=>{let c=h.loading(t.loading,{...s,...s==null?void 0:s.loading});return typeof e=="function"&&(e=e()),e.then(u=>{let d=t.success?F(t.success,u):void 0;return d?h.success(d,{id:c,...s,...s==null?void 0:s.success}):h.dismiss(c),u}).catch(u=>{let d=t.error?F(t.error,u):void 0;d?h.error(d,{id:c,...s,...s==null?void 0:s.error}):h.dismiss(c)}),e};var be=_`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,he=_`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,xe=_`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,ye=E("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${be} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${he} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${xe} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,ve=_`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,je=E("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${ve} 1s linear infinite;
`,ke=_`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,Ne=_`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,we=E("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${ke} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${Ne} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,_e=E("div")`
  position: absolute;
`,Ce=E("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,Ae=_`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,Se=E("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${Ae} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Ee=({toast:e})=>{let{icon:t,type:s,iconTheme:c}=e;return t!==void 0?typeof t=="string"?b.createElement(Se,null,t):t:s==="blank"?null:b.createElement(Ce,null,b.createElement(je,{...c}),s!=="loading"&&b.createElement(_e,null,s==="error"?b.createElement(ye,{...c}):b.createElement(we,{...c})))},Ue=e=>`
0% {transform: translate3d(0,${e*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,ze=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${e*-150}%,-1px) scale(.6); opacity:0;}
`,Ie="0%{opacity:0;} 100%{opacity:1;}",Le="0%{opacity:1;} 100%{opacity:0;}",Be=E("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,Te=E("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,$e=(e,t)=>{let s=e.includes("top")?1:-1,[c,u]=de()?[Ie,Le]:[Ue(s),ze(s)];return{animation:t?`${_(c)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${_(u)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}};b.memo(({toast:e,position:t,style:s,children:c})=>{let u=e.height?$e(e.position||t||"top-center",e.visible):{opacity:0},d=b.createElement(Ee,{toast:e}),r=b.createElement(Te,{...e.ariaProps},F(e.message,e));return b.createElement(Be,{className:e.className,style:{...u,...s,...e.style}},typeof c=="function"?c({icon:d,message:r}):b.createElement(b.Fragment,null,d,r))});oe(b.createElement);B`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`;var w=h;const De=[{id:"kampanyalar",label:"Kampanyalar",desc:"Kampanyalar sayfasına gider."},{id:"siparis_ver",label:"Sipariş Ver",desc:"Sipariş (Paket/Masa) modalı açar."},{id:"telefon_et",label:"Telefon Et",desc:"Girdiğiniz numarayı arar."},{id:"kurumsal",label:"Kurumsal",desc:"Kurumsal bilgi veya site açar."},{id:"sosyal_medya",label:"Sosyal Medya",desc:"Sosyal medya hesaplarını listeler."},{id:"geri_bildirim",label:"Geri Bildirim",desc:"Geri bildirim sayfasını açar."},{id:"bize_ulasin",label:"Bize Ulaşın",desc:"WA, Mail, Telefon gibi iletişim kanallarını açar."},{id:"ozel_web",label:"Özel Web Sitesi",desc:"Girdiğiniz dış web sitesine yönlendirir."},{id:"ozel_uyg_ici",label:"Özel Uygulama İçi",desc:"Uygulama içindeki serbest bir ekrana gider."}];function Pe(){const[e,t]=b.useState(null),[s,c]=b.useState(!0),[u,d]=b.useState(!1),[r,m]=b.useState({companyName:"",logoUrl:"",backgroundImageUrl:"",backgroundColor:"#0f172a",logoAreaBackgroundColor:"transparent",buttonShape:"rounded"}),[p,f]=b.useState([{id:"btn1",type:"siparis_ver",label:"Sipariş Ver",icon:"fa-utensils",color:"#be185d",config:{paketServisUrl:""}},{id:"btn2",type:"kampanyalar",label:"Kampanyalar",icon:"fa-bullhorn",color:"#10b981",config:{}},{id:"btn3",type:"telefon_et",label:"Telefon Et",icon:"fa-phone",color:"#3b82f6",config:{phone:""}},{id:"btn4",type:"kurumsal",label:"Kurumsal",icon:"fa-building",color:"#f59e0b",config:{url:"",text:""}}]);b.useEffect(()=>{(async()=>{try{const{data:l,error:v}=await T.from("customer_app_config").select("*").eq("config_key","default").maybeSingle();l&&(t(l.id),l.branding&&m(l.branding),l.home_buttons&&l.home_buttons.length>0&&f(l.home_buttons))}catch(l){console.error("Config loading error",l)}finally{c(!1)}})()},[]);const y=async()=>{d(!0);try{const i={branding:r,home_buttons:p};let l;e?l=await T.from("customer_app_config").update(i).eq("id",e):l=await T.from("customer_app_config").insert({...i,config_key:"default"}),l&&l.error?w.error("Ayarlar kaydedilirken bir hata oluştu: "+l.error.message):w.success("Müşteri uygulaması ayarları başarıyla kaydedildi.")}catch{w.error("Ayarlar kaydedilirken bir hata oluştu.")}finally{d(!1)}},j=(i,l,v)=>{const x=[...p];x[i][l]=v,f(x)},g=(i,l,v)=>{const x=[...p];x[i].config||(x[i].config={}),x[i].config[l]=v,f(x)};return s?a.jsx("div",{className:"p-4",children:"Yükleniyor..."}):a.jsxs("div",{className:"p-6 max-w-7xl mx-auto space-y-6",children:[a.jsxs("div",{className:"flex justify-between items-center",children:[a.jsx("h1",{className:"text-2xl font-bold",children:"Müşteri Uygulaması Ayarları (Ana Ekran)"}),a.jsx("button",{onClick:y,disabled:u,className:"bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50",children:u?"Kaydediliyor...":"Değişiklikleri Kaydet"})]}),a.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-6",children:[a.jsxs("div",{className:"bg-white p-6 rounded shadow space-y-4",children:[a.jsx("h2",{className:"text-xl font-semibold mb-4 border-b pb-2",children:"Genel Tasarım (Branding)"}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Firma Adı"}),a.jsx("input",{type:"text",className:"w-full border rounded p-2",value:r.companyName||"",onChange:i=>m({...r,companyName:i.target.value})})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Logo Yükle"}),a.jsxs("div",{className:"flex items-center gap-4",children:[r.logoUrl&&a.jsx("img",{src:r.logoUrl,alt:"Logo",className:"h-12 w-12 object-contain border rounded bg-gray-50"}),a.jsx("input",{type:"file",accept:"image/*",className:"w-full border rounded p-2",onChange:async i=>{var x;const l=(x=i.target.files)==null?void 0:x[0];if(!l)return;const v=w.loading("Logo yükleniyor...");try{const k=new FormData;k.append("file",l);const{uploadApiFile:U}=await q(async()=>{const{uploadApiFile:N}=await import("./index-Fj3Oy67d.js").then(z=>z.az);return{uploadApiFile:N}},__vite__mapDeps([0,1])),o=await U(k),C=typeof o=="string"?o:(o==null?void 0:o.url)||(o==null?void 0:o.publicUrl)||(o==null?void 0:o.public_url)||(o==null?void 0:o.path)||(o==null?void 0:o.fileUrl)||(o==null?void 0:o.file_url)||"";if(C){const N=H(C);m({...r,logoUrl:N}),w.success("Logo yüklendi",{id:v})}else throw new Error("Geçersiz yanıt")}catch(k){w.error("Logo yüklenemedi: "+k.message,{id:v})}}})]}),a.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["Mevcut URL: ",r.logoUrl]})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Logo Alanı Zemin Rengi"}),a.jsxs("div",{className:"flex items-center gap-2",children:[a.jsx("input",{type:"color",className:"w-10 h-10 border rounded cursor-pointer",value:r.logoAreaBackgroundColor||"#ffffff",onChange:i=>m({...r,logoAreaBackgroundColor:i.target.value})}),a.jsx("input",{type:"text",className:"flex-1 border rounded p-2",value:r.logoAreaBackgroundColor||"",onChange:i=>m({...r,logoAreaBackgroundColor:i.target.value})})]}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Örn: #ffffff veya transparent"})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Buton Şekli"}),a.jsxs("select",{className:"w-full border rounded p-2 bg-white",value:r.buttonShape||"rounded",onChange:i=>m({...r,buttonShape:i.target.value}),children:[a.jsx("option",{value:"square",children:"Kare (Square)"}),a.jsx("option",{value:"rounded",children:"Yuvarlatılmış (Rounded)"}),a.jsx("option",{value:"pill",children:"Tam Oval (Pill)"})]})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Sayfa Zemin Resmi Yükle"}),a.jsxs("div",{className:"flex items-center gap-4",children:[r.backgroundImageUrl&&a.jsx("img",{src:r.backgroundImageUrl,alt:"Zemin",className:"h-12 w-12 object-cover border rounded bg-gray-50"}),a.jsx("input",{type:"file",accept:"image/*",className:"w-full border rounded p-2",onChange:async i=>{var x;const l=(x=i.target.files)==null?void 0:x[0];if(!l)return;const v=w.loading("Zemin resmi yükleniyor...");try{const k=new FormData;k.append("file",l);const{uploadApiFile:U}=await q(async()=>{const{uploadApiFile:N}=await import("./index-Fj3Oy67d.js").then(z=>z.az);return{uploadApiFile:N}},__vite__mapDeps([0,1])),o=await U(k),C=typeof o=="string"?o:(o==null?void 0:o.url)||(o==null?void 0:o.publicUrl)||(o==null?void 0:o.public_url)||(o==null?void 0:o.path)||(o==null?void 0:o.fileUrl)||(o==null?void 0:o.file_url)||"";if(C){const N=H(C);m({...r,backgroundImageUrl:N}),w.success("Zemin resmi yüklendi",{id:v})}else throw new Error("Geçersiz yanıt")}catch(k){w.error("Zemin resmi yüklenemedi: "+k.message,{id:v})}}})]}),a.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["Mevcut URL: ",r.backgroundImageUrl]})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Sayfa Zemin Rengi (Resim Yoksa)"}),a.jsxs("div",{className:"flex items-center gap-2",children:[a.jsx("input",{type:"color",className:"w-10 h-10 border rounded cursor-pointer",value:r.backgroundColor||"#0f172a",onChange:i=>m({...r,backgroundColor:i.target.value})}),a.jsx("input",{type:"text",className:"flex-1 border rounded p-2",value:r.backgroundColor||"",onChange:i=>m({...r,backgroundColor:i.target.value})})]})]})]}),a.jsxs("div",{className:"bg-white p-6 rounded shadow space-y-6 overflow-y-auto",style:{maxHeight:"calc(100vh - 120px)"},children:[a.jsx("h2",{className:"text-xl font-semibold mb-4 border-b pb-2",children:"Ana Ekran Butonları (4 Adet)"}),a.jsx("p",{className:"text-sm text-gray-600",children:"Mobil uygulamanın ana ekranında görünecek olan 4 butonu aşağıdan özelleştirebilirsiniz."}),p.map((i,l)=>{var v,x,k,U,o,C,N,z,O,K,M,Y,G,Z;return a.jsxs("div",{className:"border p-4 rounded bg-gray-50 space-y-3 relative",children:[a.jsxs("h3",{className:"font-bold text-lg absolute -top-3 left-4 bg-gray-50 px-2 text-blue-600",children:["Buton ",l+1]}),a.jsxs("div",{className:"grid grid-cols-2 gap-4 mt-2",children:[a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Buton Tipi"}),a.jsx("select",{className:"w-full border rounded p-2",value:i.type,onChange:n=>j(l,"type",n.target.value),children:De.map(n=>a.jsx("option",{value:n.id,children:n.label},n.id))})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Görünür İsim (Etiket)"}),a.jsx("input",{type:"text",className:"w-full border rounded p-2",value:i.label||"",onChange:n=>j(l,"label",n.target.value)})]})]}),a.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"İkon (örn: fa-phone)"}),a.jsx("input",{type:"text",className:"w-full border rounded p-2",value:i.icon||"",onChange:n=>j(l,"icon",n.target.value)})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Arka Plan Rengi"}),a.jsxs("div",{className:"flex items-center gap-2",children:[a.jsx("input",{type:"color",className:"w-10 h-10 border rounded cursor-pointer",value:i.color||"#3b82f6",onChange:n=>j(l,"color",n.target.value)}),a.jsx("input",{type:"text",className:"flex-1 border rounded p-2",value:i.color||"",onChange:n=>j(l,"color",n.target.value)})]})]})]}),a.jsxs("div",{className:"mt-4 border-t pt-3",children:[a.jsx("h4",{className:"text-sm font-semibold mb-2",children:"Seçilen Tipe Özel Ayarlar"}),i.type==="siparis_ver"&&a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Paket Servis Yönlendirme Linki (URL)"}),a.jsx("input",{type:"text",placeholder:"https://play.google.com/...",className:"w-full border rounded p-2",value:((v=i.config)==null?void 0:v.paketServisUrl)||"",onChange:n=>g(l,"paketServisUrl",n.target.value)}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Boş bırakılırsa varsayılan SuitableLive uygulamasına yönlendirilir."})]}),i.type==="telefon_et"&&a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Aranacak Telefon Numarası"}),a.jsx("input",{type:"text",placeholder:"+905551234567",className:"w-full border rounded p-2",value:((x=i.config)==null?void 0:x.phone)||"",onChange:n=>g(l,"phone",n.target.value)})]}),i.type==="kurumsal"&&a.jsxs("div",{className:"space-y-3",children:[a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Kurumsal Web Sitesi (Opsiyonel)"}),a.jsx("input",{type:"text",placeholder:"https://sirketiniz.com",className:"w-full border rounded p-2",value:((k=i.config)==null?void 0:k.url)||"",onChange:n=>g(l,"url",n.target.value)}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"URL girilirse direkt site açılır. Girilmezse alttaki yazı uygulama içinde gösterilir."})]}),a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Hakkımızda Yazısı"}),a.jsx("textarea",{className:"w-full border rounded p-2",rows:"3",value:((U=i.config)==null?void 0:U.text)||"",onChange:n=>g(l,"text",n.target.value)})]})]}),i.type==="sosyal_medya"&&a.jsxs("div",{className:"grid grid-cols-2 gap-2",children:[a.jsx("input",{type:"text",placeholder:"Instagram URL",className:"border rounded p-2 text-sm",value:((o=i.config)==null?void 0:o.instagram)||"",onChange:n=>g(l,"instagram",n.target.value)}),a.jsx("input",{type:"text",placeholder:"Facebook URL",className:"border rounded p-2 text-sm",value:((C=i.config)==null?void 0:C.facebook)||"",onChange:n=>g(l,"facebook",n.target.value)}),a.jsx("input",{type:"text",placeholder:"Twitter/X URL",className:"border rounded p-2 text-sm",value:((N=i.config)==null?void 0:N.twitter)||"",onChange:n=>g(l,"twitter",n.target.value)}),a.jsx("input",{type:"text",placeholder:"TikTok URL",className:"border rounded p-2 text-sm",value:((z=i.config)==null?void 0:z.tiktok)||"",onChange:n=>g(l,"tiktok",n.target.value)})]}),i.type==="bize_ulasin"&&a.jsxs("div",{className:"grid grid-cols-1 gap-2",children:[a.jsx("input",{type:"text",placeholder:"WhatsApp Numarası (Örn: +90555...)",className:"border rounded p-2 text-sm",value:((O=i.config)==null?void 0:O.whatsapp)||"",onChange:n=>g(l,"whatsapp",n.target.value)}),a.jsx("input",{type:"email",placeholder:"E-Posta Adresi",className:"border rounded p-2 text-sm",value:((K=i.config)==null?void 0:K.email)||"",onChange:n=>g(l,"email",n.target.value)}),a.jsx("input",{type:"text",placeholder:"Telefon Numarası",className:"border rounded p-2 text-sm",value:((M=i.config)==null?void 0:M.phone)||"",onChange:n=>g(l,"phone",n.target.value)})]}),i.type==="geri_bildirim"&&a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Form ID (Opsiyonel)"}),a.jsx("input",{type:"text",placeholder:"Müşteri anketi form ID'si",className:"w-full border rounded p-2",value:((Y=i.config)==null?void 0:Y.formTemplateId)||"",onChange:n=>g(l,"formTemplateId",n.target.value)})]}),i.type==="ozel_web"&&a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Yönlendirilecek Dış Bağlantı (URL)"}),a.jsx("input",{type:"text",placeholder:"https://...",className:"w-full border rounded p-2",value:((G=i.config)==null?void 0:G.url)||"",onChange:n=>g(l,"url",n.target.value)})]}),i.type==="ozel_uyg_ici"&&a.jsxs("div",{children:[a.jsx("label",{className:"block text-sm font-medium mb-1",children:"Uygulama İçi Sayfa Hedefi"}),a.jsx("input",{type:"text",placeholder:"Örn: profile, loyalty_cards",className:"w-full border rounded p-2",value:((Z=i.config)==null?void 0:Z.targetPage)||"",onChange:n=>g(l,"targetPage",n.target.value)})]}),i.type==="kampanyalar"&&a.jsx("p",{className:"text-sm text-gray-500 italic",children:"Bu buton tipi için ek bir ayar gerekmez. Direkt Kampanyalar sayfasına gider."})]})]},l)})]})]})]})}export{Pe as default};
