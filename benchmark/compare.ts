import { createKTX2WorkerPool, encodeToKTX2 as encodeFork, type IEncodeOptions } from "../src/web/index.js";
import { encodeToKTX2 as encodeOriginal } from "ktx2-encoder";

type Mode = "uastc" | "etc1s";

interface CompareConfig {
  imagePath: string;
  runs: number;
  mode: Mode;
  generateMipmap: boolean;
  poolSize: number;
  batchSize: number;
}

interface CompareResult {
  samples: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
  outputBytes: number;
  perItemMs?: number;
}

const ORIGINAL_JS_URL = new URL("../node_modules/ktx2-encoder/dist/basis/basis_encoder.js", import.meta.url).href;
const ORIGINAL_WASM_URL = new URL("../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm", import.meta.url).href;

const form = document.querySelector<HTMLFormElement>("#compare-form");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const runButton = document.querySelector<HTMLButtonElement>("#run-compare");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-results");
const summaryEl = document.querySelector<HTMLParagraphElement>("#summary-text");

const resultFields = {
  original: {
    average: document.querySelector<HTMLElement>("#original-average"),
    min: document.querySelector<HTMLElement>("#original-min"),
    max: document.querySelector<HTMLElement>("#original-max"),
    size: document.querySelector<HTMLElement>("#original-size"),
    samples: document.querySelector<HTMLOListElement>("#original-samples")
  },
  fork: {
    average: document.querySelector<HTMLElement>("#fork-average"),
    min: document.querySelector<HTMLElement>("#fork-min"),
    max: document.querySelector<HTMLElement>("#fork-max"),
    size: document.querySelector<HTMLElement>("#fork-size"),
    samples: document.querySelector<HTMLOListElement>("#fork-samples")
  },
  pool: {
    average: document.querySelector<HTMLElement>("#pool-average"),
    perItem: document.querySelector<HTMLElement>("#pool-per-item"),
    versusOriginal: document.querySelector<HTMLElement>("#pool-vs-original"),
    min: document.querySelector<HTMLElement>("#pool-min"),
    max: document.querySelector<HTMLElement>("#pool-max"),
    size: document.querySelector<HTMLElement>("#pool-size-result"),
    samples: document.querySelector<HTMLOListElement>("#pool-samples")
  }
};

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing compare element: ${name}.`);
  }

  return element;
}

function getConfig(): CompareConfig {
  const imagePath = requireElement(document.querySelector<HTMLSelectElement>("#image-path"), "image-path").value;
  const runs = Number.parseInt(requireElement(document.querySelector<HTMLInputElement>("#runs"), "runs").value, 10);
  const mode = requireElement(document.querySelector<HTMLSelectElement>("#mode"), "mode").value as Mode;
  const generateMipmap = requireElement(document.querySelector<HTMLInputElement>("#mipmap"), "mipmap").checked;
  const poolSize = Number.parseInt(
    requireElement(document.querySelector<HTMLInputElement>("#pool-size"), "pool-size").value,
    10
  );
  const batchSize = Number.parseInt(
    requireElement(document.querySelector<HTMLInputElement>("#batch-size"), "batch-size").value,
    10
  );

  return {
    imagePath,
    runs: Number.isFinite(runs) ? Math.min(Math.max(runs, 1), 20) : 3,
    mode,
    generateMipmap,
    poolSize: Number.isFinite(poolSize) ? Math.min(Math.max(poolSize, 1), 8) : 2,
    batchSize: Number.isFinite(batchSize) ? Math.min(Math.max(batchSize, 1), 16) : 4
  };
}

function setStatus(message: string, isError = false) {
  const element = requireElement(statusEl, "status");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setRunning(isRunning: boolean) {
  requireElement(runButton, "run-compare").disabled = isRunning;
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function setPlaceholder(which: "original" | "fork" | "pool") {
  const target = resultFields[which];
  requireElement(target.average, `${which}-average`).textContent = "-";
  if ("perItem" in target && target.perItem) {
    requireElement(target.perItem, `${which}-per-item`).textContent = "-";
  }
  if ("versusOriginal" in target && target.versusOriginal) {
    requireElement(target.versusOriginal, `${which}-vs-original`).textContent = "-";
  }
  requireElement(target.min, `${which}-min`).textContent = "-";
  requireElement(target.max, `${which}-max`).textContent = "-";
  requireElement(target.size, `${which}-size`).textContent = "-";
  requireElement(target.samples, `${which}-samples`).innerHTML = "";
}

function renderResult(
  which: "original" | "fork" | "pool",
  result: CompareResult,
  context?: { originalPerItemMs?: number }
) {
  const target = resultFields[which];
  requireElement(target.average, `${which}-average`).textContent = formatMs(result.averageMs);
  if ("perItem" in target && target.perItem) {
    requireElement(target.perItem, `${which}-per-item`).textContent = result.perItemMs
      ? formatMs(result.perItemMs)
      : "-";
  }
  if ("versusOriginal" in target && target.versusOriginal) {
    const versusOriginal = requireElement(target.versusOriginal, `${which}-vs-original`);
    versusOriginal.classList.remove("metric-win", "metric-loss");
    if (result.perItemMs && context?.originalPerItemMs) {
      const deltaMs = context.originalPerItemMs - result.perItemMs;
      const ratio = (deltaMs / context.originalPerItemMs) * 100;
      const text =
        deltaMs === 0
          ? "0.0%"
          : `${deltaMs > 0 ? "+" : "-"}${formatMs(Math.abs(deltaMs))} / ${formatPercent(Math.abs(ratio))}`;
      versusOriginal.textContent = text;
      if (deltaMs > 0) {
        versusOriginal.classList.add("metric-win");
      } else if (deltaMs < 0) {
        versusOriginal.classList.add("metric-loss");
      }
    } else {
      versusOriginal.textContent = "-";
    }
  }
  requireElement(target.min, `${which}-min`).textContent = formatMs(result.minMs);
  requireElement(target.max, `${which}-max`).textContent = formatMs(result.maxMs);
  requireElement(target.size, `${which}-size`).textContent = formatBytes(result.outputBytes);

  const sampleList = requireElement(target.samples, `${which}-samples`);
  sampleList.innerHTML = "";
  for (const sample of result.samples) {
    const item = document.createElement("li");
    item.textContent = formatMs(sample);
    sampleList.appendChild(item);
  }
}

function buildForkOptions(config: CompareConfig): IEncodeOptions {
  return {
    isUASTC: config.mode === "uastc",
    qualityLevel: 230,
    enableDebug: false,
    generateMipmap: config.generateMipmap
  };
}

function buildOriginalOptions(config: CompareConfig) {
  return {
    isUASTC: config.mode === "uastc",
    qualityLevel: 230,
    enableDebug: false,
    generateMipmap: config.generateMipmap,
    jsUrl: ORIGINAL_JS_URL,
    wasmUrl: ORIGINAL_WASM_URL
  };
}

async function loadImageBuffer(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch comparison image: ${path} (${response.status}).`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function benchmarkPackage(
  label: string,
  runs: number,
  input: Uint8Array,
  createTask: (buffer: Uint8Array) => Promise<Uint8Array>
): Promise<CompareResult> {
  const samples: number[] = [];
  let outputBytes = 0;

  for (let index = 0; index < runs; index++) {
    setStatus(`${label}: run ${index + 1} of ${runs}...`);
    const buffer = input.slice();
    const start = performance.now();
    const result = await createTask(buffer);
    const duration = performance.now() - start;
    samples.push(duration);
    outputBytes = result.byteLength;
  }

  const total = samples.reduce((sum, sample) => sum + sample, 0);
  return {
    samples,
    averageMs: total / samples.length,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    outputBytes
  };
}

