import{u as sa,g as na,r as p,m as P,j as e,e as _,d as re}from"./index-CKGjBpAG.js";import{S as oa}from"./SearchableSelect-Bd9RVSuI.js";const la="fa-book",ca="#64748b",A=x=>{const s=(x||"").toLowerCase();return s.includes("ürün")||s.includes("urun")?"fa-utensils":s.includes("hammad")?"fa-wheat-awn":s.includes("ekipman")?"fa-gears":s.includes("operasyon")?"fa-clipboard-check":s.includes("hizmet")?"fa-star":la},$=x=>{const s=(x||"").toLowerCase();return s.includes("ürün")||s.includes("urun")?"#f59e0b":s.includes("hammad")?"#10b981":s.includes("ekipman")?"#6366f1":s.includes("operasyon")?"#0ea5e9":s.includes("hizmet")?"#ec4899":ca};function q(x){if(!x)return null;const s=x.split(`
`);let f=null;const v=[];let h=[];const y=k=>{h.length>0&&(f==="ul"?v.push(e.jsx("ul",{style:{margin:"8px 0 8px 24px",paddingLeft:0,listStyleType:"disc",textAlign:"left"},children:h.map((u,g)=>e.jsx("li",{style:{marginBottom:"4px",lineHeight:"1.5",fontSize:"inherit"},children:u},g))},k)):f==="ol"&&v.push(e.jsx("ol",{style:{margin:"8px 0 8px 24px",paddingLeft:0,listStyleType:"decimal",textAlign:"left"},children:h.map((u,g)=>e.jsx("li",{style:{marginBottom:"4px",lineHeight:"1.5",fontSize:"inherit"},children:u},g))},k)),h=[],f=null)};return s.forEach((k,u)=>{const g=k.trim(),T=k.match(/^\s*([-\*•])\s+(.*)$/),a=k.match(/^\s*(\d+)[\.\)]\s+(.*)$/);T?(f!=="ul"&&(y(`list-before-${u}`),f="ul"),h.push(T[2])):a?(f!=="ol"&&(y(`list-before-${u}`),f="ol"),h.push(a[2])):(y(`list-before-${u}`),g===""?v.push(e.jsx("div",{style:{height:"8px"}},u)):v.push(e.jsx("p",{style:{margin:"6px 0",lineHeight:"1.6",fontSize:"inherit",textAlign:"inherit"},children:k},u)))}),y("list-final"),e.jsx("div",{className:"mr-formatted-desc",style:{display:"inline-block",width:"100%",textAlign:"inherit"},children:v})}function Er(x,s){if(!x)return{stepNumber:s+1,title:"",body:""};const f=x.match(/^(Adım\s+\d+[:.-]?\s*[^.\n]+)(.*)$/i)||x.match(/^([^.\n]+)(.*)$/);if(f){let v=f[1].trim(),h=f[2].trim();if(v=v.replace(/\s+/g," "),h.length<5){const u=x.match(/^Adım\s+\d+[:.-]?\s*(.*)$/i),g=u?u[1].trim():x;return{stepNumber:s+1,title:g||"",body:x}}const y=v.match(/^Adım\s+\d+[:.-]?\s*(.*)$/i),k=y?y[1].trim():v;return h=h.replace(/^[.:\-\s]+/,"").trim(),{stepNumber:s+1,title:k||v,body:h}}return{stepNumber:s+1,title:"",body:x}}function ue(x){const s=(x||"").toLowerCase();return s.includes("barcode")||s.includes("erp")||s.includes("kod")?{icon:"fa-barcode fa-pulse",iconStyle:{color:"#0f172a"},bgTop:"#f1f5f9",bgBottom:"#ffffff",border:"rgba(15, 23, 42, 0.12)",valColor:"#0f172a"}:s.includes("kategori")||s.includes("alt kategori")?{icon:"fa-folder-open fa-bounce",iconStyle:{color:"#8b5cf6"},bgTop:"#f5f3ff",bgBottom:"#ffffff",border:"rgba(139, 92, 246, 0.15)",valColor:"#7c3aed"}:s.includes("tedarik")||s.includes("onaylı")||s.includes("supplier")?{icon:"fa-truck-field fa-beat",iconStyle:{color:"#0284c7"},bgTop:"#f0f9ff",bgBottom:"#ffffff",border:"rgba(2, 132, 199, 0.15)",valColor:"#0369a1"}:s.includes("tat")||s.includes("koku")||s.includes("lezzet")||s.includes("kesim")||s.includes("slicing")?{icon:"fa-utensils fa-bounce",iconStyle:{color:"#10b981"},bgTop:"#f0fdf4",bgBottom:"#ffffff",border:"rgba(16, 185, 129, 0.15)",valColor:"#15803d"}:s.includes("doku")||s.includes("görünüm")||s.includes("spesifikasyon")||s.includes("texture")||s.includes("spes")?{icon:"fa-certificate fa-spin",iconStyle:{color:"#a855f7",animationDuration:"6s"},bgTop:"#faf5ff",bgBottom:"#ffffff",border:"rgba(168, 85, 247, 0.15)",valColor:"#9333ea"}:s.includes("ambalaj")||s.includes("paket")||s.includes("kutu")||s.includes("packaging")?{icon:"fa-box-open fa-bounce",iconStyle:{color:"#f59e0b"},bgTop:"#fffbeb",bgBottom:"#ffffff",border:"rgba(245, 158, 11, 0.15)",valColor:"#d97706"}:s.includes("sıcaklık")||s.includes("temp")||s.includes("derece")?{icon:"fa-temperature-half fa-fade",iconStyle:{color:"#ef4444"},bgTop:"#fef2f2",bgBottom:"#ffffff",border:"rgba(239, 68, 68, 0.15)",valColor:"#b91c1c"}:s.includes("hazır")||s.includes("prep")||s.includes("süre")?{icon:"fa-clock fa-spin",iconStyle:{color:"#f97316",animationDuration:"8s"},bgTop:"#fff7ed",bgBottom:"#ffffff",border:"rgba(249, 115, 22, 0.15)",valColor:"#ea580c"}:s.includes("çöz")||s.includes("thaw")?{icon:"fa-snowflake fa-spin",iconStyle:{color:"#38bdf8",animationDuration:"10s"},bgTop:"#f0f9ff",bgBottom:"#ffffff",border:"rgba(56, 189, 248, 0.15)",valColor:"#0284c7"}:s.includes("ılık")||s.includes("ılın")||s.includes("soğu")||s.includes("cool")?{icon:"fa-temperature-arrow-down fa-bounce",iconStyle:{color:"#10b981"},bgTop:"#f0fdf4",bgBottom:"#ffffff",border:"rgba(16, 185, 129, 0.15)",valColor:"#16a34a"}:s.includes("ağırlık")||s.includes("porsiyon")||s.includes("gram")||s.includes("gr")||s.includes("weight")||s.includes("boyut")||s.includes("çap")||s.includes("ebat")||s.includes("dimen")?{icon:"fa-scale-balanced fa-beat",iconStyle:{color:"#eab308"},bgTop:"#fefce8",bgBottom:"#ffffff",border:"rgba(234, 179, 8, 0.15)",valColor:"#ca8a04"}:s.includes("raf")||s.includes("ömür")||s.includes("shelf")?{icon:"fa-hourglass-half fa-flip",iconStyle:{color:"#ec4899",animationDuration:"3s"},bgTop:"#fdf2f8",bgBottom:"#ffffff",border:"rgba(236, 72, 153, 0.15)",valColor:"#db2777"}:s.includes("piş")||s.includes("fırın")||s.includes("ızgara")||s.includes("cook")?{icon:"fa-fire-burner fa-fade",iconStyle:{color:"#ef4444"},bgTop:"#fef2f2",bgBottom:"#ffffff",border:"rgba(239, 68, 68, 0.15)",valColor:"#dc2626"}:{icon:"fa-circle-info fa-beat",iconStyle:{color:"#6366f1"},bgTop:"#f5f3ff",bgBottom:"#ffffff",border:"rgba(99, 102, 241, 0.15)",valColor:"#4f46e5"}}function da(x){var f;let s=0;return x.content&&(s+=x.content.split(/\s+/).length),(f=x.metadata)!=null&&f.steps&&(s+=x.metadata.steps.reduce((v,h)=>{var y;return v+(((y=h.description)==null?void 0:y.split(/\s+/).length)||0)},0)),Math.max(1,Math.ceil(s/180))}function ma(x,s){const f=x.channels||[],v=s||[],h=`${parseFloat(x.qty||0)} ${x.unit}`;if(v.length===0)return e.jsx("span",{children:h});const y=f.length===0||f.length===v.length,k=u=>{if(u.icon)return u.icon;const g=(u.name||"").toLowerCase();return g.includes("hızlı")||g.includes("pos")?"fa-solid fa-bolt":g.includes("gel al")||g.includes("paket")?"fa-solid fa-bag-shopping":g.includes("masa")?"fa-solid fa-chair":g.includes("qr")?"fa-solid fa-qrcode":g.includes("kiosk")?"fa-solid fa-desktop":g.includes("yemeksepeti")||g.includes("yemek sepeti")?"fa-solid fa-basket-shopping":g.includes("getir")?"fa-solid fa-motorcycle":g.includes("trendyol")?"fa-solid fa-shop":g.includes("çağrı")||g.includes("call")?"fa-solid fa-phone":"fa-solid fa-circle-nodes"};return e.jsxs("div",{className:"mr-channel-tooltip-container",style:{display:"inline-flex",alignItems:"center",cursor:"pointer"},children:[e.jsx("span",{children:h}),e.jsxs("div",{className:"mr-channel-tooltip-content",style:{textAlign:"left",fontWeight:"normal"},children:[e.jsx("div",{className:"mr-channel-tooltip-arrow-border"}),e.jsx("div",{className:"mr-channel-tooltip-arrow"}),e.jsx("div",{className:"mr-channel-tooltip-title",children:y?"Tüm Kanallar":"Geçerli Kanallar"}),e.jsx("ul",{className:"mr-channel-list",children:v.map(u=>y||f.includes(u.id)?e.jsxs("li",{className:`mr-channel-item active ${y?"all":""}`,children:[e.jsx("i",{className:k(u),style:{color:y?"#10b981":"#6366f1",width:"14px",textAlign:"center"}}),e.jsx("span",{children:u.name})]},u.id):null)})]})]})}function fa(){var Ae,Te,De,Le,Ie,Be,Pe,qe;const x=sa(),{branchId:s}=na(),[f,v]=p.useState([]),[h,y]=p.useState([]),[k,u]=p.useState({}),[g,T]=p.useState(null),[a,H]=p.useState(null),[ve,Ar]=p.useState([]),[Tr,Dr]=p.useState({portionNames:{__standart__:"Standart"},allChannels:[]}),[Lr,Ir]=p.useState([]),[Br,Pr]=p.useState({__standart__:"Standart"}),[qr,ye]=p.useState(!1),[Or,je]=p.useState(!1),[R,O]=p.useState(""),[we,E]=p.useState(!1),Mr=p.useRef(null),U=p.useRef(null),[ae,te]=p.useState(!1),[Kr,ie]=p.useState(0),[Wr,Fr]=p.useState(!1),[ke,Yr]=p.useState(null),[se,Hr]=p.useState([]),[ne,Ne]=p.useState(""),[G,_e]=p.useState(""),[ze,Se]=p.useState(!1),[V,oe]=p.useState(null),[N,X]=p.useState(null),[Ce,le]=p.useState([]),[Ur,Re]=p.useState(!1),Gr=async()=>{ye(!0);try{const[r,t,c,m,i]=await Promise.all([fetch(P("/api/manual/categories")).then(d=>d.json()),fetch(P("/api/manual/pages")).then(d=>d.json()),re.from("sales_channels").select("id, name, icon").is("deleted_at",null).order("sort_order"),re.from("sale_items").select("portions"),re.from("semi_items").select("portions")]);if(r.error)throw new Error(r.error.message);if(t.error)throw new Error(t.error.message);v(r.data||[]),y(t.data||[]);const n={};(r.data||[]).forEach(d=>{n[d.id]=!0}),u(n),Ir(c.data||[]);const l={__standart__:"Standart"};m.data&&m.data.forEach(d=>{let o=d.portions;if(typeof o=="string")try{o=JSON.parse(o)}catch{o=[]}Array.isArray(o)&&o.forEach(b=>{b&&b.id&&b.name&&(l[b.id]=b.name)})}),i.data&&i.data.forEach(d=>{let o=d.portions;if(typeof o=="string")try{o=JSON.parse(o)}catch{o=[]}Array.isArray(o)&&o.forEach(b=>{b&&b.id&&b.name&&(l[b.id]=b.name)})}),Pr(l)}catch(r){x("Menü yüklenirken hata: "+r.message,"error")}finally{ye(!1)}},$e=p.useCallback(async r=>{var t,c,m;je(!0);try{const[i,n]=await Promise.all([fetch(P(`/api/manual/pages/${r}`)).then(l=>l.json()),fetch(P(`/api/manual/pages/${r}/context`)).then(l=>l.json())]);if(i.error)throw new Error(i.error.message);H(i.data),Ar(((t=n.data)==null?void 0:t.recipe)||[]),Dr({portionNames:((c=n.data)==null?void 0:c.portionNames)||{__standart__:"Standart"},allChannels:((m=n.data)==null?void 0:m.allChannels)||[]})}catch(i){x("Sayfa yüklenemedi: "+i.message,"error")}finally{je(!1)}},[x]);p.useEffect(()=>{Gr()},[]),p.useEffect(()=>{g?$e(g):H(null)},[g,$e]),p.useEffect(()=>{const r=t=>{var c,m;if((t.ctrlKey||t.metaKey)&&t.key==="k"&&(t.preventDefault(),(c=U.current)==null||c.focus()),t.key==="Escape"){if(V){oe(null),X(null),le([]);return}O(""),E(!1),(m=U.current)==null||m.blur()}};return window.addEventListener("keydown",r),()=>window.removeEventListener("keydown",r)},[V]);const Q=p.useMemo(()=>{if(!R.trim())return[];const r=R.toLowerCase();return h.filter(t=>{var c;return(c=t.title)==null?void 0:c.toLowerCase().includes(r)}).map(t=>{var c;return{...t,categoryName:((c=f.find(m=>m.id===t.category_id))==null?void 0:c.name)||""}}).slice(0,12)},[R,h,f]),M=p.useMemo(()=>{const r=[];return f.forEach(t=>{h.filter(c=>c.category_id===t.id).forEach(c=>r.push(c))}),r},[f,h]),J=p.useMemo(()=>M.findIndex(r=>r.id===g),[M,g]),ce=J>0?M[J-1]:null,de=J<M.length-1?M[J+1]:null,S=r=>{T(r),ie(t=>t+1),O(""),E(!1),te(!1),window.scrollTo({top:0,behavior:"smooth"})},Vr=r=>u(t=>({...t,[r]:!t[r]})),D=p.useCallback(()=>{oe(null),X(null),le([])},[]),Xr=p.useCallback(async r=>{var t;if(r){oe(r),X(null),Re(!0);try{const[c,m]=await Promise.all([fetch(P(`/api/manual/pages/${r}`)).then(i=>i.json()),fetch(P(`/api/manual/pages/${r}/context`)).then(i=>i.json())]);X(c.data||null),le(((t=m.data)==null?void 0:t.recipe)||[])}catch(c){x("Hammadde sayfası yüklenemedi: "+c.message,"error"),D()}finally{Re(!1)}}},[x,D]),L=a&&((Ae=f.find(r=>r.id===a.category_id))==null?void 0:Ae.name)||"",Qr=A(L),z=$(L),Ee=p.useMemo(()=>[...h].sort((r,t)=>new Date(t.updated_at||t.created_at)-new Date(r.updated_at||r.created_at)).slice(0,6),[h]),me=()=>{Fr(!1),Yr(null),Hr([]),Ne(""),_e("")},Jr=async r=>{if(r.preventDefault(),!ne)return x("Lütfen cihazı seçin.","warning");if(!G.trim())return x("Arıza açıklaması zorunludur.","warning");Se(!0);try{const t=await re.from("maintenance_tickets").insert({branch_id:s,equipment_instance_id:ne,description:G,issue_description:G,status:"open"});if(t.error)throw new Error(t.error.message);x("Arıza kaydı oluşturuldu.","success"),me()}catch(t){x("Arıza kaydı oluşturulamadı: "+t.message,"error")}finally{Se(!1)}};return e.jsxs("div",{className:`page-enter mr-root mr-academy-active${a?" has-page":""}`,children:[e.jsx("style",{children:`
        /* ─── LAYOUT ─── */
        .mr-root {
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 60px);
        }

        /* ─── HEADER (TOP NAV) ─── */
        .mr-header {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          z-index: 100;
          backdrop-filter: blur(8px);
        }
        .mr-header-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 100%;
          margin: 0 auto;
          padding: 0 40px;
          height: 64px;
          gap: 20px;
        }
        .mr-header-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .mr-header-brand-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: .8rem;
        }
        .mr-header-brand-text h2 {
          margin: 0;
          font-size: .84rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1.2;
        }
        .mr-header-brand-text span {
          font-size: .6rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        
        .mr-header-nav {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 100%;
        }
        .mr-nav-item {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
        }
        .mr-nav-btn {
          background: none;
          border: none;
          font-family: inherit;
          font-size: .82rem;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 14px;
          transition: all .15s;
          border-bottom: 2px solid transparent;
        }
        .mr-nav-btn:hover {
          color: var(--text-strong);
        }
        .mr-nav-btn.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
        .mr-nav-item:hover .mr-nav-btn {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
        .mr-nav-chevron {
          font-size: .55rem;
          margin-left: 6px;
          opacity: .5;
          transition: transform .15s;
        }
        .mr-nav-item:hover .mr-nav-chevron {
          transform: rotate(180deg);
        }
        
        .mr-nav-dropdown {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(10px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,.15);
          padding: 16px;
          z-index: 110;
          visibility: hidden;
          opacity: 0;
          transition: opacity .15s, transform .15s, visibility .15s;
        }
        .mr-nav-item:hover .mr-nav-dropdown {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        
        .mr-dropdown-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 8px;
          width: 460px;
          max-height: 400px;
          overflow-y: auto;
        }
        .mr-dropdown-empty {
          grid-column: 1 / -1;
          padding: 16px;
          text-align: center;
          color: var(--text-muted);
          font-size: .78rem;
        }
        .mr-dropdown-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1.5px solid transparent;
          background: var(--surface-2);
          cursor: pointer;
          transition: all .15s;
          text-align: left;
          width: 100%;
          font-family: inherit;
        }
        .mr-dropdown-card:hover {
          border-color: var(--accent-primary);
          background: rgba(245, 166, 35, 0.04);
        }
        .mr-dropdown-card.active {
          border-color: var(--accent-primary);
          background: rgba(245, 166, 35, 0.08);
        }
        .mr-dropdown-card-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .7rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .mr-dropdown-card.active .mr-dropdown-card-icon {
          color: var(--accent-primary);
        }
        .mr-dropdown-card-content {
          min-width: 0;
          flex: 1;
        }
        .mr-dropdown-card-title {
          display: block;
          font-size: .76rem;
          font-weight: 700;
          color: var(--text-strong);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mr-dropdown-card-desc {
          display: block;
          font-size: .6rem;
          color: var(--text-muted);
          margin-top: 1px;
        }
        
        .mr-header-search-wrap {
          position: relative;
          width: 220px;
        }
        .mr-header-search-wrap .mr-search-dropdown {
          left: auto;
          right: 0;
          width: 320px;
        }
        
        .mr-header-hamburger {
          display: none;
          background: none;
          border: none;
          font-size: 1.2rem;
          color: var(--text-strong);
          cursor: pointer;
          padding: 8px;
        }

        /* ─── SIDEBAR (MOBILE ONLY) ─── */
        .mr-sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 300px;
          z-index: 295;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        @media (min-width: 769px) {
          .mr-sidebar {
            display: none !important;
          }
        }
        .mr-sidebar::-webkit-scrollbar { width: 4px; }
        .mr-sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        .mr-sidebar-header {
          padding: 20px 18px 12px;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--surface);
          z-index: 10;
        }

        .mr-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .mr-sidebar-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: .9rem;
          flex-shrink: 0;
        }
        .mr-sidebar-brand h2 {
          margin: 0;
          font-size: .88rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1.2;
        }
        .mr-sidebar-brand span {
          font-size: .62rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* ─── SEARCH ─── */
        .mr-search-wrap {
          position: relative;
        }
        .mr-search-input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 8px 12px 8px 34px;
          font-size: .78rem;
          color: var(--text-strong);
          background: var(--surface-2);
          outline: none;
          transition: all .2s;
          font-family: inherit;
        }
        .mr-search-input::placeholder { color: var(--text-muted); }
        .mr-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--surface);
          box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.12);
        }
        .mr-search-icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .7rem;
          color: var(--text-muted);
          pointer-events: none;
        }
        .mr-search-kbd {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .55rem;
          color: var(--text-muted);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 5px;
          font-weight: 600;
          font-family: monospace;
          pointer-events: none;
        }

        /* ─── SEARCH DROPDOWN ─── */
        .mr-search-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,.15);
          z-index: 100;
          max-height: 320px;
          overflow-y: auto;
          padding: 6px;
        }
        .mr-search-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background .12s;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .mr-search-item:hover { background: var(--surface-2); }
        .mr-search-item-title {
          font-size: .78rem;
          font-weight: 600;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .mr-search-item-cat {
          font-size: .6rem;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 2px 7px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .mr-search-empty {
          padding: 18px;
          text-align: center;
          color: var(--text-muted);
          font-size: .78rem;
        }

        /* ─── SIDEBAR NAV ─── */
        .mr-nav { padding: 10px 10px 24px; flex: 1; }
        .mr-cat-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: .78rem;
          font-weight: 700;
          color: var(--text-strong);
          transition: all .15s;
          font-family: inherit;
          margin-bottom: 2px;
        }
        .mr-cat-btn:hover { background: var(--surface-2); }
        .mr-cat-btn.active { color: var(--accent-primary); }
        .mr-cat-icon {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .65rem;
          flex-shrink: 0;
        }
        .mr-cat-chevron {
          font-size: .5rem;
          opacity: .4;
          transition: transform .2s;
          margin-left: auto;
        }
        .mr-cat-chevron.open { transform: rotate(90deg); }
        .mr-cat-count {
          font-size: .55rem;
          font-weight: 700;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 1px 6px;
          border-radius: 20px;
          min-width: 18px;
          text-align: center;
        }

        .mr-page-list {
          display: flex;
          flex-direction: column;
          padding: 2px 0 6px 18px;
          border-left: 1.5px solid var(--border);
          margin-left: 22px;
          margin-bottom: 4px;
          gap: 1px;
        }
        .mr-page-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border-radius: 7px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: .74rem;
          font-weight: 500;
          color: var(--text-muted);
          transition: all .15s;
          font-family: inherit;
          position: relative;
          width: 100%;
        }
        .mr-page-btn:hover {
          background: var(--surface-2);
          color: var(--text-strong);
        }
        .mr-page-btn.active {
          background: rgba(245, 166, 35, 0.08);
          color: var(--accent-primary);
          font-weight: 700;
        }
        .mr-page-btn.active::before {
          content: '';
          position: absolute;
          left: -19px;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 18px;
          background: var(--accent-primary);
          border-radius: 0 3px 3px 0;
        }
        .mr-page-icon {
          font-size: .6rem;
          opacity: .5;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
        }
        .mr-page-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        /* ─── MAIN CONTENT ─── */
        .mr-main {
          padding: 40px 40px;
          max-width: 100%;
          width: 100%;
          margin: 0 auto;
          min-height: calc(100vh - 124px);
        }

        /* ─── PAGE ANIMATION ─── */
        @keyframes mrPageEnter {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mr-page-animate {
          animation: mrPageEnter .35s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .mr-page-animate { animation: none; }
        }

        /* ─── WELCOME ─── */
        .mr-welcome { max-width: 720px; margin: 0 auto; padding-top: 40px; }
        .mr-welcome-hero {
          text-align: center;
          margin-bottom: 32px;
        }
        .mr-welcome-icon-wrap {
          width: 72px;
          height: 72px;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(245,166,35,.12), rgba(249,115,22,.12));
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 18px;
        }
        .mr-welcome-icon-wrap i {
          font-size: 1.8rem;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .mr-welcome h1 {
          margin: 0 0 8px;
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text-strong);
        }
        .mr-welcome-sub {
          font-size: .88rem;
          color: var(--text-muted);
          margin: 0 0 24px;
        }

        /* Global search in welcome */
        .mr-global-search {
          position: relative;
          max-width: 480px;
          margin: 0 auto 36px;
        }
        .mr-global-search input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 13px 18px 13px 44px;
          font-size: .88rem;
          color: var(--text-strong);
          background: var(--surface);
          outline: none;
          transition: all .2s;
          font-family: inherit;
          box-shadow: 0 2px 12px rgba(0,0,0,.04);
        }
        .mr-global-search input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.1), 0 2px 12px rgba(0,0,0,.04);
        }
        .mr-global-search input::placeholder { color: var(--text-muted); }
        .mr-global-search .mr-gs-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .85rem;
          color: var(--text-muted);
          pointer-events: none;
        }
        .mr-global-search .mr-gs-kbd {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .62rem;
          color: var(--text-muted);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 2px 7px;
          font-weight: 600;
          font-family: monospace;
          pointer-events: none;
        }

        /* Stats cards */
        .mr-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin-bottom: 32px;
        }
        .mr-stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: transform .15s, box-shadow .15s;
        }
        .mr-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,.06);
        }
        .mr-stat-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .9rem;
          flex-shrink: 0;
        }
        .mr-stat-num {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1;
        }
        .mr-stat-label {
          font-size: .68rem;
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 2px;
        }

        /* Recent pages */
        .mr-recent-title {
          font-size: .72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: var(--text-muted);
          margin: 0 0 12px 2px;
        }
        .mr-recent-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .mr-recent-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          cursor: pointer;
          transition: all .15s;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .mr-recent-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 16px rgba(245,166,35,.08);
          transform: translateY(-1px);
        }
        .mr-recent-card-title {
          font-size: .8rem;
          font-weight: 700;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mr-recent-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: .62rem;
          color: var(--text-muted);
        }
        .mr-recent-card-cat {
          font-size: .58rem;
          font-weight: 600;
          padding: 1px 7px;
          border-radius: 20px;
          white-space: nowrap;
        }

        /* ─── PAGE DETAIL ─── */
        .mr-detail {
          max-width: 100%;
          margin: 0 auto;
        }

        /* Breadcrumb */
        .mr-breadcrumb {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 16px;
          font-size: .72rem;
          flex-wrap: wrap;
        }
        .mr-breadcrumb-item {
          color: var(--text-muted);
          font-weight: 500;
          cursor: pointer;
          transition: color .12s;
          background: none;
          border: none;
          font-family: inherit;
          padding: 0;
        }
        .mr-breadcrumb-item:hover { color: var(--accent-primary); }
        .mr-breadcrumb-sep { color: var(--border); font-size: .6rem; }
        .mr-breadcrumb-current { color: var(--text-strong); font-weight: 700; }

        /* Top toolbar */
        .mr-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }
        .mr-toolbar-btn {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .75rem;
          transition: all .12s;
        }
        .mr-toolbar-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: rgba(245,166,35,.06);
        }

        /* Title area */
        .mr-title-area {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }
        .mr-title-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }
        .mr-title-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .9rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .mr-title h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1.3;
        }
        .mr-meta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .mr-meta-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: .68rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .mr-meta-item i { font-size: .6rem; opacity: .7; }
        .mr-cat-badge {
          font-size: .62rem;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 20px;
        }

        /* ─── HERO IMAGE ─── */
        /* ─── HERO ROW (Side-by-Side) ─── */
        .mr-hero-row {
          display: flex;
          align-items: stretch;
          justify-content: center;
          gap: 32px;
          margin: 0 auto 32px;
          max-width: 1000px;
          width: 100%;
        }
        .mr-hero-img {
          flex: 1;
          max-width: 440px;
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          aspect-ratio: 4/3;
          background: var(--surface-2);
          border: 1px solid var(--border);
          box-shadow: 0 8px 30px rgba(0,0,0,.08);
        }
        .mr-hero-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* ─── PRODUCT STORY ─── */
        .mr-product-story {
          flex: 1.2;
          max-width: 520px;
          background: linear-gradient(135deg, rgba(45, 106, 79, 0.04), rgba(82, 183, 136, 0.04));
          border-left: 4px solid #2d6a4f;
          border-right: 4px solid #2d6a4f;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        [data-theme="dark"] .mr-product-story {
          background: linear-gradient(135deg, rgba(82, 183, 136, 0.06), rgba(45, 106, 79, 0.06));
          border-color: #52b788;
        }
        .mr-story-quote-icon {
          color: rgba(45, 106, 79, 0.15);
          font-size: 1.6rem;
          line-height: 1;
        }
        [data-theme="dark"] .mr-story-quote-icon {
          color: rgba(82, 183, 136, 0.2);
        }
        .mr-story-text {
          font-style: italic;
          font-size: 1.05rem; /* ~1pt larger than standard 0.88rem/14px */
          line-height: 1.7;
          color: var(--text-strong);
          font-weight: 500;
          text-align: center;
          padding: 0 10px;
        }

        /* ─── PRODUCT SPECS ─── */
        .mr-specs {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px 20px;
          margin-bottom: 24px;
        }
        .mr-specs-title {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 14px;
          font-size: .72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-strong);
        }
        .mr-specs-title i {
          font-size: .7rem;
          color: var(--accent-primary);
        }
        .mr-specs-banner {
          position: relative;
          width: 100%;
          height: 180px;
          margin: 40px 0;
        }
        .mr-specs-banner-strip {
          position: absolute;
          left: 0;
          right: 0;
          top: 80px;
          height: 100px;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          background: #ffffff;
          overflow: hidden;
          z-index: 1;
        }
        [data-theme="dark"] .mr-specs-banner-strip {
          background: #111827;
          border-top-color: #374151;
          border-bottom-color: #374151;
        }
        .mr-specs-banner-bg {
          position: absolute;
          top: -10px; left: -10px; right: -10px; bottom: -10px;
          background-size: cover;
          background-position: center;
          filter: blur(4px) brightness(1.05) contrast(1.05) saturate(1.1);
          opacity: 0.9;
        }
        [data-theme="dark"] .mr-specs-banner-bg {
          opacity: 0.45;
          filter: blur(6px) brightness(0.7) contrast(1.1);
        }
        .mr-specs-banner-grid {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2;
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
          padding: 0 24px;
        }
        .mr-spec-art-card {
          width: 220px;
          background: var(--card-bg-bottom, #ffffff);
          border: 1px solid var(--card-border, rgba(0,0,0,0.08));
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .mr-spec-art-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.08);
        }
        .mr-spec-art-top {
          background: var(--card-bg-top, #f8fafc);
          border-bottom: 1px solid var(--card-border, rgba(0,0,0,0.08));
          padding: 10px 12px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: center;
          justify-content: center;
          height: 80px;
          box-sizing: border-box;
        }
        .mr-spec-art-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .mr-spec-art-val {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--card-val-color, #1e293b);
        }
        .mr-spec-art-bottom {
          background: var(--card-bg-bottom, #ffffff);
          padding: 10px 12px;
          font-size: 0.7rem;
          color: #334155;
          line-height: 1.4;
          text-align: center;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 80px;
          box-sizing: border-box;
        }
        [data-theme="dark"] .mr-spec-art-card {
          --card-bg-top: rgba(30, 41, 59, 0.8) !important;
          --card-bg-bottom: rgba(15, 23, 42, 0.8) !important;
          --card-border: rgba(255, 255, 255, 0.1) !important;
          --card-val-color: var(--accent-primary) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        }
        [data-theme="dark"] .mr-spec-art-label {
          color: #94a3b8 !important;
        }
        [data-theme="dark"] .mr-spec-art-bottom {
          color: #cbd5e1 !important;
        }
        @media (max-width: 768px) {
          .mr-specs-banner {
            height: auto !important;
            margin: 20px 0 !important;
          }
          .mr-specs-banner-strip {
            display: none !important;
          }
          .mr-specs-banner-grid {
            position: relative !important;
            padding: 0 !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
          }
          .mr-spec-art-card {
            width: 100% !important;
            max-width: 340px !important;
          }
        }

        /* ─── SHELF LIFE ─── */
        .mr-shelf {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px dashed var(--border);
        }
        .mr-shelf-title {
          font-size: .65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--text-strong);
          margin-bottom: 10px;
        }
        .mr-shelf-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface-2);
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 6px;
          font-size: .74rem;
        }
        .mr-shelf-row-label { color: var(--text-muted); font-weight: 500; }
        .mr-shelf-row-value { font-weight: 700; color: var(--text-strong); }
        .mr-shelf-warning {
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 12px 14px;
        }
        [data-theme="dark"] .mr-shelf-warning {
          background: rgba(245,158,11,.1);
          border-color: rgba(245,158,11,.2);
        }
        .mr-shelf-warning-title {
          font-size: .65rem;
          font-weight: 700;
          color: #92400e;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        [data-theme="dark"] .mr-shelf-warning-title { color: #fbbf24; }
        .mr-shelf-warning-row {
          display: flex;
          justify-content: space-between;
          font-size: .72rem;
          padding: 3px 0;
        }
        .mr-shelf-warning-row span:first-child { color: #78350f; }
        .mr-shelf-warning-row span:last-child { font-weight: 800; color: #78350f; }
        [data-theme="dark"] .mr-shelf-warning-row span { color: #fde68a !important; }

        /* ─── RECIPE TABLE ─── */
        .mr-section-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .mr-section-bar {
          width: 4px;
          height: 18px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .mr-section-label {
          font-size: .74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-strong);
        }

        .mr-recipe-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        @media (max-width: 992px) {
          .mr-recipe-grid {
            grid-template-columns: 1fr;
          }
        }
        .mr-recipe-common {
          font-weight: 600 !important;
          color: var(--text-strong) !important;
        }
        .mr-recipe-specific {
          font-weight: 450 !important;
          color: var(--text-strong) !important;
          opacity: 0.85;
        }
        .mr-recipe-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: .8rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: visible;
          margin-bottom: 0px;
        }
        .mr-recipe-table thead tr:first-child th:first-child {
          border-top-left-radius: 11px;
        }
        .mr-recipe-table thead tr:first-child th:last-child {
          border-top-right-radius: 11px;
        }
        .mr-recipe-table tbody tr:last-child td:first-child {
          border-bottom-left-radius: 11px;
        }
        .mr-recipe-table tbody tr:last-child td:last-child {
          border-bottom-right-radius: 11px;
        }
        .mr-recipe-table thead th {
          background: var(--surface-2);
          padding: 10px 14px;
          text-align: left;
          font-size: .65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .mr-recipe-table thead th:last-child { text-align: center; }
        .mr-recipe-table thead th:nth-child(2) { text-align: right; }
        .mr-recipe-table tbody tr { transition: background .12s; }
        .mr-recipe-table tbody tr:hover { background: rgba(245,166,35,.04); }
        .mr-recipe-table tbody td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          color: var(--text-strong);
        }
        .mr-recipe-table tbody tr:last-child td { border-bottom: none; }
        .mr-recipe-table tbody td:nth-child(2) { text-align: right; color: var(--text-muted); font-weight: 600; }
        .mr-recipe-table tbody td:last-child { text-align: center; }
        .mr-recipe-link {
          color: var(--accent-primary);
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          border: none;
          background: none;
          font-family: inherit;
          font-size: inherit;
          padding: 0;
        }
        .mr-recipe-link:hover { text-decoration: underline; }
        .mr-recipe-go-btn {
          font-size: .62rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--accent-primary);
          cursor: pointer;
          transition: all .12s;
          white-space: nowrap;
          font-family: inherit;
        }
        .mr-recipe-go-btn:hover {
          background: rgba(245,166,35,.08);
          border-color: var(--accent-primary);
        }

        /* ─── EQUIPMENT PILLS ─── */
        .mr-equip-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
        }
        .mr-equip-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 24px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          font-size: .72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all .12s;
          font-family: inherit;
        }
        .mr-equip-pill:hover {
          background: #fee2e2;
          border-color: #f87171;
          transform: translateY(-1px);
        }
        .mr-equip-pill i { font-size: .6rem; }
        [data-theme="dark"] .mr-equip-pill {
          background: rgba(239,68,68,.1);
          border-color: rgba(239,68,68,.25);
          color: #f87171;
        }

        /* ─── STEPS TIMELINE ─── */
        .mr-steps { margin-bottom: 28px; }
        
        .mr-steps-premium-container {
          display: flex;
          flex-direction: column;
          gap: 48px;
          margin-top: 24px;
          margin-bottom: 40px;
        }
        
        .mr-step-badge {
          position: absolute;
          top: -14px;
          left: 16px;
          background: linear-gradient(135deg, #2d6a4f, #1b4332);
          color: #ffffff;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 30px;
          box-shadow: 0 4px 10px rgba(45, 106, 79, 0.25);
          z-index: 10;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: mr-badge-glowing 3s infinite ease-in-out;
        }
        @keyframes mr-badge-glowing {
          0% {
            box-shadow: 0 4px 10px rgba(45, 106, 79, 0.25);
            transform: translateY(0);
          }
          50% {
            box-shadow: 0 6px 15px rgba(82, 183, 136, 0.5), 0 0 0 4px rgba(82, 183, 136, 0.15);
            transform: translateY(-2px);
          }
          100% {
            box-shadow: 0 4px 10px rgba(45, 106, 79, 0.25);
            transform: translateY(0);
          }
        }
        [data-theme="dark"] .mr-step-badge {
          background: linear-gradient(135deg, #52b788, #2d6a4f);
          box-shadow: 0 4px 10px rgba(82, 183, 136, 0.25);
        }
        .mr-step-premium-card {
          position: relative;
          background: var(--surface);
          margin: 20px 24px;
          padding: 0;
        }

        /* The sketch lines */
        .mr-sketch-line {
          position: absolute;
          background: #2d6a4f; /* Forest green sketch line color */
          opacity: 0.85;
          z-index: 2;
          pointer-events: none;
          filter: url(#hand-drawn-filter);
        }
        
        [data-theme="dark"] .mr-sketch-line {
          background: #52b788; /* Dark theme bright/mint green */
        }
        
        .mr-sketch-line-top {
          top: 0;
          left: -24px;
          right: -24px;
          height: 3px;
          border-radius: 1px;
        }
        .mr-sketch-line-bottom {
          bottom: 0;
          left: -24px;
          right: -24px;
          height: 3px;
          border-radius: 1px;
        }
        .mr-sketch-line-left {
          left: 0;
          top: -24px;
          bottom: -24px;
          width: 3px;
          border-radius: 1px;
        }
        .mr-sketch-line-right {
          right: 0;
          top: -24px;
          bottom: -24px;
          width: 3px;
          border-radius: 1px;
        }
        .mr-sketch-line-middle {
          position: absolute;
          top: -24px;
          bottom: -24px;
          left: calc(5cm * 4 / 3);
          width: 3px;
          border-radius: 1px;
          z-index: 2;
        }
        .mr-step-premium-card.alternate .mr-sketch-line-middle {
          left: auto;
          right: calc(5cm * 4 / 3);
        }

        .mr-step-premium-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0;
          min-height: 150px;
        }

        .mr-step-premium-card.no-image .mr-step-premium-grid {
          grid-template-columns: 1fr;
        }

        .mr-step-premium-img-box {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: var(--surface-2);
          border-radius: 6px 0 0 6px;
          aspect-ratio: 4 / 3;
          height: 5cm;
          align-self: center;
          flex-shrink: 0;
        }
        
        .mr-step-premium-img-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 6px 0 0 6px;
        }

        .mr-step-premium-content-box {
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: left;
        }

        .mr-step-premium-title {
          margin: 0 0 12px 0;
          font-size: 1.05rem;
          font-weight: 800;
          color: #2d6a4f;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        [data-theme="dark"] .mr-step-premium-title {
          color: #52b788;
        }
        
        .mr-step-premium-desc {
          margin: 0;
          font-size: 0.88rem;
          line-height: 1.65;
          color: var(--text-strong);
        }

        .mr-step-premium-card.alternate .mr-step-premium-grid {
          grid-template-columns: 1fr auto;
        }
        .mr-step-premium-card.alternate .mr-step-premium-img-box {
          order: 2;
          border-radius: 0 6px 6px 0;
        }
        .mr-step-premium-card.alternate .mr-step-premium-img-box img {
          border-radius: 0 6px 6px 0;
        }
        .mr-step-premium-card.alternate .mr-step-premium-content-box {
          order: 1;
        }

        /* Responsive behavior */
        @media (max-width: 576px) {
          .mr-hero-row {
            flex-direction: column !important;
            align-items: center !important;
            gap: 20px !important;
          }
          .mr-hero-img {
            max-width: 100% !important;
            aspect-ratio: 4/3 !important;
          }
          .mr-product-story {
            max-width: 100% !important;
            width: 100% !important;
          }
        }

        @media (max-width: 768px) {
          .mr-step-premium-grid {
            grid-template-columns: 1fr !important;
          }
          .mr-sketch-line-middle {
            display: none !important;
          }
          .mr-step-premium-img-box {
            height: 200px;
            padding: 0 !important;
            order: 1 !important;
            border-radius: 6px 6px 0 0 !important;
            aspect-ratio: auto;
            align-self: stretch !important;
          }
          .mr-step-premium-img-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 6px 6px 0 0 !important;
          }
          .mr-step-premium-content-box {
            order: 2 !important;
          }
          .mr-sketch-line-left {
            top: -12px;
            bottom: -12px;
          }
          .mr-sketch-line-right {
            top: -12px;
            bottom: -12px;
          }
          .mr-sketch-line-top {
            left: -12px;
            right: -12px;
          }
          .mr-sketch-line-bottom {
            left: -12px;
            right: -12px;
          }
        }

        /* ─── PREMIUM COMPARISONS (READER) ─── */
        .mr-comp-premium-card {
          position: relative;
          background: var(--surface);
          margin: 20px 24px;
          padding: 0;
        }
        .mr-comp-premium-grid {
          display: grid;
          gap: 0;
          min-height: 120px;
        }
        .mr-comp-premium-img-box {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: var(--surface-2);
          aspect-ratio: 4 / 3;
          height: 5cm;
          align-self: center;
          flex-shrink: 0;
        }
        .mr-comp-premium-img-box.correct {
          border-radius: 6px 0 0 6px;
          border-left: 3px solid #10b981;
        }
        .mr-comp-premium-img-box.wrong {
          border-radius: 0 6px 6px 0;
          border-right: 3px solid #ef4444;
        }
        .mr-comp-premium-img-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .mr-comp-premium-img-box.correct img {
          border-radius: 6px 0 0 6px;
        }
        .mr-comp-premium-img-box.wrong img {
          border-radius: 0 6px 6px 0;
        }
        .mr-comp-premium-content-box {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: center;
        }
        .mr-comp-premium-title {
          margin: 0 0 8px 0;
          font-size: 1rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .mr-comp-premium-desc {
          margin: 0;
          font-size: 0.84rem;
          line-height: 1.6;
          color: var(--text-strong);
        }
        .mr-sketch-line-middle-left {
          position: absolute;
          top: -24px;
          bottom: -24px;
          left: calc(5cm * 4 / 3);
          width: 3px;
          border-radius: 1px;
          z-index: 2;
        }
        .mr-sketch-line-middle-right {
          position: absolute;
          top: -24px;
          bottom: -24px;
          right: calc(5cm * 4 / 3);
          width: 3px;
          border-radius: 1px;
          z-index: 2;
        }

        /* ─── MARKDOWN CONTENT ─── */
        .mr-content {
          line-height: 1.8;
          font-size: .88rem;
          color: var(--text-strong);
          margin-bottom: 24px;
        }
        .mr-content h1 {
          font-size: 1.35rem;
          font-weight: 800;
          margin: 24px 0 10px;
          color: var(--text-strong);
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
        }
        .mr-content h2 {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 20px 0 8px;
          color: var(--text-strong);
        }
        .mr-content h3 {
          font-size: .95rem;
          font-weight: 700;
          margin: 16px 0 6px;
          color: var(--text-strong);
        }
        .mr-content strong { font-weight: 700; }
        .mr-content li {
          margin-left: 18px;
          margin-bottom: 5px;
        }

        /* ─── PREV/NEXT NAV ─── */
        .mr-page-nav {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }
        .mr-page-nav-btn {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 18px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          cursor: pointer;
          transition: all .15s;
          font-family: inherit;
          text-align: left;
        }
        .mr-page-nav-btn:hover {
          border-color: var(--accent-primary);
          background: rgba(245,166,35,.04);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0,0,0,.05);
        }
        .mr-page-nav-btn.next { text-align: right; }
        .mr-page-nav-btn .mr-nav-dir {
          font-size: .62rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--accent-primary);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .mr-page-nav-btn.next .mr-nav-dir { justify-content: flex-end; }
        .mr-page-nav-btn .mr-nav-title {
          font-size: .82rem;
          font-weight: 700;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mr-page-nav-placeholder {
          /* empty cell for single-direction nav */
        }

        /* ─── LOADING ─── */
        .mr-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          gap: 14px;
          color: var(--text-muted);
        }
        .mr-loading i { font-size: 1.4rem; color: var(--accent-primary); }
        .mr-loading p { font-size: .85rem; margin: 0; }

        /* ─── MOBILE ─── */
        .mr-mobile-toggle {
          display: none;
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 300;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          color: #fff;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          box-shadow: 0 4px 20px rgba(245,166,35,.4);
          transition: transform .2s;
        }
        .mr-mobile-toggle:hover { transform: scale(1.08); }
        .mr-mobile-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.5);
          z-index: 290;
          backdrop-filter: blur(3px);
        }

        @media (max-width: 768px) {
          .mr-root {
            grid-template-columns: 1fr !important;
          }
          .mr-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 300px;
            z-index: 295;
            transform: translateX(-100%);
            transition: transform .3s cubic-bezier(.4,0,.2,1);
            box-shadow: none;
          }
          .mr-sidebar.open {
            transform: translateX(0);
            box-shadow: 8px 0 30px rgba(0,0,0,.15);
          }
          .mr-mobile-toggle { display: flex; align-items: center; justify-content: center; }
          .mr-mobile-overlay.open { display: block; }
          .mr-main { padding: 20px 16px; }
          .mr-page-nav { grid-template-columns: 1fr; }
        }

        @media (max-width: 1024px) and (min-width: 769px) {
          .mr-root { grid-template-columns: 240px minmax(0, 1fr); }
        }

        /* ─── PRINT ─── */
        @media print {
          .mr-root {
            display: block !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
          .mr-sidebar,
          .mr-mobile-toggle,
          .mr-mobile-overlay,
          .mr-toolbar,
          .mr-page-nav,
          .mr-breadcrumb,
          .mr-equip-pill,
          nav,
          header,
          footer,
          #sidebar-panel,
          #sidebar-overlay,
          .top-nav,
          .navbar,
          .sidebar,
          .topbar,
          .layout-sidebar,
          .layout-topbar,
          .layout-sidebar-anchor {
            display: none !important;
          }
          .mr-main {
            padding: 0 !important;
            min-height: auto !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .mr-detail { max-width: 100% !important; }

          @page {
            size: landscape;
            margin: 12mm 15mm;
          }

          .mr-title-area { border-bottom: 2px solid #333 !important; }
          .mr-hero-img { break-inside: avoid; }
          .mr-specs { break-inside: avoid; }
          .mr-step { break-inside: avoid; }
          .mr-recipe-table { break-inside: avoid; }
          .mr-page-animate { animation: none !important; }

          .mr-print-header {
            display: flex !important;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 8px;
            margin-bottom: 16px;
            border-bottom: 2px solid #000;
            font-size: 9pt;
            color: #666;
          }
          .mr-print-footer {
            display: block !important;
            margin-top: 24px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            text-align: center;
            font-size: 8pt;
            color: #999;
          }

          /* Make sure images print */
          img { max-width: 100% !important; }

          /* Clean backgrounds */
          .mr-spec-card, .mr-shelf-warning, .mr-step-num, .mr-specs-banner-strip, .mr-spec-art-card, .mr-spec-art-top, .mr-spec-art-bottom {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Force hero row side-by-side during print */
          .mr-hero-row {
            display: flex !important;
            flex-direction: row !important;
            align-items: stretch !important;
            gap: 24px !important;
            width: 100% !important;
            margin-bottom: 24px !important;
          }
          .mr-hero-img {
            flex: 1 !important;
            max-width: 44% !important;
            aspect-ratio: 4/3 !important;
            height: auto !important;
          }
          .mr-product-story {
            flex: 1.2 !important;
            max-width: 56% !important;
            height: auto !important;
          }
        }

                /* ─── CHANNEL TOOLTIP ─── */
        .mr-channel-tooltip-container {
          position: relative;
          display: inline-block;
        }

        .mr-channel-tooltip-content {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: 125%;
          right: 0;
          transform: translateY(4px);
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
          padding: 8px 12px;
          min-width: 170px;
          z-index: 100;
          pointer-events: none;
          transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.2s;
        }

        .mr-channel-tooltip-container:hover .mr-channel-tooltip-content {
          visibility: visible;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .mr-channel-tooltip-arrow {
          position: absolute;
          top: 100%;
          right: 15px;
          border-width: 6px;
          border-style: solid;
          border-color: #ffffff transparent transparent transparent;
        }
        
        .mr-channel-tooltip-arrow-border {
          position: absolute;
          top: 100%;
          right: 15px;
          border-width: 7px;
          border-style: solid;
          border-color: var(--border) transparent transparent transparent;
          z-index: -1;
        }

        /* ─── EQUIP TABLE ─── */
        .mr-equip-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: .8rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: visible;
          margin-bottom: 16px;
        }
        .mr-equip-table thead tr:first-child th:first-child {
          border-top-left-radius: 11px;
        }
        .mr-equip-table thead tr:first-child th:last-child {
          border-top-right-radius: 11px;
        }
        .mr-equip-table tbody tr:last-child td:first-child {
          border-bottom-left-radius: 11px;
        }
        .mr-equip-table tbody tr:last-child td:last-child {
          border-bottom-right-radius: 11px;
        }
        .mr-equip-table thead th {
          background: var(--surface-2);
          padding: 8px 12px;
          text-align: left;
          font-size: .65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .mr-equip-table thead th:last-child { text-align: center; }
        .mr-equip-table tbody tr { transition: background .12s; }
        .mr-equip-table tbody tr:hover { background: rgba(239, 68, 68, 0.03); }
        .mr-equip-table tbody td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          color: var(--text-strong);
        }
        .mr-equip-table tbody tr:last-child td { border-bottom: none; }
        .mr-equip-table tbody td:last-child { text-align: center; }
        
        .mr-equip-fault-btn {
          font-size: .62rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
          color: #ef4444;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .mr-equip-fault-btn:hover {
          background: #ef4444;
          color: #ffffff;
          border-color: #ef4444;
          box-shadow: 0 2px 6px rgba(239, 68, 68, 0.15);
        }

        .mr-channel-tooltip-title {
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--text-strong);
          border-bottom: 1px solid var(--border);
          padding-bottom: 6px;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: left;
        }

        .mr-channel-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .mr-channel-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-muted);
          padding: 3px 6px;
          border-radius: 6px;
          transition: background 0.15s ease;
          text-align: left;
        }
        
        .mr-channel-item:hover {
          background: var(--surface-hover);
          color: var(--text-strong);
        }

        .mr-channel-item.active {
          color: #4f46e5;
        }
        .mr-channel-item.active.all {
          color: #10b981;
        }

        .mr-channel-item i {
          font-size: 0.8rem;
          width: 14px;
          text-align: center;
          display: inline-block;
        }

        /* Hidden on screen, visible on print */
        .mr-print-header, .mr-print-footer { display: none; }
      `}),e.jsx("header",{className:"mr-header",children:e.jsxs("div",{className:"mr-header-container",children:[e.jsxs("button",{className:"mr-header-brand",onClick:()=>{T(null),H(null),ie(r=>r+1)},children:[e.jsx("div",{className:"mr-header-brand-icon",children:e.jsx("i",{className:"fa-solid fa-book-open"})}),e.jsxs("div",{className:"mr-header-brand-text",children:[e.jsx("h2",{children:"Operasyon El Kitabı"}),e.jsxs("span",{children:[h.length," Sayfa"]})]})]}),e.jsx("nav",{className:"mr-header-nav",children:f.map(r=>{const t=h.filter(n=>n.category_id===r.id),c=A(r.name),m=$(r.name),i=(a==null?void 0:a.category_id)===r.id;return e.jsxs("div",{className:"mr-nav-item",children:[e.jsxs("button",{className:`mr-nav-btn${i?" active":""}`,children:[e.jsx("i",{className:`fa-solid ${c}`,style:{color:m,marginRight:6}}),r.name,e.jsx("i",{className:"fa-solid fa-chevron-down mr-nav-chevron"})]}),e.jsx("div",{className:"mr-nav-dropdown",children:e.jsx("div",{className:"mr-dropdown-grid",children:t.length===0?e.jsx("div",{className:"mr-dropdown-empty",children:"Bu kategoride henüz sayfa yok."}):t.map(n=>e.jsxs("button",{className:`mr-dropdown-card ${g===n.id?"active":""}`,onClick:()=>S(n.id),children:[e.jsx("div",{className:"mr-dropdown-card-icon",children:e.jsx("i",{className:"fa-regular fa-file-lines"})}),e.jsxs("div",{className:"mr-dropdown-card-content",children:[e.jsx("span",{className:"mr-dropdown-card-title",children:n.title}),e.jsx("span",{className:"mr-dropdown-card-desc",children:"Görüntülemek için tıklayın"})]})]},n.id))})})]},r.id)})}),e.jsxs("div",{className:"mr-header-search-wrap",children:[e.jsx("i",{className:"fa-solid fa-magnifying-glass mr-search-icon"}),e.jsx("input",{ref:U,className:"mr-search-input",placeholder:"Ara... (Ctrl+K)",value:R,onChange:r=>O(r.target.value),onFocus:()=>E(!0),onBlur:()=>setTimeout(()=>E(!1),200)}),we&&R.trim()&&e.jsx("div",{className:"mr-search-dropdown",children:Q.length===0?e.jsxs("div",{className:"mr-search-empty",children:[e.jsx("i",{className:"fa-solid fa-magnifying-glass",style:{marginRight:6,opacity:.5}}),"Sonuç bulunamadı"]}):Q.map(r=>e.jsxs("button",{className:"mr-search-item",onMouseDown:()=>S(r.id),children:[e.jsx("i",{className:`fa-solid ${A(r.categoryName)}`,style:{fontSize:".7rem",color:$(r.categoryName)}}),e.jsx("span",{className:"mr-search-item-title",children:r.title}),e.jsx("span",{className:"mr-search-item-cat",children:r.categoryName})]},r.id))})]}),e.jsx("button",{className:"mr-header-hamburger",onClick:()=>te(r=>!r),children:e.jsx("i",{className:`fa-solid ${ae?"fa-xmark":"fa-bars"}`})})]})}),e.jsxs("aside",{className:`mr-sidebar${ae?" open":""}`,children:[e.jsxs("div",{className:"mr-sidebar-header",children:[e.jsxs("div",{className:"mr-sidebar-brand",children:[e.jsx("div",{className:"mr-sidebar-brand-icon",children:e.jsx("i",{className:"fa-solid fa-book-open"})}),e.jsxs("div",{children:[e.jsx("h2",{children:"Operasyon El Kitabı"}),e.jsxs("span",{children:[f.length," Kategori · ",h.length," Sayfa"]})]})]}),e.jsxs("div",{className:"mr-search-wrap",ref:Mr,children:[e.jsx("i",{className:"fa-solid fa-magnifying-glass mr-search-icon"}),e.jsx("input",{className:"mr-search-input",placeholder:"Sayfa ara...",value:R,onChange:r=>O(r.target.value),onFocus:()=>E(!0),onBlur:()=>setTimeout(()=>E(!1),200)}),we&&R.trim()&&e.jsx("div",{className:"mr-search-dropdown",children:Q.length===0?e.jsxs("div",{className:"mr-search-empty",children:[e.jsx("i",{className:"fa-solid fa-magnifying-glass",style:{marginRight:6,opacity:.5}}),"Sonuç bulunamadı"]}):Q.map(r=>e.jsxs("button",{className:"mr-search-item",onMouseDown:()=>S(r.id),children:[e.jsx("i",{className:`fa-solid ${A(r.categoryName)}`,style:{fontSize:".7rem",color:$(r.categoryName)}}),e.jsx("span",{className:"mr-search-item-title",children:r.title}),e.jsx("span",{className:"mr-search-item-cat",children:r.categoryName})]},r.id))})]})]}),e.jsx("nav",{className:"mr-nav",children:qr?e.jsxs("div",{style:{padding:24,textAlign:"center",color:"var(--text-muted)"},children:[e.jsx("i",{className:"fa-solid fa-spinner fa-spin",style:{marginRight:6}})," Yükleniyor..."]}):f.map(r=>{const t=h.filter(l=>l.category_id===r.id),c=!!k[r.id],m=A(r.name),i=$(r.name),n=(a==null?void 0:a.category_id)===r.id;return e.jsxs("div",{children:[e.jsxs("button",{className:`mr-cat-btn${n?" active":""}`,onClick:()=>Vr(r.id),children:[e.jsx("div",{className:"mr-cat-icon",style:{background:`${i}14`,color:i},children:e.jsx("i",{className:`fa-solid ${m}`})}),e.jsx("span",{style:{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:r.name}),e.jsx("span",{className:"mr-cat-count",children:t.length}),e.jsx("i",{className:`fa-solid fa-chevron-right mr-cat-chevron${c?" open":""}`})]}),c&&e.jsx("div",{className:"mr-page-list",children:t.length===0?e.jsx("span",{style:{fontSize:".7rem",color:"var(--text-muted)",padding:"6px 10px"},children:"Henüz sayfa yok"}):t.map(l=>e.jsxs("button",{className:`mr-page-btn${g===l.id?" active":""}`,onClick:()=>S(l.id),children:[e.jsx("i",{className:"fa-regular fa-file-lines mr-page-icon"}),e.jsx("span",{className:"mr-page-label",children:l.title})]},l.id))})]},r.id)})})]}),e.jsx("div",{className:`mr-mobile-overlay${ae?" open":""}`,onClick:()=>te(!1)}),e.jsx("main",{className:"mr-main",children:Or?e.jsxs("div",{className:"mr-loading",children:[e.jsx("i",{className:"fa-solid fa-spinner fa-spin"}),e.jsx("p",{children:"Sayfa yükleniyor..."})]}):a?e.jsxs("div",{className:"mr-detail mr-page-animate",children:[e.jsxs("div",{className:"mr-print-header",children:[e.jsx("span",{children:"İşletme ve Eğitim El Kitabı"}),e.jsxs("span",{children:[L," — ",a.title]}),e.jsxs("span",{children:["v",a.version," · ",new Date(a.updated_at).toLocaleDateString("tr-TR")]})]}),e.jsxs("div",{className:"mr-breadcrumb",children:[e.jsxs("button",{className:"mr-breadcrumb-item",onClick:()=>{T(null),H(null),ie(r=>r+1)},children:[e.jsx("i",{className:"fa-solid fa-house",style:{fontSize:".6rem",marginRight:3}})," El Kitabı"]}),e.jsx("i",{className:"fa-solid fa-chevron-right mr-breadcrumb-sep"}),e.jsx("button",{className:"mr-breadcrumb-item",onClick:()=>{const r=f.find(t=>t.id===a.category_id);r&&u(t=>({...t,[r.id]:!0}))},children:L}),e.jsx("i",{className:"fa-solid fa-chevron-right mr-breadcrumb-sep"}),e.jsx("span",{className:"mr-breadcrumb-current",children:a.title})]}),e.jsxs("div",{className:"mr-toolbar",children:[e.jsx("div",{style:{flex:1}}),e.jsx("button",{className:"mr-toolbar-btn",onClick:()=>window.print(),title:"Yazdır",children:e.jsx("i",{className:"fa-solid fa-print"})})]}),e.jsxs("div",{className:"mr-title-area",children:[e.jsxs("div",{className:"mr-title-row",children:[e.jsx("div",{className:"mr-title-icon",style:{background:`${z}14`,color:z},children:e.jsx("i",{className:`fa-solid ${Qr}`})}),e.jsx("div",{className:"mr-title",style:{flex:1},children:e.jsx("h1",{children:a.title})})]}),e.jsxs("div",{className:"mr-meta-row",children:[e.jsx("span",{className:"mr-cat-badge",style:{background:`${z}14`,color:z},children:L}),e.jsxs("span",{className:"mr-meta-item",children:[e.jsx("i",{className:"fa-solid fa-code-branch"})," v",a.version]}),e.jsxs("span",{className:"mr-meta-item",children:[e.jsx("i",{className:"fa-regular fa-calendar"})," ",new Date(a.updated_at).toLocaleDateString("tr-TR")]}),e.jsxs("span",{className:"mr-meta-item",children:[e.jsx("i",{className:"fa-regular fa-clock"})," ~",da(a)," dk okuma"]})]})]}),(((Te=a.metadata)==null?void 0:Te.product_image)||((De=a.metadata)==null?void 0:De.description))&&e.jsxs("div",{className:"mr-hero-row",children:[((Le=a.metadata)==null?void 0:Le.product_image)&&e.jsx("div",{className:"mr-hero-img",children:e.jsx("img",{src:_(a.metadata.product_image),alt:a.title})}),((Ie=a.metadata)==null?void 0:Ie.description)&&e.jsxs("div",{className:"mr-product-story",children:[e.jsx("div",{className:"mr-story-quote-icon",children:e.jsx("i",{className:"fa-solid fa-quote-left"})}),e.jsx("div",{className:"mr-story-text",children:q(a.metadata.description)}),e.jsx("div",{className:"mr-story-quote-icon",style:{textAlign:"right",marginTop:-8},children:e.jsx("i",{className:"fa-solid fa-quote-right"})})]})]}),(()=>{var Ke,We,Fe,Ye,He,Ue,Ge,Ve,Xe,Qe,Je,Ze,er,rr,ar,tr,ir,sr,nr,or,lr,cr,dr,mr,pr,xr,fr,hr,gr,br,ur,vr,yr,jr,wr,kr,Nr,_r,zr,Sr,Cr,Rr,$r;const r=((Ke=a.metadata)==null?void 0:Ke.spec_1_label)!==void 0?a.metadata.spec_1_label:((We=a.metadata)==null?void 0:We.prep_time_label)||"Hazırlanma Süresi",t=((Fe=a.metadata)==null?void 0:Fe.spec_1_val)!==void 0?a.metadata.spec_1_val:((Ye=a.metadata)==null?void 0:Ye.prep_time)||"",c=((He=a.metadata)==null?void 0:He.spec_1_desc)||"",m=((Ue=a.metadata)==null?void 0:Ue.spec_2_label)!==void 0?a.metadata.spec_2_label:((Ge=a.metadata)==null?void 0:Ge.thaw_time_label)||"Çözünme Süresi",i=((Ve=a.metadata)==null?void 0:Ve.spec_2_val)!==void 0?a.metadata.spec_2_val:((Xe=a.metadata)==null?void 0:Xe.thaw_time)||"",n=((Qe=a.metadata)==null?void 0:Qe.spec_2_desc)||"",l=((Je=a.metadata)==null?void 0:Je.spec_3_label)!==void 0?a.metadata.spec_3_label:((Ze=a.metadata)==null?void 0:Ze.cooling_time_label)||"Ilınma/Soğuma",d=((er=a.metadata)==null?void 0:er.spec_3_val)!==void 0?a.metadata.spec_3_val:((rr=a.metadata)==null?void 0:rr.cooling_time)||"",o=((ar=a.metadata)==null?void 0:ar.spec_3_desc)||"",b=((tr=a.metadata)==null?void 0:tr.spec_4_label)||"Özellik 4",j=((ir=a.metadata)==null?void 0:ir.spec_4_val)||"",w=((sr=a.metadata)==null?void 0:sr.spec_4_desc)||"",K=((nr=a.metadata)==null?void 0:nr.spec_5_label)||"Özellik 5",C=((or=a.metadata)==null?void 0:or.spec_5_val)||"",Oe=((lr=a.metadata)==null?void 0:lr.spec_5_desc)||"",Z=((cr=a.metadata)==null?void 0:cr.spec_6_label)||"Özellik 6",W=((dr=a.metadata)==null?void 0:dr.spec_6_val)||"",pe=((mr=a.metadata)==null?void 0:mr.spec_6_desc)||"",ee=((pr=a.metadata)==null?void 0:pr.shelf_1_label)!==void 0?a.metadata.shelf_1_label:((xr=a.metadata)==null?void 0:xr.primary_shelf_life_label)||"1. Raf Ömrü (Kapalı)",I=((fr=a.metadata)==null?void 0:fr.shelf_1_val)!==void 0?a.metadata.shelf_1_val:(hr=a.metadata)!=null&&hr.primary_shelf_life?`${a.metadata.primary_shelf_life}${a.metadata.primary_storage_cond?` (${a.metadata.primary_storage_cond})`:""}`:"",Zr=((gr=a.metadata)==null?void 0:gr.shelf_2_label)!==void 0?a.metadata.shelf_2_label:((br=a.metadata)==null?void 0:br.secondary_shelf_life_1_label)||"Durum 1",xe=((ur=a.metadata)==null?void 0:ur.shelf_2_val)!==void 0?a.metadata.shelf_2_val:(vr=a.metadata)!=null&&vr.secondary_shelf_life_1?`${a.metadata.secondary_shelf_life_1}${a.metadata.secondary_storage_cond_1?` (${a.metadata.secondary_storage_cond_1})`:""}`:"",ea=((yr=a.metadata)==null?void 0:yr.shelf_3_label)!==void 0?a.metadata.shelf_3_label:((jr=a.metadata)==null?void 0:jr.secondary_shelf_life_2_label)||"Durum 2",fe=((wr=a.metadata)==null?void 0:wr.shelf_3_val)!==void 0?a.metadata.shelf_3_val:(kr=a.metadata)!=null&&kr.secondary_shelf_life_2?`${a.metadata.secondary_shelf_life_2}${a.metadata.secondary_storage_cond_2?` (${a.metadata.secondary_storage_cond_2})`:""}`:"",ra=((Nr=a.metadata)==null?void 0:Nr.shelf_4_label)||"Durum 3",he=((_r=a.metadata)==null?void 0:_r.shelf_4_val)||"",aa=((zr=a.metadata)==null?void 0:zr.shelf_5_label)||"Durum 4",ge=((Sr=a.metadata)==null?void 0:Sr.shelf_5_val)||"",ta=((Cr=a.metadata)==null?void 0:Cr.shelf_6_label)||"Durum 5",be=((Rr=a.metadata)==null?void 0:Rr.shelf_6_val)||"",F=t||i||d||j||C||W,Me=I||xe||fe||he||ge||be;return!F&&!Me?null:e.jsxs("div",{className:"mr-specs",children:[F&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"mr-specs-title",style:{marginBottom:20},children:[e.jsx("i",{className:"fa-solid fa-circle-info"})," Ürün Özellikleri"]}),e.jsxs("div",{className:"mr-specs-banner",children:[e.jsx("div",{className:"mr-specs-banner-strip",children:(($r=a.metadata)==null?void 0:$r.product_image)&&e.jsx("div",{className:"mr-specs-banner-bg",style:{backgroundImage:`url(${_(a.metadata.product_image)})`}})}),e.jsx("div",{className:"mr-specs-banner-grid",children:[{label:r,val:t,desc:c},{label:m,val:i,desc:n},{label:l,val:d,desc:o},{label:b,val:j,desc:w},{label:K,val:C,desc:Oe},{label:Z,val:W,desc:pe}].map((Y,ia)=>{if(!Y.val)return null;const B=ue(Y.label);return e.jsxs("div",{className:"mr-spec-art-card",style:{"--card-border":B.border,"--card-bg-top":B.bgTop,"--card-bg-bottom":B.bgBottom,"--card-val-color":B.valColor},children:[e.jsxs("div",{className:"mr-spec-art-top",children:[e.jsxs("div",{className:"mr-spec-art-label",children:[e.jsx("i",{className:`fa-solid ${B.icon}`,style:B.iconStyle}),Y.label]}),e.jsx("div",{className:"mr-spec-art-val",children:Y.val})]}),e.jsx("div",{className:"mr-spec-art-bottom",children:Y.desc||e.jsx("span",{style:{color:"var(--text-muted)",fontStyle:"italic"},children:"Açıklama girilmedi"})})]},ia)})})]})]}),Me&&e.jsxs("div",{className:"mr-shelf",style:{borderTop:F?"1px dashed var(--border)":"none",marginTop:F?16:0,paddingTop:F?16:0},children:[e.jsx("div",{className:"mr-shelf-title",children:"Raf Ömrü Standartları"}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[I&&e.jsxs("div",{className:"mr-shelf-row",children:[e.jsx("span",{className:"mr-shelf-row-label",children:ee}),e.jsx("span",{className:"mr-shelf-row-value",children:I})]}),xe&&e.jsxs("div",{className:"mr-shelf-row mr-shelf-warning-row",style:{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:6},children:[e.jsx("span",{style:{fontSize:".7rem",fontWeight:600,color:"#b45309"},children:Zr}),e.jsx("span",{style:{fontSize:".7rem",fontWeight:800,color:"#b45309"},children:xe})]}),fe&&e.jsxs("div",{className:"mr-shelf-row mr-shelf-warning-row",style:{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:6},children:[e.jsx("span",{style:{fontSize:".7rem",fontWeight:600,color:"#b45309"},children:ea}),e.jsx("span",{style:{fontSize:".7rem",fontWeight:800,color:"#b45309"},children:fe})]}),he&&e.jsxs("div",{className:"mr-shelf-row mr-shelf-warning-row",style:{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:6},children:[e.jsx("span",{style:{fontSize:".7rem",fontWeight:600,color:"#b45309"},children:ra}),e.jsx("span",{style:{fontSize:".7rem",fontWeight:800,color:"#b45309"},children:he})]}),ge&&e.jsxs("div",{className:"mr-shelf-row mr-shelf-warning-row",style:{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:6},children:[e.jsx("span",{style:{fontSize:".7rem",fontWeight:600,color:"#b45309"},children:aa}),e.jsx("span",{style:{fontSize:".7rem",fontWeight:800,color:"#b45309"},children:ge})]}),be&&e.jsxs("div",{className:"mr-shelf-row mr-shelf-warning-row",style:{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:6},children:[e.jsx("span",{style:{fontSize:".7rem",fontWeight:600,color:"#b45309"},children:ta}),e.jsx("span",{style:{fontSize:".7rem",fontWeight:800,color:"#b45309"},children:be})]})]})]})]})})(),ve.length>0&&(()=>{const r={};ve.forEach(n=>{((n.portions||[]).length>0?n.portions:["__standart__"]).forEach(d=>{r[d]||(r[d]=[]),r[d].push(n)})});const t=Object.keys(r).sort((n,l)=>n==="__standart__"?-1:l==="__standart__"?1:n.localeCompare(l,"tr")),c=t.length>1||t.length===1&&t[0]!=="__standart__",m=new Set,i=new Set;return t.length>1&&(t.forEach(l=>{l!=="__standart__"&&(r[l]||[]).forEach(o=>{i.add((o.name||"").toLowerCase().trim())})}),(r.__standart__||[]).forEach(l=>{const d=(l.name||"").toLowerCase().trim();i.has(d)||m.add(d)})),e.jsxs("div",{style:{marginBottom:24},children:[e.jsxs("div",{className:"mr-section-head",children:[e.jsx("div",{className:"mr-section-bar",style:{background:z}}),e.jsx("span",{className:"mr-section-label",children:"Reçete"}),c&&e.jsxs("span",{style:{marginLeft:8,fontSize:".62rem",color:"var(--text-muted)",fontWeight:500},children:[t.length," boyut grubu"]})]}),e.jsx("div",{className:c?"mr-recipe-grid":"",style:{gap:c?20:0},children:t.map((n,l)=>{var j;const d=r[n],o=n==="__standart__",b=Br[n]||((j=Tr.portionNames)==null?void 0:j[n])||(o?"Standart":n);return e.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[c&&e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:8},children:[e.jsxs("span",{style:{fontSize:".65rem",fontWeight:800,padding:"3px 12px",borderRadius:20,background:o?"rgba(245,166,35,.12)":"rgba(99,102,241,.1)",color:o?"var(--accent-primary)":"#6366f1",border:`1px solid ${o?"rgba(245,166,35,.25)":"rgba(99,102,241,.2)"}`,display:"inline-flex",alignItems:"center",gap:5},children:[e.jsx("i",{className:`fa-solid ${o?"fa-circle-check":"fa-expand"}`,style:{fontSize:".55rem"}}),b]}),!o&&e.jsx("span",{style:{fontSize:".6rem",color:"var(--text-muted)"},children:"Standart'tan farklı malzemeler"})]}),e.jsxs("table",{className:"mr-recipe-table",style:{marginBottom:0,tableLayout:"fixed"},children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{style:{width:"auto",textAlign:"left"},children:"Malzeme"}),e.jsx("th",{style:{width:"100px",textAlign:"right"},children:"Miktar"})]})}),e.jsx("tbody",{children:d.map((w,K)=>{var W;const C=w.linked_page_id||((W=h.find(pe=>{var ee,I;return((ee=pe.title)==null?void 0:ee.toLowerCase().trim())===((I=w.name)==null?void 0:I.toLowerCase().trim())}))==null?void 0:W.id),Z=t.length>1&&m.has((w.name||"").toLowerCase().trim())?"mr-recipe-common":"mr-recipe-specific";return e.jsxs("tr",{children:[e.jsx("td",{style:{width:"auto",textAlign:"left"},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"8px"},children:[w.image_url&&e.jsx("img",{src:_(w.image_url),alt:w.name,style:{height:"2cm",maxHeight:"2cm",width:"auto",objectFit:"contain",borderRadius:"4px",flexShrink:0}}),C?e.jsxs("button",{className:`mr-recipe-link ${Z} mr-ingredient-link`,onClick:()=>Xr(C),title:"Hammadde sayfasını aç",children:[w.name,e.jsx("i",{className:"fa-solid fa-arrow-up-right-from-square",style:{fontSize:"0.6em",marginLeft:5,opacity:.6}})]}):e.jsx("span",{className:Z,children:w.name})]})}),e.jsx("td",{style:{width:"100px",textAlign:"right",fontWeight:600},children:ma(w,Lr)})]},K)})})]})]},n)})})]})})(),((Be=a.equipments)==null?void 0:Be.length)>0&&e.jsxs("div",{style:{marginBottom:24},children:[e.jsxs("div",{className:"mr-section-head",children:[e.jsx("div",{className:"mr-section-bar",style:{background:"#ef4444"}}),e.jsx("span",{className:"mr-section-label",children:"Ekipmanlar"})]}),e.jsxs("table",{className:"mr-equip-table",style:{width:"100%",maxWidth:"400px",marginBottom:12},children:[e.jsx("thead",{children:e.jsx("tr",{children:e.jsx("th",{style:{textAlign:"left"},children:"Ekipman"})})}),e.jsx("tbody",{children:a.equipments.map(r=>e.jsx("tr",{children:e.jsx("td",{style:{textAlign:"left",fontWeight:500},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"8px"},children:[r.image_url&&e.jsx("img",{src:_(r.image_url),alt:r.name,style:{height:"2cm",maxHeight:"2cm",width:"auto",objectFit:"contain",borderRadius:"4px",flexShrink:0}}),e.jsx("span",{children:r.name})]})})},r.id))})]})]}),((qe=(Pe=a.metadata)==null?void 0:Pe.steps)==null?void 0:qe.length)>0&&(()=>{const r=a.metadata.steps.filter(t=>{var c;return((c=t.description)==null?void 0:c.trim())||t.imageUrl});return r.length===0?null:e.jsxs("div",{className:"mr-steps",children:[e.jsxs("div",{className:"mr-section-head",children:[e.jsx("div",{className:"mr-section-bar",style:{background:z}}),e.jsx("span",{className:"mr-section-label",children:r.length>1?"Hazırlık Adımları":"Hazırlık Prosedürü"})]}),e.jsx("div",{className:"mr-steps-premium-container",children:a.metadata.steps.map((t,c)=>{const{stepNumber:m,title:i,body:n}=Er(t.description,c),l=c%2===1,d=!!t.imageUrl;return e.jsxs("div",{className:`mr-step-premium-card ${l?"alternate":""} ${d?"":"no-image"}`,children:[e.jsx("div",{className:"mr-sketch-line mr-sketch-line-top"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-bottom"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-left"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-right"}),d&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle"}),e.jsxs("div",{className:"mr-step-badge",children:[e.jsx("i",{className:"fa-solid fa-fire-burner"}),e.jsxs("span",{children:["Adım ",m]})]}),e.jsxs("div",{className:"mr-step-premium-grid",children:[d&&e.jsx("div",{className:"mr-step-premium-img-box",children:e.jsx("img",{src:_(t.imageUrl),alt:`Adım ${c+1}`})}),e.jsxs("div",{className:"mr-step-premium-content-box",children:[i&&e.jsxs("h3",{className:"mr-step-premium-title",children:[e.jsx("i",{className:"fa-solid fa-cookie-bite",style:{fontSize:"0.8rem",opacity:.8}}),i]}),e.jsx("div",{className:"mr-step-premium-desc",children:n?q(n):e.jsx("span",{style:{color:"var(--text-muted)",fontStyle:"italic"},children:"Açıklama girilmedi"})})]})]})]},c)})})]})})(),(()=>{var m;const r=((m=f.find(i=>i.id===a.category_id))==null?void 0:m.name)||"",t=r.toLowerCase().includes("hammad"),c=r.toLowerCase().includes("ürün")||r.toLowerCase().includes("urun");if(t){const i=a.metadata||{};return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:24,marginTop:16},children:[e.jsxs("div",{className:"mr-specs",style:{margin:0},children:[e.jsxs("div",{className:"mr-specs-title",style:{marginBottom:20},children:[e.jsx("i",{className:"fa-solid fa-circle-info"})," Hammadde Spesifikasyonları"]}),e.jsxs("div",{className:"mr-specs-banner",children:[e.jsx("div",{className:"mr-specs-banner-strip",children:i.ideal_product_photo&&e.jsx("div",{className:"mr-specs-banner-bg",style:{backgroundImage:`url(${_(i.ideal_product_photo)})`}})}),e.jsx("div",{className:"mr-specs-banner-grid",children:[{label:"Sistem / ERP Kodu",val:i.erp_code,desc:"Sistem tanımlayıcı kodu"},{label:"Kategori",val:i.subcategory,desc:"Hammadde alt kategorisi"},{label:"Onaylı Tedarikçi(ler)",val:i.approved_suppliers,desc:"Onaylanmış üretici listesi"},{label:"Çap ve Yükseklik",val:i.dimensions,desc:"Fiziksel boyut spesifikasyonu"},{label:"Gramaj",val:i.weight,desc:"Standart porsiyon gramajı"},{label:"Tat - Koku",val:i.slicing_standard,desc:"Organoleptik lezzet kriteri"},{label:"Doku / Görünüm",val:i.texture,desc:"Görsel kalite spesifikasyonu"},{label:"Sevkiyat Sıcaklığı",val:i.delivery_temp,desc:"Lojistik sıcaklık toleransı"},{label:"Ambalajlama Miktarı/Düzeni",val:i.packaging_qty,desc:"Koli/paket içi adet yerleşimi"},{label:"Kutu Kondisyonu",val:i.box_condition,desc:"Karton/ambalaj fiziksel durumu"}].map((n,l)=>{if(!n.val)return null;const d=ue(n.label);return e.jsxs("div",{className:"mr-spec-art-card",style:{"--card-border":d.border,"--card-bg-top":d.bgTop,"--card-bg-bottom":d.bgBottom,"--card-val-color":d.valColor},children:[e.jsxs("div",{className:"mr-spec-art-top",children:[e.jsxs("div",{className:"mr-spec-art-label",children:[e.jsx("i",{className:`fa-solid ${d.icon}`,style:d.iconStyle}),n.label]}),e.jsx("div",{className:"mr-spec-art-val",children:n.val})]}),e.jsx("div",{className:"mr-spec-art-bottom",children:n.desc})]},l)})})]})]}),e.jsxs("div",{style:{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:8,padding:16,fontSize:".84rem"},children:[e.jsxs("h4",{style:{margin:"0 0 10px",color:"#92400e",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",gap:6},children:[e.jsx("i",{className:"fa-solid fa-temperature-arrow-down"})," Depolama ve Raf Ömrü"]}),e.jsx("div",{style:{color:"#78350f",display:"flex",flexDirection:"column",gap:6},children:i.shelf_lives&&i.shelf_lives.length>0?e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",marginTop:10,fontSize:".78rem"},children:[e.jsx("thead",{children:e.jsxs("tr",{style:{borderBottom:"1px solid #d97706",color:"#92400e",textAlign:"left"},children:[e.jsx("th",{style:{padding:"4px",fontWeight:700},children:"Durum"}),e.jsx("th",{style:{padding:"4px",fontWeight:700},children:"Saklama Alanı"}),e.jsx("th",{style:{padding:"4px",fontWeight:700},children:"Raf Ömrü"})]})}),e.jsx("tbody",{children:i.shelf_lives.map((n,l)=>e.jsxs("tr",{style:{borderBottom:"1px dashed rgba(217, 119, 6, 0.2)"},children:[e.jsx("td",{style:{padding:"4px"},children:n.status||"-"}),e.jsx("td",{style:{padding:"4px"},children:n.storage_area||"-"}),e.jsx("td",{style:{padding:"4px",fontWeight:700},children:n.duration||"-"})]},l))})]}):e.jsxs("ul",{style:{margin:0,paddingLeft:16,listStyleType:"disc",display:"flex",flexDirection:"column",gap:6},children:[e.jsxs("li",{children:["Birincil Raf Ömrü (Kapalı): ",e.jsx("strong",{children:i.primary_shelf_life||"-"})]}),e.jsxs("li",{children:["İkincil Raf Ömrü (Açık/Çözünmüş): ",e.jsx("strong",{children:i.secondary_shelf_life||"-"})]})]})})]}),i.custom_parameters&&i.custom_parameters.length>0&&e.jsxs("div",{style:{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,padding:14,fontSize:".84rem"},children:[e.jsxs("h4",{style:{margin:"0 0 10px",color:"#5b21b6",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",gap:6},children:[e.jsx("i",{className:"fa-solid fa-circle-exclamation"})," Ek Depolama ve İstifleme Kuralları"]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12},children:i.custom_parameters.map((n,l)=>e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",borderBottom:"1px dashed #ede9fe",paddingBottom:4},children:[e.jsxs("span",{style:{color:"#7c3aed",fontWeight:500},children:[n.label,":"]}),e.jsx("strong",{style:{color:"#4c1d95",wordBreak:"break-all"},children:n.value})]},l))})]}),(()=>{const n=i.steps&&i.steps.length>0?i.steps:[{description:"bu stok malı kullanım için herhangi bir ön hazırlığa gerek yoktur doğrudan kullanılabilir.",imageUrl:"__default_check__"}];return n.filter(d=>{var o;return((o=d.description)==null?void 0:o.trim())||d.imageUrl}).length===0?null:e.jsxs("div",{className:"mr-steps",style:{margin:"16px 0 0 0"},children:[e.jsxs("div",{className:"mr-section-head",children:[e.jsx("div",{className:"mr-section-bar",style:{background:z}}),e.jsx("span",{className:"mr-section-label",children:"Kullanıma Hazırlık"})]}),e.jsx("div",{className:"mr-steps-premium-container",children:n.map((d,o)=>{const{stepNumber:b,title:j,body:w}=Er(d.description,o),K=o%2===1,C=!!d.imageUrl;return e.jsxs("div",{className:`mr-step-premium-card ${K?"alternate":""} ${C?"":"no-image"}`,children:[e.jsx("div",{className:"mr-sketch-line mr-sketch-line-top"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-bottom"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-left"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-right"}),C&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle"}),e.jsxs("div",{className:"mr-step-badge",style:{background:"linear-gradient(135deg, #10b981, #047857)"},children:[e.jsx("i",{className:"fa-solid fa-circle-check"}),e.jsxs("span",{children:["Adım ",b]})]}),e.jsxs("div",{className:"mr-step-premium-grid",children:[C&&e.jsx("div",{className:"mr-step-premium-img-box",style:d.imageUrl==="__default_check__"?{display:"flex",alignItems:"center",justifyContent:"center",background:"#ecfdf5"}:{},children:d.imageUrl==="__default_check__"?e.jsx("i",{className:"fa-solid fa-circle-check",style:{fontSize:"2.5rem",color:"#10b981"}}):e.jsx("img",{src:_(d.imageUrl),alt:`Adım ${o+1}`})}),e.jsxs("div",{className:"mr-step-premium-content-box",children:[j&&e.jsxs("h3",{className:"mr-step-premium-title",style:{color:"#047857"},children:[e.jsx("i",{className:"fa-solid fa-cookie-bite",style:{fontSize:"0.8rem",opacity:.8}}),j]}),e.jsx("div",{className:"mr-step-premium-desc",children:w?q(w):e.jsx("span",{style:{color:"var(--text-muted)",fontStyle:"italic"},children:"Açıklama girilmedi"})})]})]})]},o)})})]})})(),e.jsxs("div",{style:{background:"#fff5f5",border:"1px solid #fed7d7",borderRadius:8,padding:16,fontSize:".84rem"},children:[e.jsxs("h4",{style:{margin:"0 0 12px",color:"#c53030",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",gap:6},children:[e.jsx("i",{className:"fa-solid fa-triangle-exclamation"})," Red Kriterleri & Kusurlar"]}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[i.rejection_logistics&&e.jsxs("div",{children:[e.jsx("strong",{style:{color:"#9b2c2c"},children:"Lojistik Kusurları:"})," ",e.jsx("span",{style:{color:"#742a2a"},children:i.rejection_logistics})]}),i.rejection_cutting&&e.jsxs("div",{children:[e.jsx("strong",{style:{color:"#9b2c2c"},children:"Kesim/Form Kusurları:"})," ",e.jsx("span",{style:{color:"#742a2a"},children:i.rejection_cutting})]}),i.rejection_cold_chain&&e.jsxs("div",{children:[e.jsx("strong",{style:{color:"#9b2c2c"},children:"Soğuk Zincir/Nem:"})," ",e.jsx("span",{style:{color:"#742a2a"},children:i.rejection_cold_chain})]}),i.rejection_visual&&e.jsxs("div",{children:[e.jsx("strong",{style:{color:"#9b2c2c"},children:"Görsel/Renk Kusurları:"})," ",e.jsx("span",{style:{color:"#742a2a"},children:i.rejection_visual})]})]})]}),(()=>{const n=Array.isArray(i.visual_comparisons)?i.visual_comparisons.filter(o=>o.correct_image||o.wrong_image):[],l=[];(i.compare_caramelization_correct||i.compare_caramelization_incorrect)&&l.push({title:"Karamelizasyon Standardı",description:i.compare_caramelization_desc||"",correct_image:i.compare_caramelization_correct||"",wrong_image:i.compare_caramelization_incorrect||""}),(i.compare_cutting_correct||i.compare_cutting_incorrect)&&l.push({title:"Tat - Koku Standardı",description:i.compare_cutting_desc||"",correct_image:i.compare_cutting_correct||"",wrong_image:i.compare_cutting_incorrect||""});const d=[...n,...l];return d.length===0?null:d.map((o,b)=>e.jsxs("div",{className:"mr-comp-premium-card mr-step-premium-card",children:[e.jsx("div",{className:"mr-sketch-line mr-sketch-line-top"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-bottom"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-left"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-right"}),o.correct_image&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle-left"}),o.wrong_image&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle-right"}),e.jsxs("div",{className:"mr-comp-premium-grid",style:{display:"grid",gridTemplateColumns:`${o.correct_image?"calc(5cm * 4 / 3)":"0px"} 1fr ${o.wrong_image?"calc(5cm * 4 / 3)":"0px"}`,alignItems:"stretch"},children:[o.correct_image?e.jsxs("div",{className:"mr-comp-premium-img-box correct",children:[e.jsx("span",{style:{position:"absolute",top:8,left:8,background:"#10b981",color:"#fff",fontSize:".65rem",fontWeight:800,padding:"3px 8px",borderRadius:12,zIndex:1},children:"✓ DOĞRU"}),e.jsx("img",{src:_(o.correct_image),alt:"Correct"})]}):e.jsx("div",{}),e.jsxs("div",{className:"mr-comp-premium-content-box",children:[o.title&&e.jsxs("h3",{className:"mr-comp-premium-title",style:{color:z},children:[e.jsx("i",{className:"fa-solid fa-images",style:{fontSize:"0.85rem"}}),o.title]}),o.description&&e.jsx("div",{className:"mr-comp-premium-desc",children:q(o.description)})]}),o.wrong_image?e.jsxs("div",{className:"mr-comp-premium-img-box wrong",children:[e.jsx("span",{style:{position:"absolute",top:8,left:8,background:"#ef4444",color:"#fff",fontSize:".65rem",fontWeight:800,padding:"3px 8px",borderRadius:12,zIndex:1},children:"✗ YANLIŞ"}),e.jsx("img",{src:_(o.wrong_image),alt:"Incorrect"})]}):e.jsx("div",{})]})]},b))})()]})}if(c){const i=a.metadata||{},n=Array.isArray(i.visual_comparisons)?i.visual_comparisons.filter(l=>l.correct_image||l.wrong_image):[];return n.length===0?null:e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:24,marginTop:16},children:e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[e.jsxs("div",{className:"mr-section-head",style:{marginBottom:4},children:[e.jsx("div",{className:"mr-section-bar",style:{background:z}}),e.jsx("span",{className:"mr-section-label",children:"Görsel Karşılaştırma Rehberleri"})]}),n.map((l,d)=>e.jsxs("div",{className:"mr-comp-premium-card mr-step-premium-card",children:[e.jsx("div",{className:"mr-sketch-line mr-sketch-line-top"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-bottom"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-left"}),e.jsx("div",{className:"mr-sketch-line mr-sketch-line-right"}),l.correct_image&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle-left"}),l.wrong_image&&e.jsx("div",{className:"mr-sketch-line mr-sketch-line-middle-right"}),e.jsxs("div",{className:"mr-comp-premium-grid",style:{display:"grid",gridTemplateColumns:`${l.correct_image?"calc(5cm * 4 / 3)":"0px"} 1fr ${l.wrong_image?"calc(5cm * 4 / 3)":"0px"}`,alignItems:"stretch"},children:[l.correct_image?e.jsxs("div",{className:"mr-comp-premium-img-box correct",children:[e.jsx("span",{style:{position:"absolute",top:8,left:8,background:"#10b981",color:"#fff",fontSize:".65rem",fontWeight:800,padding:"3px 8px",borderRadius:12,zIndex:1},children:"✓ DOĞRU"}),e.jsx("img",{src:_(l.correct_image),alt:"Correct"})]}):e.jsx("div",{}),e.jsxs("div",{className:"mr-comp-premium-content-box",children:[l.title&&e.jsxs("h3",{className:"mr-comp-premium-title",style:{color:z},children:[e.jsx("i",{className:"fa-solid fa-images",style:{fontSize:"0.85rem"}}),l.title]}),l.description&&e.jsx("div",{className:"mr-comp-premium-desc",children:q(l.description)})]}),l.wrong_image?e.jsxs("div",{className:"mr-comp-premium-img-box wrong",children:[e.jsx("span",{style:{position:"absolute",top:8,left:8,background:"#ef4444",color:"#fff",fontSize:".65rem",fontWeight:800,padding:"3px 8px",borderRadius:12,zIndex:1},children:"✗ YANLIŞ"}),e.jsx("img",{src:_(l.wrong_image),alt:"Incorrect"})]}):e.jsx("div",{})]})]},d))]})})}return a.content?e.jsx("div",{className:"mr-content",dangerouslySetInnerHTML:{__html:a.content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/^# (.*)$/gm,"<h1>$1</h1>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>").replace(/^- (.*)$/gm,'<li style="list-style-type:disc">$1</li>').replace(/^\d+\.\s(.*)$/gm,'<li style="list-style-type:decimal">$1</li>').replace(/\n/g,"<br />")}}):null})(),e.jsxs("div",{className:"mr-page-nav",children:[ce?e.jsxs("button",{className:"mr-page-nav-btn",onClick:()=>S(ce.id),children:[e.jsxs("span",{className:"mr-nav-dir",children:[e.jsx("i",{className:"fa-solid fa-arrow-left",style:{fontSize:".55rem"}})," Önceki"]}),e.jsx("span",{className:"mr-nav-title",children:ce.title})]}):e.jsx("div",{className:"mr-page-nav-placeholder"}),de?e.jsxs("button",{className:"mr-page-nav-btn next",onClick:()=>S(de.id),children:[e.jsxs("span",{className:"mr-nav-dir",children:["Sonraki ",e.jsx("i",{className:"fa-solid fa-arrow-right",style:{fontSize:".55rem"}})]}),e.jsx("span",{className:"mr-nav-title",children:de.title})]}):e.jsx("div",{className:"mr-page-nav-placeholder"})]}),e.jsxs("div",{className:"mr-print-footer",children:[L," — ",a.title," — v",a.version," — ",new Date(a.updated_at).toLocaleDateString("tr-TR")]})]},Kr):e.jsxs("div",{className:"mr-academy-hero mr-page-animate",children:[e.jsx("div",{className:"mr-orb mr-orb-1"}),e.jsx("div",{className:"mr-orb mr-orb-2"}),e.jsx("div",{className:"mr-orb mr-orb-3"}),e.jsx("div",{className:"mr-orb mr-orb-4"}),[...Array(12)].map((r,t)=>e.jsx("div",{className:"mr-particle",style:{left:`${8+t*7.5}%`,bottom:`${10+t%4*15}%`,animationDuration:`${4+t%5}s`,animationDelay:`${t*.4}s`,width:t%3===0?"6px":"3px",height:t%3===0?"6px":"3px",opacity:.4+t%3*.15}},t)),e.jsxs("div",{className:"mr-academy-hero-content",children:[e.jsxs("div",{className:"mr-academy-badge",children:[e.jsx("i",{className:"fa-solid fa-graduation-cap"}),"Eğitim Platformu"]}),e.jsx("h1",{className:"mr-academy-title",children:"Operasyon El Kitabı"}),e.jsxs("p",{className:"mr-academy-subtitle",children:["Prosedürleri, ürün kılavuzlarını ve standartları tek yerden öğrenin.",e.jsx("br",{}),"Her şey hazır — sadece keşfetmeniz yeterli."]}),e.jsxs("div",{className:"mr-academy-search-wrap",children:[e.jsx("i",{className:"fa-solid fa-magnifying-glass mr-academy-search-icon"}),e.jsx("input",{ref:U,placeholder:"Sayfa, ürün veya hammadde ara...",value:R,onChange:r=>O(r.target.value),onFocus:()=>{E(!0)}}),e.jsx("span",{className:"mr-academy-search-kbd",children:"Ctrl+K"})]}),e.jsxs("div",{className:"mr-academy-stats",children:[e.jsxs("div",{className:"mr-academy-stat",children:[e.jsx("div",{className:"mr-academy-stat-num",children:f.length}),e.jsx("div",{className:"mr-academy-stat-label",children:"Kategori"})]}),e.jsxs("div",{className:"mr-academy-stat",children:[e.jsx("div",{className:"mr-academy-stat-num",children:h.length}),e.jsx("div",{className:"mr-academy-stat-label",children:"Kılavuz"})]}),e.jsxs("div",{className:"mr-academy-stat",children:[e.jsx("div",{className:"mr-academy-stat-num",children:h.reduce((r,t)=>{var c,m;return r+(((m=(c=t.metadata)==null?void 0:c.steps)==null?void 0:m.length)||0)},0)}),e.jsx("div",{className:"mr-academy-stat-label",children:"Adım"})]}),e.jsxs("div",{className:"mr-academy-stat",children:[e.jsx("div",{className:"mr-academy-stat-num",children:h.filter(r=>r.linked_item_id).length}),e.jsx("div",{className:"mr-academy-stat-label",children:"Ürün"})]})]}),f.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"mr-academy-cats-title",children:"Kategoriler"}),e.jsx("div",{className:"mr-academy-cats",children:f.map((r,t)=>{const c=$(r.name),m=A(r.name),i=h.filter(n=>n.category_id===r.id);return e.jsxs("div",{className:"mr-academy-cat-card",style:{"--cat-color":c,animationDelay:`${t*.07}s`},onClick:()=>{u(l=>({...l,[r.id]:!0}));const n=i[0];n&&S(n.id)},children:[e.jsx("div",{className:"mr-academy-cat-icon",children:e.jsx("i",{className:`fa-solid ${m}`})}),e.jsx("div",{className:"mr-academy-cat-name",children:r.name}),e.jsxs("div",{className:"mr-academy-cat-count",children:[i.length," kılavuz"]})]},r.id)})})]})]}),Ee.length>0&&e.jsxs("div",{className:"mr-academy-recent",children:[e.jsxs("div",{className:"mr-academy-section-title",children:[e.jsx("i",{className:"fa-solid fa-clock-rotate-left",style:{color:"#f59e0b",fontSize:"0.9rem"}}),"Son Güncellenen Kılavuzlar"]}),e.jsx("div",{className:"mr-academy-recent-grid",children:Ee.map((r,t)=>{var i;const c=((i=f.find(n=>n.id===r.category_id))==null?void 0:i.name)||"",m=$(c);return e.jsxs("div",{className:"mr-academy-recent-card",style:{animationDelay:`${t*.06}s`},onClick:()=>S(r.id),children:[e.jsx("div",{className:"mr-academy-recent-card-title",children:r.title}),e.jsxs("div",{className:"mr-academy-recent-card-meta",children:[e.jsx("span",{className:"mr-academy-recent-card-cat",style:{background:`${m}22`,color:m},children:c}),e.jsxs("span",{children:["v",r.version||1]}),e.jsx("span",{children:"·"}),e.jsx("span",{children:new Date(r.updated_at||r.created_at).toLocaleDateString("tr-TR")})]})]},r.id)})})]})]})}),Wr&&ke&&e.jsx("div",{className:"modal-bg open",onClick:me,children:e.jsxs("div",{className:"modal-box",onClick:r=>r.stopPropagation(),children:[e.jsx("div",{className:"modal-head",children:e.jsxs("h3",{className:"text-primary",style:{margin:0,fontSize:"1.05rem",fontWeight:800},children:[ke.name," — Arıza Bildirimi"]})}),e.jsxs("form",{onSubmit:Jr,children:[e.jsxs("div",{className:"modal-body",style:{display:"flex",flexDirection:"column",gap:16},children:[e.jsxs("div",{style:{background:"var(--warning-bg)",color:"var(--warning)",borderRadius:10,padding:12,fontSize:".78rem",display:"flex",gap:8},children:[e.jsx("i",{className:"fa-solid fa-circle-exclamation",style:{marginTop:2}}),e.jsx("span",{children:"Şubenizde kayıtlı fiziksel cihazı seçip arıza detaylarını girin."})]}),e.jsxs("div",{children:[e.jsx("label",{className:"f-label",children:"Cihaz Seçimi"}),se.length===0?e.jsx("div",{style:{background:"var(--danger-bg)",color:"var(--danger)",padding:10,borderRadius:8,fontSize:".78rem"},children:"Bu şube için kayıtlı ekipman bulunamadı."}):e.jsx(oa,{value:ne,onChange:Ne,options:se.map(r=>({value:r.id,label:r.name})),placeholder:"Cihaz seçin...",searchPlaceholder:"Cihaz ara...",noResultsLabel:"Eşleşen cihaz bulunamadı",allowClear:!0})]}),e.jsxs("div",{children:[e.jsx("label",{className:"f-label",children:"Arıza Açıklaması"}),e.jsx("textarea",{className:"f-input",rows:4,placeholder:"Lütfen arızayı detaylı açıklayın...",value:G,onChange:r=>_e(r.target.value)})]})]}),e.jsxs("div",{className:"modal-foot",children:[e.jsx("button",{type:"button",className:"btn-o",onClick:me,children:"Vazgeç"}),e.jsx("button",{type:"submit",className:"btn-p",disabled:ze||se.length===0,children:ze?e.jsxs(e.Fragment,{children:[e.jsx("i",{className:"fa-solid fa-spinner fa-spin"})," Gönderiliyor..."]}):e.jsxs(e.Fragment,{children:[e.jsx("i",{className:"fa-solid fa-check"})," Bildirimi Kaydet"]})})]})]})]})}),V&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"mr-link-drawer-overlay",onClick:D}),e.jsxs("div",{className:"mr-link-drawer",children:[e.jsxs("div",{className:"mr-link-drawer-header",children:[e.jsxs("button",{className:"mr-link-drawer-back",onClick:D,children:[e.jsx("i",{className:"fa-solid fa-arrow-left"}),"Geri"]}),e.jsx("span",{className:"mr-link-drawer-title",children:(N==null?void 0:N.title)||"Detay"}),e.jsx("button",{className:"mr-link-drawer-close",onClick:D,title:"Kapat",children:e.jsx("i",{className:"fa-solid fa-xmark"})})]}),e.jsx("div",{className:"mr-link-drawer-body",children:Ur?e.jsxs("div",{className:"mr-drawer-loading",children:[e.jsx("i",{className:"fa-solid fa-circle-notch fa-spin",style:{fontSize:"1.8rem",color:"#6366f1"}}),e.jsx("span",{children:"Yükleniyor..."})]}):N?(()=>{var i,n,l,d;const r=f.find(o=>o.id===N.category_id),t=$((r==null?void 0:r.name)||""),c=A((r==null?void 0:r.name)||""),m=[];for(let o=1;o<=6;o++){const b=(i=N.metadata)==null?void 0:i[`spec_${o}_label`],j=(n=N.metadata)==null?void 0:n[`spec_${o}_val`];j&&m.push({label:b||`Özellik ${o}`,val:j})}return e.jsxs(e.Fragment,{children:[(l=N.metadata)!=null&&l.product_image?e.jsx("img",{className:"mr-drawer-hero-img",src:_(N.metadata.product_image),alt:N.title}):e.jsx("div",{className:"mr-drawer-no-img",children:e.jsx("i",{className:`fa-solid ${c}`})}),r&&e.jsxs("div",{className:"mr-drawer-cat-band",style:{background:`${t}12`},children:[e.jsx("div",{className:"mr-drawer-cat-icon",style:{background:`${t}20`,color:t},children:e.jsx("i",{className:`fa-solid ${c}`})}),e.jsxs("div",{className:"mr-drawer-cat-text",style:{color:t},children:[e.jsx("div",{className:"mr-drawer-cat-label",children:"Kategori"}),e.jsx("div",{className:"mr-drawer-cat-name",children:r.name})]})]}),e.jsxs("div",{className:"mr-drawer-content",children:[((d=N.metadata)==null?void 0:d.description)&&e.jsx("div",{className:"mr-drawer-desc",children:q(N.metadata.description)}),m.length>0&&e.jsxs("div",{children:[e.jsx("div",{className:"mr-drawer-ingredients-title",children:"Özellikler"}),e.jsx("div",{className:"mr-drawer-specs-grid",children:m.map((o,b)=>{const j=ue(o.label);return e.jsxs("div",{className:"mr-drawer-spec-card",children:[e.jsxs("div",{className:"mr-drawer-spec-label",style:{color:j.valColor},children:[e.jsx("i",{className:`fa-solid ${j.icon.split(" ")[0]}`,style:{color:j.valColor}}),o.label]}),e.jsx("div",{className:"mr-drawer-spec-val",style:{color:j.valColor},children:o.val})]},b)})})]}),Ce.length>0&&e.jsxs("div",{children:[e.jsxs("div",{className:"mr-drawer-ingredients-title",children:[e.jsx("i",{className:"fa-solid fa-list-ul",style:{marginRight:4,color:t}}),"Bileşenler"]}),Ce.map((o,b)=>e.jsxs("div",{className:"mr-drawer-ingredient-row",children:[e.jsx("span",{className:"mr-drawer-ingredient-name",children:o.name}),e.jsxs("span",{className:"mr-drawer-ingredient-qty",children:[parseFloat(o.qty||0)," ",o.unit]})]},b))]}),e.jsxs("button",{className:"mr-drawer-cta",onClick:()=>{D(),S(V)},children:[e.jsx("i",{className:"fa-solid fa-book-open"}),"Tam Sayfada Aç"]})]})]})})():e.jsxs("div",{style:{textAlign:"center",color:"#94a3b8",paddingTop:48,fontSize:"0.85rem"},children:[e.jsx("i",{className:"fa-solid fa-circle-exclamation",style:{fontSize:"2.5rem",display:"block",marginBottom:12,color:"#e2e8f0"}}),"Sayfa bulunamadı"]})})]})]}),e.jsx("svg",{style:{position:"absolute",width:0,height:0},"aria-hidden":"true",focusable:"false",children:e.jsxs("filter",{id:"hand-drawn-filter",x:"-10%",y:"-10%",width:"120%",height:"120%",children:[e.jsx("feTurbulence",{type:"fractalNoise",baseFrequency:"0.04",numOctaves:"3",result:"noise"}),e.jsx("feDisplacementMap",{in:"SourceGraphic",in2:"noise",scale:"3",xChannelSelector:"R",yChannelSelector:"G"})]})})]})}export{fa as default};
