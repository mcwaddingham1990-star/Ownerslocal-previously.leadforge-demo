import React, { useEffect, useMemo, useRef, useState } from "react";
import "./selfiesave-editor.css";
// Vite resolves these to hashed asset URLs at build time, keeping the PDF.js
// worker version locked to whatever `pdfjs-dist` is installed -- no risk of
// a stale/mismatched worker file drifting out of sync with the library.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { GeneratedPdfDraft } from "../types/generatedPdf";
import { base64ToBytes, bytesToBase64, buildFreeformDocumentPdf, appendSignatureCertificate, mergePdfs, type BusinessProfile } from "../lib/pdfExport";
import { buildRemoteSigningLink } from "../lib/remoteSigningClient";
import SignaturePad from "./SignaturePad";
import SendChoiceModal from "./SendChoiceModal";

type FieldKind = "signature" | "initials";
type SignField = { id:number; party:number; line:number; kind:FieldKind; signed:boolean; committed:boolean; role?:string; name?:string; image?:string; signatureImage?:string; stamp?:string; centralStamp?:string; coords?:string };
type CanvasObject = { id:number; kind:"text"|"image"|"link"|"video"; page:number; x:number; y:number; w:number; h:number; value:string; scale?:number; source?:"pdf"; fontSize?:number; fontFamily?:string; backgroundColor?:string };
type Placement = { page?:number; x:number; y:number; w?:number; h?:number };
type Features = { signatures:boolean; initials:boolean; selfies:boolean; photoId:boolean; location:boolean; displayLocation:boolean; timestamps:boolean; draftingDate:boolean };
type ImportedPdfText = { value:string; left:number; top:number; width:number; height:number; fontSize:number; fontFamily?:string; backgroundColor?:string };
type ImportedPdfPage = { image:string; width:number; height:number; text:ImportedPdfText[] };

const Icon=({children}:{children:React.ReactNode})=><span aria-hidden="true" className="icon">{children}</span>;
// Selfie capture is a real evidence *option*, never a default requirement --
// an owner opts into it per-document from the Evidence options screen; the
// signature/initials fields themselves are also only added when someone
// clicks "Capture Signatures," never seeded automatically on open.
const defaultFeatures:Features={signatures:true,initials:true,selfies:false,photoId:false,location:false,displayLocation:false,timestamps:true,draftingDate:true};

function samplePdfBackground(context:CanvasRenderingContext2D,left:number,top:number,width:number,height:number){
  const canvas=context.canvas;
  const x0=Math.max(0,Math.floor(left-3)),y0=Math.max(0,Math.floor(top-3));
  const x1=Math.min(canvas.width-1,Math.ceil(left+width+3)),y1=Math.min(canvas.height-1,Math.ceil(top+height+3));
  const samples:number[][]=[];
  const take=(x:number,y:number)=>{
    const pixel=context.getImageData(Math.max(0,Math.min(canvas.width-1,Math.round(x))),Math.max(0,Math.min(canvas.height-1,Math.round(y))),1,1).data;
    if(pixel[3]>220)samples.push([pixel[0],pixel[1],pixel[2]]);
  };
  const steps=Math.max(8,Math.min(28,Math.ceil((x1-x0+y1-y0)/8)));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    take(x0+(x1-x0)*t,y0);take(x0+(x1-x0)*t,y1);
    take(x0,y0+(y1-y0)*t);take(x1,y0+(y1-y0)*t);
  }
  if(!samples.length)return "rgb(255 255 255)";
  const median=(channel:number)=>samples.map(sample=>sample[channel]).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
  return `rgb(${median(0)} ${median(1)} ${median(2)})`;
}

export interface SelfieSaveEditorProps {
  accountEmail: string;
  accountName?: string;
  documentId: string | null;
  initialFilename?: string;
  initialPdfBase64?: string;
  // When true, immediately opens the native file picker on mount -- this is
  // what makes the Documents Hub's "Open PDF" / "Edit PDF" buttons go
  // straight from click to file picker to loaded document, no extra UI.
  autoOpenPdfPicker?: boolean;
  initialDraft?: GeneratedPdfDraft | null;
  // Real names to pre-fill onto the two default signer roles when "Capture
  // Signatures" is clicked -- e.g. the customer and the company rep on an
  // estimate/invoice. Optional: with no hint the fields are just labeled
  // "Signer 1" / "Signer 2".
  signerHint?: { customerName?: string; representativeName?: string } | null;
  // Real customer contact info, when known -- powers the "Send" button and
  // the "send remotely" signing link, both of which need somewhere to go.
  customerPhone?: string;
  customerEmail?: string;
  businessProfile?: BusinessProfile;
  // When true, seeds the standard 2-party signature + initials lines as
  // soon as the source PDF finishes loading -- the same fields "Capture
  // Signatures" adds manually -- so a "Collect Signatures" action from
  // another page lands the user straight on a ready-to-sign document.
  autoCaptureSignatures?: boolean;
  onClose: () => void;
  onSave: (docId: string, updatedName: string, metaProperties?: any) => void;
}

