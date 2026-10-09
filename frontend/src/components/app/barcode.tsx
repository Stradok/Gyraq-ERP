"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** Barcode input: works with USB/Bluetooth scanners (they type the code then Enter) and, where the browser supports it, the camera. */
export function BarcodeField({ onScan, placeholder = "Scan or type barcode, then Enter" }: { onScan: (code: string) => boolean; placeholder?: string }) {
  const [v, setV] = useState("");
  const [cam, setCam] = useState(false);
  const [msg, setMsg] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
  const submit = (code: string) => { const ok = onScan(code.trim()); setMsg(ok ? "" : `No product with barcode ${code.trim()} here`); setV(""); };

  useEffect(() => {
    if (!cam) return;
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const D = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const det = new D({ formats: ["ean_13", "ean_8", "code_128", "upc_a"] });
        const tick = async () => { if (stop || !video.current) return; try { const r = await det.detect(video.current); if (r[0]) { submit(r[0].rawValue); setCam(false); return; } } catch { /* frame not ready */ } setTimeout(tick, 250); };
        tick();
      } catch { setMsg("Camera isn't available. Type the barcode instead."); setCam(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam]);

  return (
    <div className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) submit(v); }} className="flex gap-2">
        <div className="relative flex-1"><ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Barcode" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-11 pl-9 text-base" inputMode="numeric" /></div>
        {supported && <Button type="button" variant="outline" className="h-11" onClick={() => setCam((c) => !c)}><Camera />{cam ? "Stop" : "Camera"}</Button>}
      </form>
      {cam && <video ref={video} muted playsInline className="aspect-video w-full rounded-md border bg-black object-cover" />}
      {msg && <p className="text-xs text-warning">{msg}</p>}
    </div>
  );
}
