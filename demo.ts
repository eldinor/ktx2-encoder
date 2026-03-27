import { createKTX2WorkerPool, encodeToKTX2, type IEncodeOptions, type IEncodeWorkerClient } from "./src/web/index.js";

type ExecutionMode = "direct" | "worker" | "pool";

const SAMPLE_PATH = "/tests/DuckCM.png";

const form = document.querySelector<HTMLFormElement>("#demo-form");
const fileInput = document.querySelector<HTMLInputElement>("#source-file");
const useSampleButton = document.querySelector<HTMLButtonElement>("#use-sample");
const compressionMode = document.querySelector<HTMLSelectElement>("#compression-mode");
const qualityLevel = document.querySelector<HTMLInputElement>("#quality-level");
const poolSizeField = document.querySelector<HTMLElement>("#pool-size-field");
const poolSizeInput = document.querySelector<HTMLInputElement>("#pool-size");
const generateMipmap = document.querySelector<HTMLInputElement>("#generate-mipmap");
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-button");
const encodeButton = document.querySelector<HTMLButtonElement>("#encode-button");
const downloadLink = document.querySelector<HTMLAnchorElement>("#download-link");
const sourceLabel = document.querySelector<HTMLElement>("#source-label");
const sourceSizeEl = document.querySelector<HTMLElement>("#source-size");
const outputSizeEl = document.querySelector<HTMLElement>("#output-size");
const elapsedTimeEl = document.querySelector<HTMLElement>("#elapsed-time");
const modeLabelEl = document.querySelector<HTMLElement>("#mode-label");
const statusMessage = document.querySelector<HTMLElement>("#status-message");
const eventLog = document.querySelector<HTMLElement>("#event-log");

let sourceBuffer: Uint8Array | null = null;
let sourceName = "";
let outputUrl: string | null = null;
let activeController: AbortController | null = null;
let poolClient: IEncodeWorkerClient | null = null;
let poolClientSize: number | null = null;

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing demo element: ${name}`);
  }

  return element;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function formatMs(ms: number) {
  return `${ms.toFixed(1)} ms`;
}

function setStatus(message: string, tone: "default" | "success" | "error" = "default") {
  const element = requireElement(statusMessage, "status-message");
  element.textContent = message;
  element.className = `status${tone === "default" ? "" : ` ${tone}`}`;
}

function addEvent(state: string) {
  const log = requireElement(eventLog, "event-log");
  const entry = document.createElement("li");
  const label = document.createElement("span");
  const time = document.createElement("small");
  label.textContent = state;
  time.textContent = new Date().toLocaleTimeString();
  entry.append(label, time);
  log.prepend(entry);
}

function clearEvents() {
  requireElement(eventLog, "event-log").innerHTML = "";
}

function resetDownload() {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = null;
  }

  const link = requireElement(downloadLink, "download-link");
  link.removeAttribute("href");
  link.classList.add("disabled");
}

function setSource(buffer: Uint8Array, name: string) {
  sourceBuffer = buffer;
  sourceName = name;
  requireElement(sourceLabel, "source-label").textContent = `Source: ${name}`;
  requireElement(sourceSizeEl, "source-size").textContent = formatBytes(buffer.byteLength);
}

function getExecutionMode(): ExecutionMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="execution-mode"]:checked');
  return (checked?.value as ExecutionMode | undefined) ?? "direct";
}

function syncModeUI() {
  const mode = getExecutionMode();
  requireElement(poolSizeField, "pool-size-field").classList.toggle("hidden", mode !== "pool");
}

function getOrCreatePool(size: number) {
  if (!poolClient || poolClientSize !== size) {
    poolClient?.terminate();
    poolClient = createKTX2WorkerPool({ size });
    poolClientSize = size;
  }

  return poolClient;
}

function getOptions(mode: ExecutionMode, signal: AbortSignal): IEncodeOptions {
  const baseOptions: IEncodeOptions = {
    isUASTC: requireElement(compressionMode, "compression-mode").value === "uastc",
    qualityLevel: Number.parseInt(requireElement(qualityLevel, "quality-level").value, 10),
    generateMipmap: requireElement(generateMipmap, "generate-mipmap").checked,
    signal,
    onProgress(event) {
      addEvent(event.state);
    }
  };

  if (mode === "worker") {
    return { ...baseOptions, worker: true };
  }

  if (mode === "pool") {
    const size = Math.min(
      Math.max(Number.parseInt(requireElement(poolSizeInput, "pool-size").value, 10) || 2, 1),
      8
    );
    return { ...baseOptions, worker: getOrCreatePool(size) };
  }

  return baseOptions;
}

async function loadSample() {
  const response = await fetch(SAMPLE_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load sample image (${response.status}).`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  setSource(buffer, "DuckCM.png");
}

