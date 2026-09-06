'use client';

import { useRef, useState, type ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { ChartWatermark } from '@/components/ChartWatermark';

export function ShareableCard({title,children,sourceHeight=0,isLive=false,shareText,fileName='zecblock.png',footerNote,className='mt-4',branding='logo',exportDisabled=false,compact=false}: {
  title:string; children:ReactNode; sourceHeight?:number; isLive?:boolean; shareText:string; fileName?:string;
  watermark?:boolean; footerNote?:string; className?:string; branding?:'logo'|'compact'; exportDisabled?:boolean; compact?:boolean;
}) {
  const cardRef=useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [download,setDownload]=useState(false);
  const capture=async()=>{
    if(!cardRef.current) throw new Error('Chart unavailable');
    const {toPng}=await import('html-to-image');
    const dataUrl=await toPng(cardRef.current,{
      backgroundColor:getComputedStyle(cardRef.current).backgroundColor,pixelRatio:2,
      filter:node=>!(node instanceof HTMLElement && node.dataset.html2canvasIgnore),
    });
    return (await fetch(dataUrl)).blob();
  };
  const save=async()=>{
    setBusy(true);
    try { const url=URL.createObjectURL(await capture()); const a=document.createElement('a'); a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Image downloaded.'); }
    catch { setStatus('Could not create the image. Please try again.'); }
    finally {setBusy(false);}
  };
  const copy=async(forX=false)=>{
    setBusy(true);setStatus('Preparing image…');
    try {
      // Pass the promise during the user gesture (required by Safari clipboard permissions).
      if (!navigator.clipboard?.write || typeof ClipboardItem==='undefined') throw new Error('Clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({'image/png':capture()})]);
      setStatus(forX?'Image copied. Paste it into your X post to attach it.':'Image copied. Paste it into your post or message.');
    } catch {setStatus(forX?'X opened with the chart link. Download a PNG here to attach the image.':'Image could not be copied. Download a PNG instead.');setDownload(true);}
    finally {setBusy(false);}
  };
  const button='rounded-md border border-cipher-border px-2.5 py-2 text-caption font-mono text-muted hover:bg-glass-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cipher-gold disabled:opacity-50';
  return <div className={className}><div ref={cardRef} className={`chart-branded relative h-full min-w-0 overflow-hidden rounded-xl border border-cipher-border bg-cipher-surface flex flex-col ${compact?'p-4':'p-4 sm:p-6'}`}>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><h2 className="text-sm font-semibold text-primary">{title}</h2>
      <div className="flex flex-wrap gap-2" data-html2canvas-ignore="true">
        <button type="button" onClick={()=>copy()} disabled={busy||exportDisabled} className={button}>Copy image</button>
        <a className={button} href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" onClick={()=>{if(!busy&&!exportDisabled) void copy(true);else setStatus('X opens with the chart link.');}}>Share to X ↗</a>
        {download&&<button type="button" onClick={save} disabled={busy||exportDisabled} className={button}>Download PNG</button>}
      </div>
    </div>
    {children}
    <div className="mt-auto pt-3"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-cipher-border/40 pt-3 text-caption font-mono text-muted">
      <div className="flex items-center gap-2">{branding==='logo'&&<BrandLogo compact/>}<ChartWatermark className="!p-0"/></div>
      <span>{footerNote ?? `${isLive?'Live feed':'Snapshot'}${sourceHeight>0?` · block ${sourceHeight.toLocaleString()}`:''}`}</span>
    </div></div>
    {status&&<p role="status" className="mt-3 text-caption text-muted" data-html2canvas-ignore="true">{status}</p>}
  </div></div>;
}