export default function SelfieSaveEditor({accountEmail,accountName,documentId,initialFilename,initialPdfBase64,autoOpenPdfPicker,initialDraft,signerHint,customerPhone,customerEmail,businessProfile,autoCaptureSignatures,onClose,onSave}:SelfieSaveEditorProps){
  const [splash,setSplash]=useState(true);
  const [setup,setSetup]=useState(!autoOpenPdfPicker && !initialPdfBase64 && !initialDraft);
  const [features,setFeatures]=useState(defaultFeatures);
  // Raw bytes of whatever real PDF is currently loaded (freshly generated by
  // the app, or opened from a file) -- kept as-is so "Export PDF" hands back
  // the real document instead of a lossy re-render of the on-screen canvas.
  const [sourcePdfBytes,setSourcePdfBytes]=useState<Uint8Array|null>(null);
  const [exporting,setExporting]=useState(false);
  const [filename,setFilename]=useState(initialFilename||"Untitled document");
  const [header,setHeader]=useState("");
  const [footer,setFooter]=useState("");
  const [clauses,setClauses]=useState<string[]>([]);
  const [fields,setFields]=useState<SignField[]>([]);
  const [objects,setObjects]=useState<CanvasObject[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [placements,setPlacements]=useState<Record<string,Placement>>({});
  const [menu,setMenu]=useState<{page:number;x:number;y:number}|null>(null);
  const [pendingField,setPendingField]=useState<{kind:FieldKind;page:number;x:number;y:number}|null>(null);
  const [pendingParty,setPendingParty]=useState("1");
  const [pageCount,setPageCount]=useState(1);
  const [active,setActive]=useState<number|null>(null);
  const [signerName,setSignerName]=useState("");
  const [consent,setConsent]=useState(false);
  const [cameraError,setCameraError]=useState("");
  const [finalLocked,setFinalLocked]=useState(false);
  const [toast,setToast]=useState("");
  // "Save & Prepare for Signing" chooser (in-person stylus / in-person typed
  // / send a remote link), and which method the active in-person signing
  // modal below should offer -- typed name (existing default) or a drawn
  // signature via SignaturePad.
  const [signSetup,setSignSetup]=useState(false);
  const [signMethod,setSignMethod]=useState<"typed"|"drawn">("typed");
  const [drawnSignature,setDrawnSignature]=useState("");
  const [savingCompleted,setSavingCompleted]=useState(false);
  const [preparingRemote,setPreparingRemote]=useState(false);
  const [sendOpen,setSendOpen]=useState(false);
  const [sendBody,setSendBody]=useState("");
  const [pdfPages,setPdfPages]=useState<ImportedPdfPage[]>([]);
  const [loadingPdf,setLoadingPdf]=useState(false);
  // Drag/resize math already reads the page's post-transform size via
  // getBoundingClientRect() vs its offsetWidth to derive a scale factor, so
  // placing/moving/resizing items keeps working correctly at any zoom level.
  const [zoom,setZoom]=useState(1);
  const zoomIn=()=>setZoom(z=>Math.min(2.5,Math.round((z+0.1)*100)/100));
  const zoomOut=()=>setZoom(z=>Math.max(0.4,Math.round((z-0.1)*100)/100));
  const zoomReset=()=>setZoom(1);
  const [pdfSelection,setPdfSelection]=useState<{page:number;item:ImportedPdfText;value:string;left:number;top:number;boxLeft:number;boxTop:number;boxWidth:number;boxHeight:number}|null>(null);
  const pdfInputRef=useRef<HTMLInputElement>(null);
  const textInputRef=useRef<HTMLInputElement>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const paperRef=useRef<HTMLElement>(null);
  const editorRef=useRef<HTMLElement>(null);
  const lastScrollTopRef=useRef(0);
  const nextIdRef=useRef(Date.now());
  const textDraftRef=useRef(new Map<number,{value:string;w:number;h:number}>());
  const initialDraftLoadedRef=useRef(false);
  const initialPdfLoadedRef=useRef(false);
  const autoCaptureTriggeredRef=useRef(false);
  const dragRef=useRef<{key:string;pointerId:number;offsetX:number;offsetY:number;w:number;h:number;start:{clientX:number;clientY:number;x:number;y:number;page:number}}|null>(null);
  const resizeRef=useRef<{key:string;pointerId:number;edge:string;startX:number;startY:number;x:number;y:number;w:number;h:number;scale:number}|null>(null);

  useEffect(()=>{const t=setTimeout(()=>setSplash(false),1400);return()=>clearTimeout(t)},[]);
  useEffect(()=>{
    if(!initialDraft||initialDraftLoadedRef.current)return;
    initialDraftLoadedRef.current=true;
    const base=Date.now();
    // Body text only -- no signature/initials fields are pre-seeded. Fields
    // are only added when the user clicks "Capture Signatures," so viewing
    // or exporting this document never requires anyone to sign first.
    const body=[initialDraft.title,"",...initialDraft.lines].join("\n");
    setFilename(initialDraft.filename.replace(/\.pdf$/i,""));
    setObjects([{id:base,kind:"text",page:1,x:70,y:105,w:680,h:430,value:body,scale:1,fontSize:12,fontFamily:"Arial, Helvetica, sans-serif"}]);
    setSetup(false);setSplash(false);setPageCount(1);
  },[initialDraft]);
  useEffect(()=>{
    if(!initialPdfBase64||initialPdfLoadedRef.current)return;
    initialPdfLoadedRef.current=true;
    try{
      const bytes=base64ToBytes(initialPdfBase64);
      setSourcePdfBytes(bytes);
      const file=new File([bytes],`${initialFilename||"document"}.pdf`,{type:"application/pdf"});
      setSplash(false);
      void loadPdf(file,true);
    }catch{
      notify("Saved PDF could not be reopened. Choose the original file from Device / Drive.");
    }
  },[initialPdfBase64,initialFilename]);
  useEffect(()=>{
    if(!autoCaptureSignatures||autoCaptureTriggeredRef.current||pdfPages.length===0)return;
    autoCaptureTriggeredRef.current=true;
    captureSignatures();
  },[autoCaptureSignatures,pdfPages]);
  useEffect(()=>()=>streamRef.current?.getTracks().forEach(t=>t.stop()),[]);
  useEffect(()=>{
    const updatePdfSelection=()=>{
      const selection=window.getSelection();
      if(!selection||selection.isCollapsed||!selection.rangeCount){setPdfSelection(null);return}
      const range=selection.getRangeAt(0);
      const ancestor=range.commonAncestorContainer;
      const node=ancestor.nodeType===Node.TEXT_NODE?ancestor.parentElement:ancestor as HTMLElement;
      const target=node?.closest<HTMLElement>(".pdf-text-content");
      if(!target){setPdfSelection(null);return}
      const page=Number(target.dataset.page),index=Number(target.dataset.index);
      const item=pdfPages[page-1]?.text[index];
      const value=selection.toString().trim();
      if(!item||!value)return;
      const paper=target.closest<HTMLElement>(".paper");
      if(!paper||!paper.offsetWidth||!paper.offsetHeight){setPdfSelection(null);return}
      const rect=range.getBoundingClientRect();
      // The PDF text run behind `target` can span far more than what's
      // actually highlighted (a whole sentence as one run is common) --
      // size the edit box to the real selection rect, not the whole run,
      // so replacing a couple of words doesn't blank out the rest of the line.
      const paperRect=paper.getBoundingClientRect();
      const boxLeft=(rect.left-paperRect.left)/paperRect.width*100;
      const boxTop=(rect.top-paperRect.top)/paperRect.height*100;
      const boxWidth=rect.width/paperRect.width*100;
      const boxHeight=rect.height/paperRect.height*100;
      setPdfSelection({page,item,value,left:Math.max(10,Math.min(window.innerWidth-150,rect.left)),top:Math.max(76,rect.top-46),boxLeft,boxTop,boxWidth,boxHeight});
    };
    document.addEventListener("selectionchange",updatePdfSelection);
    return()=>document.removeEventListener("selectionchange",updatePdfSelection);
  },[pdfPages]);
  useEffect(()=>{
    const scale=()=>{const p=paperRef.current;return p&&p.offsetWidth?p.getBoundingClientRect().width/p.offsetWidth:1};
    const move=(e:PointerEvent)=>{
      const r=resizeRef.current;
      if(r&&r.pointerId===e.pointerId){e.preventDefault();const s=scale()||1,dx=(e.clientX-r.startX)/s,dy=(e.clientY-r.startY)/s;let {x,y,w,h}=r;const minW=80,minH=38;if(r.edge.includes("e"))w=Math.max(minW,r.w+dx);if(r.edge.includes("s"))h=Math.max(minH,r.h+dy);if(r.edge.includes("w")){w=Math.max(minW,r.w-dx);x=r.x+(r.w-w)}if(r.edge.includes("n")){h=Math.max(minH,r.h-dy);y=r.y+(r.h-h)}if(r.key.startsWith("object:")){const id=Number(r.key.slice(7));setObjects(v=>v.map(o=>o.id===id?{...o,x,y,w,h,scale:o.kind==="text"?1:o.scale}:o))}else setPlacements(v=>({...v,[r.key]:{...v[r.key],x,y,w,h}}));return}
      const d=dragRef.current;if(!d||d.pointerId!==e.pointerId)return;
      e.preventDefault();
      const pages=Array.from(document.querySelectorAll<HTMLElement>(".document-pages .paper"));
      if(!pages.length)return;
      const destination=pages.reduce((best,page)=>{
        const rect=page.getBoundingClientRect();
        const distance=e.clientY<rect.top?rect.top-e.clientY:e.clientY>rect.bottom?e.clientY-rect.bottom:0;
        return distance<best.distance?{page,rect,distance}:best;
      },{page:pages[0],rect:pages[0].getBoundingClientRect(),distance:Number.POSITIVE_INFINITY});
      const page=pages.indexOf(destination.page)+1;
      const s=destination.rect.width/destination.page.offsetWidth||1;
      const maxX=Math.max(0,destination.page.offsetWidth-d.w);
      const maxY=Math.max(66,destination.page.offsetHeight-d.h-50);
      const staysOnStartPage=page===d.start.page;
      const next={
        page,
        x:Math.max(0,Math.min(maxX,staysOnStartPage?d.start.x+(e.clientX-d.start.clientX)/s:(e.clientX-destination.rect.left)/s-d.offsetX)),
        y:Math.max(66,Math.min(maxY,staysOnStartPage?d.start.y+(e.clientY-d.start.clientY)/s:(e.clientY-destination.rect.top)/s-d.offsetY))
      };
      if(d.key.startsWith("object:")){const id=Number(d.key.slice(7));setObjects(v=>v.map(o=>o.id===id?{...o,...next}:o))}else setPlacements(v=>({...v,[d.key]:{...v[d.key],...next}}))
    };
    const end=(e:PointerEvent)=>{if(dragRef.current?.pointerId===e.pointerId)dragRef.current=null;if(resizeRef.current?.pointerId===e.pointerId)resizeRef.current=null};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",end);window.addEventListener("pointercancel",end);return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end)}
  },[]);
  const contentLocked=fields.some(f=>f.committed)||finalLocked;
  const complete=fields.length>0&&fields.every(f=>f.committed);
  const draftDate=useMemo(()=>new Intl.DateTimeFormat("en-US",{dateStyle:"long"}).format(new Date()),[]);
  const notify=(m:string)=>{setToast(m);setTimeout(()=>setToast(""),2800)};
  // Native confirm() blocks the JS main thread until dismissed -- in some
  // embedded/automated contexts it never resolves, which reads as the whole
  // page freezing. Route confirmations through non-blocking in-app UI instead.
  const [confirmState,setConfirmState]=useState<{message:string}|null>(null);
  const confirmResolverRef=useRef<((value:boolean)=>void)|null>(null);
  const requestConfirm=(message:string)=>new Promise<boolean>(resolve=>{confirmResolverRef.current=resolve;setConfirmState({message})});
  const resolveConfirm=(value:boolean)=>{confirmResolverRef.current?.(value);confirmResolverRef.current=null;setConfirmState(null)};
  const selectedTextObject=selected?.startsWith("object:")?objects.find(o=>o.id===Number(selected.slice(7))&&o.kind==="text"):undefined;
  const selectedFontSize=Math.max(1,Math.min(30,Math.round(selectedTextObject?.fontSize||12)));
  const setSelectedFontSize=(fontSize:number)=>{
    if(!selectedTextObject||contentLocked)return;
    setObjects(current=>current.map(o=>o.id===selectedTextObject.id?{...o,fontSize}:o));
  };
  const updateFeature=(k:keyof Features)=>setFeatures(v=>({...v,[k]:!v[k]}));
  const targetPage=()=>menu?.page||1;
  const addClause=()=>{if(contentLocked)return;const index=clauses.length,page=targetPage();setClauses(v=>[...v,""]);setPlacements(v=>({...v,[`clause:${index}`]:{page,x:90,y:menu?.y||180,w:320,h:54}}));setMenu(null)};
  const newId=()=>++nextIdRef.current;
  const addField=(kind:FieldKind)=>{
    if(contentLocked)return;
    setPendingParty("1");
    setPendingField({kind,page:targetPage(),x:menu?.x||90,y:menu?.y||320});
    setMenu(null);
  };
  const confirmAddField=()=>{
    if(!pendingField||contentLocked)return;
    const {kind,page,x,y}=pendingField;
    const party=Number.parseInt(pendingParty.trim(),10);
    if(!Number.isInteger(party)||party<1){notify("Enter a signer number of 1 or higher");return}
    const id=newId();
    const existingBottom=fields.reduce((bottom,f)=>{
      const p=placements[`field:${f.id}`];
      return (p?.page||1)===page?Math.max(bottom,(p?.y??320)+(p?.h??110)):bottom;
    },200);
    const key=`field:${id}`;
    setFields(v=>{
      const line=Math.max(0,...v.filter(f=>f.kind===kind&&f.party===party).map(f=>f.line))+1;
      return [...v,{id,party,line,kind,signed:false,committed:false}];
    });
    setPlacements(v=>({...v,[key]:{page,x,y:Math.max(y,existingBottom+24),w:360,h:68}}));
    setSelected(key);
    setPendingField(null);
    notify(`${kind==="signature"?"Signature":"Initials"} line added for Signer ${party}`);
  };
  // "Capture Signatures" is an explicit, on-demand action -- it's the only
  // thing that ever adds signature/initials fields to a document. Nothing
  // requires signing just to view or export the PDF.
  const captureSignatures=()=>{
    if(contentLocked)return;
    if(fields.length>0){setSetup(true);notify("Add or complete signature lines below, or adjust evidence options");return}
    const page=pageCount;
    const id=newId();
    const customerLabel=signerHint?.customerName?`Customer — ${signerHint.customerName}`:"Signer 1";
    const repLabel=signerHint?.representativeName?`Company representative — ${signerHint.representativeName}`:"Signer 2";
    setFields([
      {id,party:1,line:1,kind:"signature",role:customerLabel,signed:false,committed:false},
      {id:id+1,party:1,line:2,kind:"initials",role:customerLabel,signed:false,committed:false},
      {id:id+2,party:2,line:1,kind:"signature",role:repLabel,signed:false,committed:false},
      {id:id+3,party:2,line:2,kind:"initials",role:repLabel,signed:false,committed:false}
    ]);
    nextIdRef.current=id+4;
    setPlacements(v=>({...v,
      [`field:${id}`]:{page,x:70,y:575,w:325,h:90},
      [`field:${id+1}`]:{page,x:70,y:690,w:325,h:90},
      [`field:${id+2}`]:{page,x:425,y:575,w:325,h:90},
      [`field:${id+3}`]:{page,x:425,y:690,w:325,h:90}
    }));
    setSetup(true);
    notify("Signature lines added — choose evidence options, then have each signer complete their fields");
  };
  const addObject=(kind:CanvasObject["kind"])=>{if(contentLocked)return;const base=kind==="text"?"Type here":kind==="image"?"Paste image URL":kind==="link"?"Paste link URL":"Paste video URL";setObjects(v=>[...v,{id:newId(),kind,page:targetPage(),x:menu?.x||90,y:menu?.y||180,w:kind==="text"?96:280,h:kind==="text"?40:160,value:base,scale:1}]);setMenu(null)};
  // Sizes the box to exactly fit whatever's currently typed -- shrinking as
  // well as growing, not just growing -- so a same-background PDF-edit box
  // never sits wider/taller than the text actually inside it and blanks out
  // neighboring content it has no reason to cover.
  const editTextObject=(id:number,element:HTMLElement,_inputType:string)=>{
    const object=objects.find(o=>o.id===id);if(!object)return;
    const value=element.textContent||"";
    const page=element.closest<HTMLElement>(".paper");
    const wrapper=element.closest<HTMLElement>(".canvas-object");
    const maxWidth=Math.max(96,(page?.offsetWidth||820)-object.x-16);
    const minWidth=object.source==="pdf"?24:96;
    const minHeight=object.source==="pdf"?16:40;
    const old={width:element.style.width,maxWidth:element.style.maxWidth,whiteSpace:element.style.whiteSpace,overflowWrap:element.style.overflowWrap,height:element.style.height};
    element.style.width="max-content";
    element.style.maxWidth="none";
    element.style.whiteSpace="pre";
    element.style.overflowWrap="normal";
    element.style.height="auto";
    const naturalWidth=Math.ceil(element.scrollWidth)+18;
    const w=Math.min(maxWidth,Math.max(minWidth,naturalWidth));
    element.style.width=`${Math.max(1,w-16)}px`;
    element.style.whiteSpace="pre-wrap";
    element.style.overflowWrap="break-word";
    const measuredHeight=Math.ceil(element.scrollHeight)+16;
    const h=Math.max(minHeight,measuredHeight);
    Object.assign(element.style,old);
    if(wrapper){wrapper.style.width=`${w}px`;wrapper.style.height=`${h}px`}
    textDraftRef.current.set(id,{value,w,h});
  };
  const commitTextObject=(id:number,element:HTMLElement)=>{
    const draft=textDraftRef.current.get(id)||{value:element.textContent||"",w:element.closest<HTMLElement>(".canvas-object")?.offsetWidth||80,h:element.closest<HTMLElement>(".canvas-object")?.offsetHeight||38};
    textDraftRef.current.delete(id);
    setObjects(v=>v.map(o=>o.id===id?{...o,...draft}:o));
  };
  const resetDocument=()=>{if(contentLocked){notify("Signed versions cannot be reset or edited");return}setHeader("");setFooter("");setClauses([]);setFields([]);setObjects([]);setPlacements({});setSelected(null);setPageCount(1);setPdfPages([]);setSourcePdfBytes(null);setFilename("Untitled document");setSetup(true)};
  async function loadPdf(file:File,fromInitial=false){
    if(contentLocked)return;
    const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
    if(!isPdf){notify("Choose a PDF file for Load PDF");return}
    if(!fromInitial&&(clauses.length||fields.length||objects.length||pdfPages.length)&&!(await requestConfirm("Open this PDF as a new document? Your current unsigned work will be replaced.")))return;
    setLoadingPdf(true);
    try{
      const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
      const data=new Uint8Array(await file.arrayBuffer());
      if(!fromInitial)setSourcePdfBytes(data);
      const doc=await pdfjs.getDocument({data}).promise;
      const pages:ImportedPdfPage[]=[];
      setSetup(false);
      notify(`Opening ${doc.numPages}-page PDF…`);
      for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
        const page=await doc.getPage(pageNumber);
        const baseViewport=page.getViewport({scale:1});
        const renderScale=Math.min(1.5,1400/Math.max(1,baseViewport.width));
        const viewport=page.getViewport({scale:renderScale});
        const textContent=await page.getTextContent();
        const text:ImportedPdfText[]=textContent.items.flatMap(raw=>{
          if(!("str" in raw)||!raw.str.trim()||!("transform" in raw))return [];
          const item=raw as {str:string;transform:number[];width:number;height:number;fontName?:string};
          const matrix=pdfjs.Util.transform(viewport.transform,item.transform);
          const fontHeight=Math.max(8,Math.hypot(matrix[2],matrix[3]));
          const sourceFontSize=Math.max(1,Math.min(30,Math.hypot(item.transform[2],item.transform[3])));
          const itemWidth=Math.max(4,item.width*renderScale);
          return [{
            value:item.str,
            left:matrix[4]/viewport.width*100,
            top:(matrix[5]-fontHeight)/viewport.height*100,
            width:itemWidth/viewport.width*100,
            height:fontHeight/viewport.height*100,
            fontSize:sourceFontSize,
            // Embedded PDF fonts rarely resolve to a real installed font by
            // name -- always fall back to a real font stack so edited text
            // renders (and measures for auto-sizing) using an actual font
            // instead of silently inheriting the page's default.
            fontFamily:(textContent.styles as Record<string,{fontFamily?:string}>)[item.fontName||""]?.fontFamily||"Arial, Helvetica, sans-serif"
          }];
        });
        const canvas=window.document.createElement("canvas");
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d");
        if(!context)throw new Error("Unable to prepare PDF page");
        await page.render({canvas,canvasContext:context,viewport}).promise;
        text.forEach(item=>{
          item.backgroundColor=samplePdfBackground(context,item.left/100*viewport.width,item.top/100*viewport.height,item.width/100*viewport.width,item.height/100*viewport.height);
        });
        pages.push({image:canvas.toDataURL("image/jpeg",.86),width:viewport.width,height:viewport.height,text});
        setPdfPages([...pages]);setPageCount(pages.length);
        page.cleanup();
      }
      setHeader("");setFooter("");setClauses([]);setFields([]);setObjects([]);setPlacements({});setSelected(null);setFinalLocked(false);
      setPdfPages(pages);setPageCount(pages.length);setFilename(file.name.replace(/\.pdf$/i,"")||"Imported document");setSetup(false);
      notify(`${pages.length}-page PDF opened — add or edit items before signing`);
      await doc.destroy();
    }catch(error){console.error(error);setPdfPages([]);setPageCount(1);notify("That PDF could not be opened. Try downloading it to your device first.")}
    finally{setLoadingPdf(false);if(pdfInputRef.current)pdfInputRef.current.value=""}
  }
  // box is the actual highlighted selection's own bounding rect (as % of the
  // page), not the full PDF text run's rect -- a run can span a whole
  // sentence, so sizing to the run instead of the selection would blank out
  // neighboring words the user never touched.
  const editImportedPdfText=(page:number,item:ImportedPdfText,value:string,box:{boxLeft:number;boxTop:number;boxWidth:number;boxHeight:number})=>{
    if(contentLocked)return;
    const paper=window.document.querySelectorAll<HTMLElement>(".document-pages .paper")[page-1];
    if(!paper)return;
    const id=newId();
    const x=paper.offsetWidth*box.boxLeft/100;
    const y=paper.offsetHeight*box.boxTop/100;
    const w=Math.max(12,paper.offsetWidth*box.boxWidth/100+4);
    const h=Math.max(12,paper.offsetHeight*box.boxHeight/100+4);
    const fontSize=Math.max(1,Math.min(30,item.fontSize));
    setObjects(current=>[...current,{id,kind:"text",page,x,y,w,h,value,scale:1,source:"pdf",fontSize,fontFamily:item.fontFamily,backgroundColor:item.backgroundColor||"rgb(255 255 255)"}]);
    setSelected(`object:${id}`);
    setPdfSelection(null);
    requestAnimationFrame(()=>{
      const editable=window.document.querySelector<HTMLElement>(`[data-object-id="${id}"] .editable-object-content`);
      editable?.focus();
      if(editable){const range=window.document.createRange();range.selectNodeContents(editable);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range)}
    });
    notify("Edit the selected PDF text");
  };
  const openPdfPicker=()=>{
    const input=pdfInputRef.current;
    if(!input||contentLocked||loadingPdf)return;
    input.value="";
    if(typeof input.showPicker==="function")input.showPicker();
    else input.click();
  };
  // Docs Hub's "Open PDF" / "Edit PDF" buttons mount this editor with
  // autoOpenPdfPicker set, so the native file picker opens immediately --
  // no intermediate screen to click through first.
  useEffect(()=>{
    if(!autoOpenPdfPicker)return;
    const t=setTimeout(()=>openPdfPicker(),splash?1450:50);
    return()=>clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[splash,autoOpenPdfPicker]);
  async function loadText(file:File){
    if(contentLocked)return;
    try{
      const value=await file.text();
      if(!value.trim()){notify("That text file is empty");return}
      const id=newId();
      const page=1;
      const lines=value.split(/\r?\n/);
      const longest=Math.max(1,...lines.map(line=>line.length));
      const w=Math.min(680,Math.max(160,longest*7.2+24));
      const wrappedLines=lines.reduce((total,line)=>total+Math.max(1,Math.ceil((line.length||1)/Math.max(18,Math.floor((w-24)/7.2)))),0);
      const h=Math.max(40,wrappedLines*20+20);
      setObjects(current=>[...current,{id,kind:"text",page,x:70,y:110,w,h,value,scale:1}]);
      setPageCount(count=>Math.max(count,page));
      setSelected(`object:${id}`);
      setFilename(current=>current==="Untitled document"?(file.name.replace(/\.(txt|text|md|csv)$/i,"")||current):current);
      setSetup(false);
      notify("Text loaded — tap it to edit");
    }catch(error){console.error(error);notify("That text file could not be opened")}
    finally{if(textInputRef.current)textInputRef.current.value=""}
  }
  const growPages=(e:React.UIEvent<HTMLElement>)=>{const el=e.currentTarget,goingDown=el.scrollTop>lastScrollTopRef.current;lastScrollTopRef.current=el.scrollTop;if(goingDown&&el.scrollHeight-el.scrollTop-el.clientHeight<180)setPageCount(v=>v+1)};
  // menu.x/y become the new object's placement coordinates (in the page's
  // unscaled layout space), so the click position has to be divided back out
  // of the current zoom factor -- getBoundingClientRect() reports the
  // post-transform (visually zoomed) box, offsetWidth/Height the real one.
  const openObjectMenu=(e:React.MouseEvent<HTMLElement>,page:number)=>{
    if(contentLocked)return;
    const el=e.currentTarget;
    const r=el.getBoundingClientRect();
    const s=el.offsetWidth?r.width/el.offsetWidth:1;
    const w=el.offsetWidth||r.width,h=el.offsetHeight||r.height;
    setMenu({page,x:Math.max(24,Math.min((e.clientX-r.left)/s,w-304)),y:Math.max(90,Math.min((e.clientY-r.top)/s,h-190))});
  };

  const makeRoomForSignedField=(id:number,hasSelfie:boolean)=>{
    const key=`field:${id}`;
    const current=placements[key]||{page:1,x:90,y:320,w:360,h:68};
    const oldHeight=current.h||68;
    const neededHeight=hasSelfie?154:116;
    if(neededHeight<=oldHeight)return;
    const delta=neededHeight-oldHeight;
    const sourcePage=current.page||1;
    const sourceBottom=current.y+oldHeight;
    const pageTop=76;
    const pageBottom=980;
    const fitWhole=(page:number,y:number,h:number)=>{
      let nextPage=page,nextY=y;
      if(nextY+h>pageBottom){nextPage+=1;nextY=pageTop}
      return {page:nextPage,y:nextY};
    };
    const sourceFit=fitWhole(sourcePage,current.y,neededHeight);
    const movedPlacements=Object.entries(placements).map(([itemKey,p]:[string,Placement])=>{
      if(itemKey===key)return [itemKey,p] as const;
      const itemPage=p.page||1;
      if(itemPage<sourcePage||(itemPage===sourcePage&&p.y<sourceBottom-2))return [itemKey,p] as const;
      return [itemKey,{...p,...fitWhole(itemPage,p.y+delta,p.h||54)}] as const;
    });
    const movedObjects=objects.map(o=>{
      if(o.page<sourcePage||(o.page===sourcePage&&o.y<sourceBottom-2))return o;
      return {...o,...fitWhole(o.page,o.y+delta,o.h)};
    });
    const highestPage=Math.max(sourceFit.page,...movedPlacements.map(([,p])=>p.page||1),...movedObjects.map(o=>o.page));
    setPlacements(previous=>{
      const next={...previous,[key]:{...current,...sourceFit,h:neededHeight}};
      movedPlacements.forEach(([itemKey,p])=>{if(itemKey!==key)next[itemKey]=p});
      return next;
    });
    setObjects(movedObjects);
    setPageCount(count=>Math.max(count,highestPage));
  };

  async function beginSign(id:number){if(finalLocked)return;const f=fields.find(x=>x.id===id);if(f?.committed)return;setActive(id);setSignerName(f?.name||"");setDrawnSignature(f?.signatureImage||"");setConsent(false);setCameraError("");if(!features.selfies)return;try{if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access is unavailable");const request=navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});const timeout=new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Camera request timed out")),12000));const s=await Promise.race([request,timeout]);streamRef.current=s;setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setCameraError("Front-camera permission is required for this document.")}}
  function saveMark(){if(!active||!signerName.trim()||!consent||(signMethod==="drawn"&&!drawnSignature))return;const fieldId=active;const video=videoRef.current;let image="";if(features.selfies&&video){const c=document.createElement("canvas");c.width=320;c.height=240;c.getContext("2d")?.drawImage(video,0,0,320,240);image=c.toDataURL("image/jpeg",.78)}const signatureImage=signMethod==="drawn"?drawnSignature:undefined;const now=new Date();const stamp=new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(now);const centralStamp=new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Chicago"}).format(now)+" Central Time";const save=(coords="")=>{makeRoomForSignedField(fieldId,!!image);setFields(v=>v.map(f=>f.id===fieldId?{...f,signed:true,name:signerName.trim(),image,signatureImage,stamp,centralStamp,coords}:f));streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setActive(null);setDrawnSignature("");notify("Signing field completed — review before committing")};if(features.location&&navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>save(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),()=>save("Location unavailable"));else save()}
  async function commitParty(party:number){const mine=fields.filter(f=>f.party===party);if(!mine.length||mine.some(f=>!f.signed))return;const warning="Save Signer "+party+"'s complete portion? This locks the agreement text and this signer's answers. The drafter cannot edit this signed copy afterward.";if(await requestConfirm(warning)){const updatedFields=fields.map(f=>f.party===party?{...f,committed:true}:f);setFields(updatedFields);notify(`Signer ${party} committed — document text is now locked`);
    // Committing locks the whole document (see contentLocked below) even
    // though the shared Documents list previously only learned about a
    // status change from exportPdf/finalize -- persist here too so the list
    // doesn't keep showing DRAFT once the editor itself is already locked.
    const allCommitted=updatedFields.length>0&&updatedFields.every(f=>f.committed);
    persist(allCommitted?"Signed":"Awaiting Signature",{keepEditorOpen:true});
  }}
  const persist=(status:"Draft"|"Signed"|"Awaiting Signature"|"Completed", extra:Record<string,unknown>={})=>{
    const docId=documentId||`doc_selfiesave_${Date.now()}`;
    const finalName=(filename.trim()||"Untitled document")+".pdf";
    onSave(docId,finalName,{
      status,
      objects,
      auditTrail:fields.filter(f=>f.signed).map(f=>({id:`field_${f.id}`,signerName:f.name,role:`party_${f.party}_${f.kind}`,action:f.committed?"committed":"signed",timestamp:f.stamp,centralTime:f.centralStamp,coords:f.coords,hasSelfie:!!f.image})),
      signingOptions:{features,header,footer,clauses,fields,placements,pageCount,hasImportedPdf:pdfPages.length>0},
      ...extra
    });
  };
  // Real PDF bytes for whatever's currently on screen. If a real source PDF
  // is loaded (freshly generated by the app, or opened from a file), that
  // real document is what gets exported -- any free-text boxes/clauses added
  // on top are appended as a real trailing addendum page rather than
  // guessed back onto the original's exact pixel coordinates, which is both
  // more robust and just as real a PDF. With no source PDF (a blank
  // from-scratch document) the whole thing is flowed straight to PDF.
  async function currentPdfBytes():Promise<Uint8Array>{
    const hasFreeformContent=header.trim()||footer.trim()||clauses.length>0||objects.some(o=>o.kind==="text"&&o.value.trim());
    if(sourcePdfBytes){
      if(!hasFreeformContent)return sourcePdfBytes;
      const addendum=await buildFreeformDocumentPdf({filename,header,bodyTexts:objects.filter(o=>o.kind==="text").map(o=>o.value),clauses,footer},business);
      return mergePdfs([sourcePdfBytes,addendum]);
    }
    return buildFreeformDocumentPdf({filename,header,bodyTexts:objects.filter(o=>o.kind==="text").map(o=>o.value),clauses,footer},business);
  }
  const business:BusinessProfile=businessProfile||{name:"",phone:"",address:"",email:"",logo:""};
  async function exportPdf(finalCertificate:boolean){
    setExporting(true);
    try{
      let bytes=await currentPdfBytes();
      const signedFields=fields.filter(f=>f.signed);
      if(finalCertificate&&signedFields.length){
        bytes=await appendSignatureCertificate(bytes,signedFields.map(f=>({name:f.name||"",role:f.role||`Signer ${f.party}`,kind:f.kind,timestamp:f.stamp||"",centralTimestamp:f.centralStamp,selfieDataUrl:f.image,coords:f.coords})),business);
      }
      const pdfBase64=bytesToBase64(bytes);
      const pdfName=(filename.trim()||"Untitled document").replace(/[\\/:*?\"<>|]+/g,"-");
      // Firestore caps a single document at ~1 MiB, and this PDF is stored
      // inline as a base64 field on the documents/{id} record. A signed PDF
      // with an embedded selfie or an imported source document can cross
      // that line -- without this check the write is silently rejected and
      // the "saved" signature is gone on the next reload with no warning.
      const tooLargeToSave=pdfBase64.length>900_000;
      if(!tooLargeToSave){
        persist(finalCertificate?"Signed":"Draft",{pdfBase64,actualSizeBytes:bytes.length,mimeType:"application/pdf"});
      }
      const blob=new Blob([bytes],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${pdfName}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify(tooLargeToSave
        ? "This PDF is too large to save in Documents (signed size limit ~900 KB). It was downloaded to your device instead — reduce embedded photos or split the document to save it in the app."
        : (finalCertificate?"Final signed PDF saved to Documents and downloaded":"PDF saved to Documents and downloaded"));
    }catch(error){
      console.error(error);
      notify("Could not build the PDF. Try again.");
    }finally{
      setExporting(false);
    }
  }
  async function finalize(){
    if(!complete)return;
    if(await requestConfirm("Create the final signed PDF record? This document can never be edited afterward.")){
      setSelected(null);
      setMenu(null);
      setFinalLocked(true);
      await exportPdf(true);
    }
  }
  // "Save Completed Document" -- marks this document done without requiring
  // any signature fields at all (an internal record, a finished doc that
  // never needed a customer signature to begin with). Distinct from
  // finalize() above, which requires every signature field committed.
  async function saveCompleted(){
    setSavingCompleted(true);
    try{
      const bytes=await currentPdfBytes();
      const pdfBase64=bytesToBase64(bytes);
      const tooLargeToSave=pdfBase64.length>900_000;
      persist("Completed",tooLargeToSave?{}:{pdfBase64,actualSizeBytes:bytes.length,mimeType:"application/pdf"});
      const pdfName=(filename.trim()||"Untitled document").replace(/[\\/:*?\"<>|]+/g,"-");
      const blob=new Blob([bytes],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${pdfName}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify(tooLargeToSave?"Marked complete — too large to save inline, so it was downloaded to your device instead.":"Document marked complete and saved to Documents");
    }catch(error){
      console.error(error);
      notify("Could not build the PDF. Try again.");
    }finally{
      setSavingCompleted(false);
    }
  }
  // "Save & Prepare for Signing" -- in-person branch. Adds the standard
  // signer fields (same ones "Capture Signatures" adds) if none exist yet,
  // sets which method the signing modal below offers, then persists the
  // Awaiting-Signature status right away so Documents reflects it even
  // before anyone actually signs.
  function prepareInPerson(method:"typed"|"drawn"){
    setSignMethod(method);
    setSignSetup(false);
    if(fields.length===0)captureSignatures();
    else setSetup(true);
    persist("Awaiting Signature",{keepEditorOpen:true});
  }
  // "Save & Prepare for Signing" -- remote branch. Builds the real PDF right
  // now (so the signer has something to review), generates a single-use
  // token, and persists it on the document's signingOptions so the
  // unauthenticated /sign page (server/remoteSigning.ts) can find this exact
  // document and nothing else. Then hands off to the universal Send modal
  // with the link pre-filled -- unlike a blank Send, this one has to carry
  // the link or the whole point is lost.
  async function sendRemotely(){
    setPreparingRemote(true);
    try{
      const bytes=await currentPdfBytes();
      const pdfBase64=bytesToBase64(bytes);
      const tooLargeToSave=pdfBase64.length>900_000;
      const token=`sign_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
      const remoteTokenExpiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
      persist("Awaiting Signature",{
        ...(tooLargeToSave?{}:{pdfBase64,actualSizeBytes:bytes.length,mimeType:"application/pdf"}),
        signingOptions:{features,header,footer,clauses,fields,placements,pageCount,hasImportedPdf:pdfPages.length>0,signMethod:"both",remoteToken:token,remoteTokenExpiresAt,remoteSignerName:signerHint?.customerName||""}
      });
      const link=buildRemoteSigningLink(token);
      const name=signerHint?.customerName?` ${signerHint.customerName}`:"";
      setSendBody(`Hi${name}, please review and sign this document: ${link}`);
      setSignSetup(false);
      setSendOpen(true);
      notify(tooLargeToSave?"Signing link ready — the document itself was too large to attach, but the link still works.":"Signing link ready to send");
    }catch(error){
      console.error(error);
      notify("Could not prepare the signing link. Try again.");
    }finally{
      setPreparingRemote(false);
    }
  }
  function pointerDown(e:React.PointerEvent,key:string){
    if(contentLocked||e.button!==0)return;
    e.stopPropagation();
    setSelected(key);
  }
  function beginDrag(e:React.PointerEvent,key:string){
    if(contentLocked||e.button!==0)return;
    const o=key.startsWith("object:")?objects.find(x=>x.id===Number(key.slice(7))):null;
    const position=o?{x:o.x,y:o.y,w:o.w,h:o.h}:placements[key];if(!position)return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(key);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const item=(e.currentTarget as HTMLElement).closest<HTMLElement>(".canvas-object");
    const page=item?.closest<HTMLElement>(".paper");
    const pageScale=page&&page.offsetWidth?page.getBoundingClientRect().width/page.offsetWidth:1;
    const itemRect=item?.getBoundingClientRect();
    const fallback=key.startsWith("field:")?{w:560,h:110}:key.startsWith("clause:")?{w:560,h:70}:{w:240,h:80};
    dragRef.current={key,pointerId:e.pointerId,offsetX:itemRect?(e.clientX-itemRect.left)/pageScale:0,offsetY:itemRect?(e.clientY-itemRect.top)/pageScale:0,w:position.w||fallback.w,h:position.h||fallback.h,start:{clientX:e.clientX,clientY:e.clientY,x:position.x,y:position.y,page:o?.page||placements[key]?.page||1}};
  }
  function beginResize(e:React.PointerEvent,key:string,edge:string){e.preventDefault();e.stopPropagation();if(contentLocked||e.button!==0)return;const o=key.startsWith("object:")?objects.find(x=>x.id===Number(key.slice(7))):null;const p=o||placements[key];if(!p)return;const fallback=key.startsWith("field:")?{w:560,h:110}:{w:560,h:70};setSelected(key);dragRef.current=null;e.currentTarget.setPointerCapture?.(e.pointerId);resizeRef.current={key,pointerId:e.pointerId,edge,startX:e.clientX,startY:e.clientY,x:p.x,y:p.y,w:p.w||fallback.w,h:p.h||fallback.h,scale:o?.scale||1}}
  async function deleteItem(key:string){if(contentLocked)return;if(!(await requestConfirm("Delete this item from the document?")))return;if(key.startsWith("object:")){setObjects(v=>v.filter(o=>o.id!==Number(key.slice(7))))}else if(key.startsWith("field:")){setFields(v=>v.filter(f=>f.id!==Number(key.slice(6))));setPlacements(v=>{const n={...v};delete n[key];return n})}else{const index=Number(key.slice(7));setClauses(v=>v.filter((_,i)=>i!==index));setPlacements(v=>{const n:Record<string,Placement>={};Object.entries(v).forEach(([k,p]:[string,Placement])=>{if(!k.startsWith("clause:"))n[k]=p;else{const i=Number(k.slice(7));if(i<index)n[k]=p;else if(i>index)n[`clause:${i-1}`]=p}});return n})}setSelected(null);notify("Item deleted")}
  function duplicateItem(key:string){if(contentLocked)return;if(key.startsWith("object:")){const source=objects.find(o=>o.id===Number(key.slice(7)));if(source){const copy={...source,id:newId(),x:source.x+18,y:source.y+18};setObjects(v=>[...v,copy]);setSelected(`object:${copy.id}`)}}else if(key.startsWith("field:")){const source=fields.find(f=>f.id===Number(key.slice(6)));if(source){const id=newId(),copy={...source,id,line:fields.filter(f=>f.kind===source.kind&&f.party===source.party).length+1,signed:false,committed:false,name:undefined,image:undefined,stamp:undefined,centralStamp:undefined,coords:undefined};setFields(v=>[...v,copy]);const p=placements[key]||{x:90,y:320,w:560,h:110};setPlacements(v=>({...v,[`field:${id}`]:{...p,x:p.x+18,y:p.y+18}}));setSelected(`field:${id}`)}}else{const i=Number(key.slice(7)),value=clauses[i]||"";setClauses(v=>[...v.slice(0,i+1),value,...v.slice(i+1)]);setPlacements(v=>{const n:Record<string,Placement>={};Object.entries(v).forEach(([k,p]:[string,Placement])=>{if(k.startsWith("clause:")&&Number(k.slice(7))>i)n[`clause:${Number(k.slice(7))+1}`]=p;else n[k]=p});const p=v[key]||{x:90,y:180+i*90,w:560,h:70};n[`clause:${i+1}`]={...p,x:p.x+18,y:p.y+18};return n});setSelected(`clause:${i+1}`)}notify("Item duplicated")}
  const itemControls=(key:string)=><><button type="button" className="grab-handle" onPointerDown={e=>beginDrag(e,key)} aria-label="Grab to move this item">☝ Grab to move</button><div className="object-actions"><button type="button" onPointerDown={e=>e.stopPropagation()} onClick={()=>duplicateItem(key)}>⧉ Duplicate</button><button type="button" onPointerDown={e=>e.stopPropagation()} onClick={()=>deleteItem(key)}>🗑 Delete</button></div>{["nw","n","ne","e","se","s","sw","w"].map(edge=><span key={edge} className={`resize-handle handle-${edge}`} onPointerDown={e=>beginResize(e,key,edge)} aria-hidden="true"/>)}</>;

  const displayName=accountName||accountEmail;

  if(splash)return <div className="selfiesave-editor-root"><main className="splash"><div className="splash-mark">P</div><h1>PDF Editor</h1><p>eSign by SelfieSave — optional, on demand</p><small>…by Stuffapp…</small><button onClick={()=>setSplash(false)}>Enter now</button></main></div>;
  return <div className="selfiesave-editor-root"><main className="app-shell">
    {toast&&<div className="toast">✓ {toast}</div>}
    {confirmState&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><p>{confirmState.message}</p><div style={{display:"flex",justifyContent:"flex-end",gap:"10px",marginTop:"18px"}}><button type="button" style={{border:0,borderRadius:"8px",padding:"11px 16px",background:"#eef2f6",color:"#1d2b3a",fontWeight:"bold"}} onClick={()=>resolveConfirm(false)}>Cancel</button><button type="button" style={{border:0,borderRadius:"8px",padding:"11px 16px",background:"var(--blue)",color:"white",fontWeight:"bold"}} onClick={()=>resolveConfirm(true)}>Confirm</button></div></div></div>}
    {pendingField&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={()=>setPendingField(null)}>×</button><p className="eyebrow">ASSIGN FIELD</p><h2>Add {pendingField.kind} line</h2><p>Choose which signer must complete this field.</p><label>Signer number<input type="number" min="1" inputMode="numeric" autoFocus value={pendingParty} onChange={e=>setPendingParty(e.target.value)}/></label><button className="capture" onClick={confirmAddField}>Add to document</button></div></div>}
    <header className="topbar"><a className="brand" href="#" onClick={e=>e.preventDefault()}><span className="brand-mark">P</span><span>PDF Editor<small>eSign optional</small></span></a><nav aria-label="Document tools"><button onClick={resetDocument}><Icon>＋</Icon><span>New</span></button><button disabled={contentLocked||loadingPdf} onClick={openPdfPicker}><Icon>⇧</Icon><span>{loadingPdf?"Opening…":"Load PDF"}</span></button><input ref={pdfInputRef} className="pdf-file-input" type="file" accept="application/pdf,.pdf" onChange={e=>{const file=e.target.files?.[0];if(file)void loadPdf(file)}}/><button disabled={contentLocked} onClick={()=>textInputRef.current?.click()}><Icon>▤</Icon><span>Load text</span></button><input ref={textInputRef} className="pdf-file-input" type="file" accept="text/plain,text/markdown,text/csv,.txt,.text,.md,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)void loadText(file)}}/><button disabled={contentLocked} onClick={()=>notify("Select PDF text or tap a text box to edit it directly")}><Icon>✎</Icon><span>Edit</span></button><button disabled={contentLocked} onClick={captureSignatures} className="capture-signatures-btn"><Icon>🖊</Icon><span>Capture Signatures</span></button></nav><div className="header-actions"><span className="account-email">{displayName}</span><button type="button" className="sign-out" onClick={onClose}>Close</button><span className={`status ${finalLocked?"locked":""}`}>{finalLocked?"🔒 Final":contentLocked?"🔏 Signed version":"● Draft"}</span></div></header>
    <section className="workspace"><aside className="sidebar"><div className="side-head"><h2>Document setup</h2></div><label>File name<input value={filename} disabled={contentLocked} onChange={e=>setFilename(e.target.value)}/></label><p className="fixed-name">Final file: <strong>{filename||"Untitled"}.pdf</strong></p><hr/><h3>Insert anywhere</h3><button className="insert" onClick={()=>addObject("text")} disabled={contentLocked}><Icon>T</Icon><span><strong>Free text box</strong><small>Type directly on page</small></span><b>＋</b></button><button className="insert" onClick={addClause} disabled={contentLocked}><Icon>§</Icon><span><strong>Contract clause</strong><small>Numbered text field</small></span><b>＋</b></button><button className="insert" onClick={()=>addField("signature")} disabled={contentLocked}><Icon>⌁</Icon><span><strong>Signature line</strong><small>Assign any signer</small></span><b>＋</b></button><button className="insert" onClick={()=>addField("initials")} disabled={contentLocked}><Icon>Ab</Icon><span><strong>Initials line</strong><small>Assign any signer</small></span><b>＋</b></button><button className="insert" onClick={()=>setSetup(true)} disabled={contentLocked}><Icon>⚙</Icon><span><strong>Evidence options</strong><small>Choose document requirements</small></span><b>›</b></button>{contentLocked&&<div className="security"><Icon>🔒</Icon><p><strong>Signed copy protected</strong><br/>Editing is disabled because a signer committed. Make a new unsigned version for any changes.</p></div>}</aside>
      <section ref={editorRef} className="editor-wrap" onScroll={growPages}><div className="editor-tools"><span>{contentLocked?"Signed document viewer":"Free-form document editor"}</span><div><button type="button" onClick={zoomOut} disabled={zoom<=0.4} aria-label="Zoom out">−</button><button type="button" onClick={zoomReset} aria-label="Reset zoom">{Math.round(zoom*100)}%</button><button type="button" onClick={zoomIn} disabled={zoom>=2.5} aria-label="Zoom in">＋</button><select disabled={contentLocked}><option>Georgia</option><option>Arial</option></select><select aria-label="Font size" disabled={contentLocked||!selectedTextObject} value={selectedFontSize} onChange={e=>setSelectedFontSize(Number(e.target.value))}>{Array.from({length:30},(_,index)=>index+1).map(size=><option key={size} value={size}>{size} pt</option>)}</select><button disabled={contentLocked}><b>B</b></button><button disabled={contentLocked}><i>I</i></button></div><span>{selected&&!contentLocked?"Use the blue Grab to move tab":""}</span></div>
        <div className="document-pages" style={{transform:`scale(${zoom})`,transformOrigin:"top center"}}>{Array.from({length:pageCount},(_,pageIndex)=>{const page=pageIndex+1,pdfPage=pdfPages[pageIndex];return <article ref={page===1?paperRef:undefined} key={page} className={`paper ${pdfPage?"imported-pdf-page":""} ${finalLocked?"paper-locked":""}`} style={pdfPage?{aspectRatio:`${pdfPage.width} / ${pdfPage.height}`}:{}} onPointerDown={e=>{if(!(e.target as HTMLElement).closest(".canvas-object"))setSelected(null)}} onDoubleClick={e=>openObjectMenu(e,page)}>
          {pdfPage?<><img className="pdf-page-background" src={pdfPage.image} alt={`Imported PDF page ${page}`}/>{!contentLocked&&<div className="pdf-text-layer" aria-label={`Select text on PDF page ${page}`}>{pdfPage.text.map((item,index)=><span key={`${index}-${item.left}-${item.top}`} data-page={page} data-index={index} className="pdf-text-content" style={{left:`${item.left}%`,top:`${item.top}%`,width:`${Math.max(item.width,.8)}%`,height:`${Math.max(item.height,1)}%`,fontSize:`${item.height}cqh`,fontFamily:item.fontFamily}}>{item.value}</span>)}</div>}</>:<div className="paper-header"><input placeholder="Optional header" value={header} disabled={contentLocked} onChange={e=>setHeader(e.target.value)}/><span>{features.draftingDate?`Date document was drafted: ${draftDate}`:""}</span></div>}<div className="blank-page-hint">{page===1&&!pdfPage&&!contentLocked&&!clauses.length&&!objects.length&&<>Tap <b>Free text box</b>, or double-tap anywhere on this white page to add something.</>}</div>
          {objects.filter(o=>(o.page||1)===page).map(o=>{const key=`object:${o.id}`;const scaleX=o.w/(o.kind==="text"?96:280),scaleY=o.h/(o.kind==="text"?40:160),contentScale=o.kind==="text"?1:Math.max(.55,Math.min(3,Math.max(scaleX,scaleY)));return <div key={o.id} data-object-id={o.id} className={`canvas-object ${o.kind==="text"?"text-object":""} ${o.source==="pdf"?"pdf-edit-object":""} ${selected===key?"selected":""}`} style={{left:o.x,top:o.y,width:o.w,height:o.h,fontSize:o.fontSize,fontFamily:o.fontFamily,backgroundColor:o.source==="pdf"?o.backgroundColor:undefined,"--content-scale":contentScale} as React.CSSProperties} onPointerDown={e=>pointerDown(e,key)} onDoubleClick={e=>e.stopPropagation()}>{selected===key&&itemControls(key)}{o.kind==="image"&&/^https?:/.test(o.value)?<img src={o.value} alt="Document object"/>:o.kind==="video"&&/^https?:/.test(o.value)?<video src={o.value} controls/>:o.kind==="link"&&/^https?:/.test(o.value)?<a href={o.value} target="_blank" rel="noreferrer">{o.value}</a>:<div className="editable-object-content" contentEditable={!contentLocked} suppressContentEditableWarning onInput={e=>o.kind==="text"&&editTextObject(o.id,e.currentTarget,(e.nativeEvent as InputEvent).inputType||"insertText")} onBlur={e=>o.kind==="text"&&commitTextObject(o.id,e.currentTarget)}>{o.value}</div>}</div>})}
          <div className="paper-body">{clauses.map((c,i)=>{const key=`clause:${i}`,pos=placements[key]||{page:1,x:90,y:180+i*90,w:560,h:70};if((pos.page||1)!==page)return null;const contentScale=Math.max(.55,Math.min(3,Math.max((pos.w||560)/560,(pos.h||70)/70)));return <label key={key} className={`canvas-object movable-clause ${selected===key?"selected":""}`} style={{left:pos.x,top:pos.y,width:pos.w||560,height:pos.h||70,"--content-scale":contentScale} as React.CSSProperties} onPointerDown={e=>pointerDown(e,key)}>{selected===key&&itemControls(key)}<b>{i+1}.</b><textarea autoFocus={i===clauses.length-1} placeholder={`Contract Conditions Clause ${i+1}`} value={c} disabled={contentLocked} onChange={e=>setClauses(v=>v.map((x,j)=>j===i?e.target.value:x))}/></label>})}{fields.map(f=>{const key=`field:${f.id}`,pos=placements[key]||{page:1,x:90,y:320,w:560,h:110};if((pos.page||1)!==page)return null;const contentScale=Math.max(.55,Math.min(2,Math.max((pos.w||560)/560,(pos.h||110)/110)));const partyFields=fields.filter(x=>x.party===f.party),isLastPartyField=partyFields.at(-1)?.id===f.id,partyReady=partyFields.every(x=>x.signed),partyCommitted=partyFields.every(x=>x.committed);return <div className={`canvas-object movable-field sign-field ${f.signed?"is-signed":""} ${selected===key?"selected":""}`} style={{left:pos.x,top:pos.y,width:pos.w||560,height:pos.h||110,"--content-scale":contentScale} as React.CSSProperties} onPointerDown={e=>pointerDown(e,key)} key={f.id}>{selected===key&&itemControls(key)}<div className="sign-label"><span>{f.kind} · Party {f.party} · Line {f.line}</span><span>{f.committed?"✓ Committed & locked":f.signed?"Ready to commit":"Required"}</span></div>{f.signed?<><div className="evidence"><div><strong className="script">{f.name}</strong>{!f.committed&&<button onClick={()=>beginSign(f.id)}>Change before commit</button>}</div>{f.signatureImage&&<img src={f.signatureImage} alt={`Drawn signature for ${f.name}`} style={{background:"#fff",border:"1px solid #d7e3ee",borderRadius:6,maxHeight:70}}/>}{f.image&&<img src={f.image} alt={`Verification selfie for ${f.name}`}/>}<div>{features.timestamps&&<><small>Device: {f.stamp}</small><small>{f.centralStamp}</small></>}{features.displayLocation&&<small>{f.coords}</small>}</div></div>{isLastPartyField&&!partyCommitted&&<button className="commit-signer field-commit" disabled={!partyReady} onClick={()=>commitParty(f.party)}>Save signed document — Signer {f.party}</button>}</>:<button className="sign-button" onClick={()=>beginSign(f.id)}><Icon>◉</Icon> Complete {f.kind}{features.selfies?" & capture selfie":""}</button>}</div>})}</div>{!pdfPage&&<footer className="paper-footer"><input placeholder="Optional footer" value={footer} disabled={contentLocked} onChange={e=>setFooter(e.target.value)}/><b>Page {page}</b></footer>}
        </article>})}</div></section></section>
    {pdfSelection&&<button type="button" className="pdf-selection-edit" style={{left:pdfSelection.left,top:pdfSelection.top}} onPointerDown={e=>e.preventDefault()} onClick={()=>editImportedPdfText(pdfSelection.page,pdfSelection.item,pdfSelection.value,pdfSelection)}>Edit selected text</button>}
    {menu&&<div className="object-menu-backdrop" onPointerDown={()=>setMenu(null)}><div className="floating" role="dialog" aria-modal="true" aria-label="Add object" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>addObject("text")}>T Custom text field</button><button onClick={addClause}>§ Contract clause</button><button onClick={()=>addField("signature")}>⌁ Signature line</button><button onClick={()=>addField("initials")}>Ab Initials line</button><button onClick={()=>addObject("image")}>▧ Image</button><button onClick={()=>addObject("link")}>↗ Link</button><button onClick={()=>addObject("video")}>▶ Video</button></div></div>}
    <footer className="actionbar"><div><strong>{fields.length?`${fields.filter(f=>f.committed).length} of ${fields.length} fields committed`:"No signatures requested"}</strong><span><i style={{width:`${fields.length?fields.filter(f=>f.committed).length/fields.length*100:0}%`}}/></span><small>{fields.length===0?"Save a draft or a completed copy any time -- signatures are optional. Use \"Prepare for Signing\" only if this document needs one.":contentLocked&&!complete?"Agreement text locked; remaining signers may complete only their assigned fields.":complete?"All parties committed. Ready for final lock.":"Each signer must complete and commit every assigned field."}</small></div><button className="save-draft" disabled={exporting} onClick={()=>exportPdf(false)}>{exporting?"Building PDF…":"💾 Save Draft"}</button><button className="save-draft" disabled={savingCompleted} onClick={saveCompleted}>{savingCompleted?"Building PDF…":"✅ Save Completed Document"}</button><button className="save-draft" disabled={contentLocked} onClick={()=>setSignSetup(true)}>✍️ Save & Prepare for Signing</button><button className="save-draft" onClick={()=>{setSendBody("");setSendOpen(true)}}>📤 Send</button><button className="finalize" disabled={!complete||finalLocked||exporting} onClick={finalize}>🔒 Save final signed copy</button></footer>
    {signSetup&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal setup-modal"><button className="modal-close" onClick={()=>setSignSetup(false)}>×</button><p className="eyebrow">CUSTOMER SIGNING</p><h2>How will the customer sign?</h2><p>Choose how this document collects the customer's signature.</p>
      <button className="capture" onClick={()=>prepareInPerson("drawn")}>🖊 In person — sign with a stylus or finger</button>
      <button className="capture" onClick={()=>prepareInPerson("typed")}>⌨ In person — type name on this device</button>
      <button className="capture" disabled={preparingRemote} onClick={sendRemotely}>{preparingRemote?"Preparing link…":"✉ Send remotely — customer picks stylus or typed, on their own device"}</button>
    </div></div>}
    <SendChoiceModal isOpen={sendOpen} onClose={()=>setSendOpen(false)} label={filename||"document"} phone={customerPhone} email={customerEmail} body={sendBody} />
    {setup&&<div className="modal-backdrop"><div className="modal setup-modal"><p className="eyebrow">DOCUMENT REQUIREMENTS</p><h2>Choose the evidence for this document</h2><p>Select any combination. Signers will see and consent to the requirements before signing.</p>{Object.entries({signatures:"Signature fields",initials:"Initials fields",selfies:"Selfie with signing actions",photoId:"Photo ID before signing",location:"Capture device coordinates",displayLocation:"Display coordinates on document",timestamps:"Device time + Central Time",draftingDate:"Verified drafting date"}).map(([k,label])=><label className="check option" key={k}><input type="checkbox" checked={features[k as keyof Features]} onChange={()=>updateFeature(k as keyof Features)}/>{label}</label>)}<button className="capture" onClick={()=>setSetup(false)}>Start with a blank document</button></div></div>}
    {active&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={()=>{streamRef.current?.getTracks().forEach(t=>t.stop());setActive(null)}}>×</button><p className="eyebrow">SIGNER EVIDENCE</p><h2>Complete this signing field</h2><p>Review the document, enter your legal name, and consent before saving this field. Your whole portion stays editable until you commit it.</p>{features.selfies&&<div className="camera">{cameraError?<div className="camera-error">Camera unavailable -- continuing without a selfie<br/><small>{cameraError}</small></div>:<video ref={videoRef} autoPlay muted playsInline/>}<span>FRONT CAMERA</span></div>}<label>Full legal name<input value={signerName} onChange={e=>setSignerName(e.target.value)} placeholder="Type your legal name"/></label>{signMethod==="drawn"&&<div style={{margin:"10px 0"}}><SignaturePad onChange={setDrawnSignature} /></div>}<label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I consent to electronic records and intend this action to sign this document.</label><button className="capture" disabled={!signerName.trim()||!consent||(signMethod==="drawn"&&!drawnSignature)} onClick={saveMark}>Save this field for review</button></div></div>}
  </main></div>
}