async function handleFileSelection(file: File) {
  if (file.type === "image/webp" || file.name.toLowerCase().endsWith(".webp")) {
    throw new Error("WebP is not supported in this demo yet. Please use PNG or JPEG.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  setSource(buffer, file.name);
}

function setBusy(isBusy: boolean) {
  requireElement(encodeButton, "encode-button").disabled = isBusy;
  requireElement(cancelButton, "cancel-button").disabled = !isBusy;
  requireElement(fileInput, "source-file").disabled = isBusy;
  requireElement(useSampleButton, "use-sample").disabled = isBusy;
}

async function handleEncode() {
  if (!sourceBuffer) {
    setStatus("Choose an image or load the sample first.", "error");
    return;
  }

  resetDownload();
  clearEvents();
  activeController = new AbortController();
  setBusy(true);

  const mode = getExecutionMode();
  requireElement(modeLabelEl, "mode-label").textContent =
    mode === "pool"
      ? `Pool x${Math.min(Math.max(Number.parseInt(requireElement(poolSizeInput, "pool-size").value, 10) || 2, 1), 8)}`
      : mode === "worker"
        ? "Worker"
        : "Direct";

  const start = performance.now();
  setStatus("Encoding...");

  try {
    const result = await encodeToKTX2(sourceBuffer.slice(), getOptions(mode, activeController.signal));
    const duration = performance.now() - start;
    requireElement(outputSizeEl, "output-size").textContent = formatBytes(result.byteLength);
    requireElement(elapsedTimeEl, "elapsed-time").textContent = formatMs(duration);

    const outputBytes = Uint8Array.from(result);
    outputUrl = URL.createObjectURL(new Blob([outputBytes as BlobPart], { type: "image/ktx2" }));
    const link = requireElement(downloadLink, "download-link");
    link.href = outputUrl;
    link.download = `${sourceName.replace(/\.[^.]+$/, "") || "texture"}.ktx2`;
    link.classList.remove("disabled");

    setStatus("Encode finished. Download is ready.", "success");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus("Encode canceled.", "error");
    } else {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  } finally {
    activeController = null;
    setBusy(false);
  }
}

requireElement(form, "demo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void handleEncode();
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="execution-mode"]')) {
  radio.addEventListener("change", syncModeUI);
}

requireElement(useSampleButton, "use-sample").addEventListener("click", () => {
  void loadSample().then(
    () => setStatus("Sample image loaded."),
    (error) => setStatus(error instanceof Error ? error.message : String(error), "error")
  );
});

requireElement(fileInput, "source-file").addEventListener("change", () => {
  const file = requireElement(fileInput, "source-file").files?.[0];
  if (!file) {
    return;
  }

  void handleFileSelection(file).then(
    () => setStatus("Image loaded."),
    (error) => setStatus(error instanceof Error ? error.message : String(error), "error")
  );
});

requireElement(cancelButton, "cancel-button").addEventListener("click", () => {
  activeController?.abort();
});

window.addEventListener("beforeunload", () => {
  poolClient?.terminate();
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
  }
});

syncModeUI();
requireElement(sourceSizeEl, "source-size").textContent = "-";
requireElement(outputSizeEl, "output-size").textContent = "-";
requireElement(elapsedTimeEl, "elapsed-time").textContent = "-";
requireElement(modeLabelEl, "mode-label").textContent = "-";
setStatus("Ready.");