async function benchmarkForkPool(
  runs: number,
  batchSize: number,
  input: Uint8Array,
  options: IEncodeOptions,
  poolSize: number
): Promise<CompareResult> {
  const pool = createKTX2WorkerPool({ size: poolSize });

  try {
    const samples: number[] = [];
    let outputBytes = 0;

    for (let index = 0; index < runs; index++) {
      setStatus(`Fork pool: batch ${index + 1} of ${runs}...`);
      const jobs = Array.from({ length: batchSize }, () => ({
        imageBuffer: input.slice(),
        options: { ...options }
      }));

      const start = performance.now();
      const results = await pool.encodeMany(jobs);
      const duration = performance.now() - start;
      samples.push(duration);
      outputBytes = results.reduce((sum, result) => sum + result.byteLength, 0);
    }

    const total = samples.reduce((sum, sample) => sum + sample, 0);
    return {
      samples,
      averageMs: total / samples.length,
      minMs: Math.min(...samples),
      maxMs: Math.max(...samples),
      outputBytes,
      perItemMs: total / samples.length / batchSize
    };
  } finally {
    pool.terminate();
  }
}

async function runComparison() {
  const config = getConfig();
  setRunning(true);
  setStatus("Loading image...");

  try {
    const input = await loadImageBuffer(config.imagePath);
    const originalOptions = buildOriginalOptions(config);
    const forkOptions = buildForkOptions(config);

    const original = await benchmarkPackage("Original package", config.runs, input, (buffer) =>
      encodeOriginal(buffer, { ...originalOptions })
    );
    renderResult("original", original);

    const fork = await benchmarkPackage("This fork", config.runs, input, (buffer) =>
      encodeFork(buffer, { ...forkOptions })
    );
    renderResult("fork", fork);

    const pool = await benchmarkForkPool(config.runs, config.batchSize, input, forkOptions, config.poolSize);
    renderResult("pool", pool, { originalPerItemMs: original.averageMs });

    const diff = fork.averageMs - original.averageMs;
    const relation = diff === 0 ? "matched" : diff < 0 ? "was faster than" : "was slower than";
    const poolGainMs = original.averageMs - (pool.perItemMs ?? original.averageMs);
    const poolGainPercent = (poolGainMs / original.averageMs) * 100;
    requireElement(summaryEl, "summary-text").textContent =
      `Done. This fork ${relation} the original package by ${formatMs(
        Math.abs(diff)
      )} on average. Fork pool average is ${formatMs(pool.averageMs)} for batches of ${config.batchSize} with pool size ${
        config.poolSize
      }, which is ${formatMs(pool.perItemMs ?? 0)} per texture, ${poolGainMs >= 0 ? "faster" : "slower"} than the original by ${formatMs(
        Math.abs(poolGainMs)
      )} per texture (${formatPercent(Math.abs(poolGainPercent))}).`;
    setStatus("Comparison complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
    requireElement(summaryEl, "summary-text").textContent = "Comparison failed.";
  } finally {
    setRunning(false);
  }
}

requireElement(form, "compare-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runComparison();
});

requireElement(clearButton, "clear-results").addEventListener("click", () => {
  setPlaceholder("original");
  setPlaceholder("fork");
  setPlaceholder("pool");
  requireElement(summaryEl, "summary-text").textContent =
    "The comparison uses the same browser image, options, and local Basis assets for both implementations.";
  setStatus("Cleared.");
});

setPlaceholder("original");
setPlaceholder("fork");
setPlaceholder("pool");
