/* main.jsbrowser ES‑module, local pdf.mjs + worker */

import jsQR from "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm";
import * as pdfjsLib from "./pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

const $ = id => document.getElementById(id);
const startBtn = $("startBtn");
const video    = $("video");
const canvas   = $("canvas");
const ctx      = canvas.getContext("2d");
const statusEl = $("status");
const outEl    = $("output");

// ---------- helpers ----------
async function fetchPdf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { buf: await r.arrayBuffer(), ct: r.headers.get("content-type") };
}
const isPdf  = b => new Uint8Array(b,0,5).join() === "37,80,68,70,45"; // %PDF-
const pdfVer = b => (new TextDecoder().decode(b.slice(0,12)).match(/%PDF-(\d\.\d)/)||[])[1]||"unknown";

async function extractText(buf){
  const pdf  = await pdfjsLib.getDocument({ data:buf }).promise;
  const out  = [];
  for(let p=1;p<=pdf.numPages;p++){
    const tc = await (await pdf.getPage(p)).getTextContent();
    out.push(tc.items.map(t=>t.str).join(" "));
  }
  return out.join("\n");
}

// ---------- QR + camera ----------
startBtn.onclick = async () => {
  startBtn.disabled = true;
  statusEl.textContent = "Opening camera…";
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:"environment" }
    });
    video.srcObject = stream;
    video.style.display = "block";
    await video.play();

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    statusEl.textContent = "Point camera at COA QR code…";
    scanLoop();
  }catch(e){
    statusEl.textContent = "❌ Camera error: "+e.message;
    startBtn.disabled = false;
  }
};

function scanLoop(){
  if(video.readyState === video.HAVE_ENOUGH_DATA){
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const img = ctx.getImageData(0,0,canvas.width,canvas.height);
    const qr  = jsQR(img.data,img.width,img.height,{ inversionAttempts:"dontInvert"});
    if(qr){ handleQr(qr.data); return; }
  }
  requestAnimationFrame(scanLoop);
}

// ---------- main handler ----------
async function handleQr(payload){
  video.srcObject?.getTracks().forEach(t=>t.stop());
  video.style.display = "none";
  startBtn.textContent = "Scan Again";
  startBtn.disabled = false;
  outEl.textContent = "";

  if(!/^https?:\/\//i.test(payload)){
    statusEl.textContent = "QR content (not URL): "+payload;
    return;
  }

  statusEl.innerHTML = `⏬ Fetching PDF:<br><a href="${payload}" target="_blank">${payload}</a>`;
  try{
    const { buf, ct } = await fetchPdf(payload);
    if(!(isPdf(buf) || (ct && ct.includes("pdf"))))
      throw new Error("Fetched file isn't a valid PDF");

    // read version *before* buffer is transferred to worker
    const version = pdfVer(buf);

    statusEl.textContent = "📖 Parsing PDF…";
    const text = await extractText(buf);

    statusEl.textContent =
      `✅ Extracted ${text.length} chars (PDF ${version})`;
    outEl.textContent = text.slice(0,20000) +
      (text.length>20000 ? "\n… (truncated)" : "");
  }catch(e){
    statusEl.textContent = "❌ "+e.message;
    console.error(e);
  }
}
