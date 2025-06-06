// src/main.js
//  · Browser-only: QR scan via jsQR, PDF→text via PDF.js
//  · No Node-only modules; everything runs under Vite.

import jsQR from "jsqr";
import jsQR from "jsqr";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// ← this line imports the worker file as a URL under Vite
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";




const startBtn = document.getElementById("startBtn");
const video    = document.getElementById("video");
const canvas   = document.getElementById("canvas");
const ctx      = canvas.getContext("2d");
const output   = document.getElementById("result");

// Tell PDF.js to use that imported URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  initCamera().catch(err => {
    console.error(err);
    output.textContent = "❌ Could not access camera.";
    startBtn.disabled = false;
  });
});

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  video.srcObject    = stream;
  video.style.display = "block";
  await video.play();

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  scanFrame();
}

function scanFrame() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrResult  = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert"
    });

    if (qrResult) {
      handleQrPayload(qrResult.data);
      return;
    }
  }
  requestAnimationFrame(scanFrame);
}

async function handleQrPayload(payload) {
  // Stop camera immediately
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.style.display = "none";
  startBtn.disabled   = false;
  startBtn.textContent = "Scan Again";

  if (!/^https?:\/\//i.test(payload)) {
    output.textContent = `QR content: ${payload}`;
    return;
  }

  output.innerHTML = `⏬ Fetching PDF via PDF.js:<br>
                      <a href="${payload}" target="_blank">${payload}</a><br>
                      <em>Please wait…</em>`;

  try {
    const fullText = await extractPdfTextBrowser(payload);
    const snippet  = fullText.slice(0, 300).replace(/\s+/g, " ");
    output.innerHTML = `
      ✅ Extracted report text (browser) from:<br>
      <a href="${payload}" target="_blank">${payload}</a><br>
      <details>
        <summary>Show first 300 characters</summary>
        <pre>${snippet}&hellip;</pre>
      </details>
    `;

    // TODO: store `fullText` to IndexedDB or send to your server for RAG/DB.
  } catch (err) {
    console.error(err);
    output.textContent = `❌ Could not parse PDF in browser: ${err.message}`;
  }
}

/**
 * Fetches a PDF from `url` and returns all its text as a single string.
 * Uses PDF.js entirely in‐browser.
 */
async function extractPdfTextBrowser(url) {
  // 1) Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ url });
  const pdfDocument = await loadingTask.promise;

  let allText = "";
  // 2) Loop through each page
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    // 3) textContent.items is an array of { str: "…" } objects
    const pageText = textContent.items.map(item => item.str).join(" ");
    allText += pageText + "\n\n";
  }

  return allText;
}
