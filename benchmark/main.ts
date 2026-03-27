import { createKTX2Worker, createKTX2WorkerPool, encodeToKTX2, type IEncodeOptions } from "../src/web/index.js";

type Mode = "uastc" | "etc1s";

interface BenchmarkConfig {
  imagePath: string;
  runs: number;
  mode: Mode;
  generateMipmap: boolean;
  poolSize: number;
  batchSize: number;
}

interface BenchmarkResult {
  samples: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
  outputBytes: number;
  perItemMs?: number;
}

const form = document.querySelector<HTMLFormElement>("#benchmark-form");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const runButton = document.querySelector<HTMLButtonElement>("#run-benchmark");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-results");

const resultFields = {
  direct: {
    average: document.querySelector<HTMLElement>("#direct-average"),
    min: document.querySelector<HTMLElement>("#direct-min"),
    max: document.querySelector<HTMLElement>("#direct-max"),
    size: document.querySelector<HTMLElement>("#direct-size"),
    samples: document.querySelector<HTMLOListElement>("#direct-samples")
  },
  worker: {
    average: document.querySelector<HTMLElement>("#worker-average"),
    min: document.querySelector<HTMLElement>("#worker-min"),
    max: document.querySelector<HTMLElement>("#worker-max"),
    size: document.querySelector<HTMLElement>("#worker-size"),
    samples: document.querySelector<HTMLOListElement>("#worker-samples")
  },
  pool: {
    average: document.querySelector<HTMLElement>("#pool-average"),
    perItem: document.querySelector<HTMLElement>("#pool-per-item"),
    min: document.querySelector<HTMLElement>("#pool-min"),
    max: document.querySelector<HTMLElement>("#pool-max"),
    size: document.querySelector<HTMLElement>("#pool-size"),
    samples: document.querySelector<HTMLOListElement>("#pool-samples")
  }
};

const workerClient = createKTX2Worker();

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing benchmark element: ${name}.`);
  }
  return element;
}

function getConfig(): BenchmarkConfig {
  const imagePath = requireElement(
    document.querySelector<HTMLSelectElement>("#image-path"),
    "image-path"
  ).value;
  const runs = Number.parseInt(requireElement(document.querySelector<HTMLInputElement>("#runs"), "runs").value, 10);
  const mode = requireElement(document.querySelector<HTMLSelectElement>("#mode"), "mode").value as Mode;
  const generateMipmap = requireElement(
    document.querySelector<HTMLInputElement>("#mipmap"),
    "mipmap"
  ).checked;
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
  requireElement(runButton, "run-benchmark").disabled = isRunning;
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

function setPlaceholder(which: "direct" | "worker" | "pool") {
  const target = resultFields[which];
  requireElement(target.average, `${which}-average`).textContent = "-";
  if ("perItem" in target && target.perItem) {
    requireElement(target.perItem, `${which}-per-item`).textContent = "-";
  }
  requireElement(target.min, `${which}-min`).textContent = "-";
  requireElement(target.max, `${which}-max`).textContent = "-";
  requireElement(target.size, `${which}-size`).textContent = "-";
  requireElement(target.samples, `${which}-samples`).innerHTML = "";
}

function renderResult(which: "direct" | "worker" | "pool", result: BenchmarkResult) {
  const target = resultFields[which];
  requireElement(target.average, `${which}-average`).textContent = formatMs(result.averageMs);
  if ("perItem" in target && target.perItem) {
    requireElement(target.perItem, `${which}-per-item`).textContent = result.perItemMs
      ? formatMs(result.perItemMs)
      : "-";
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

function buildOptions(config: BenchmarkConfig): IEncodeOptions {
  return {
    isUASTC: config.mode === "uastc",
    qualityLevel: 230,
    enableDebug: false,
    generateMipmap: config.generateMipmap
  };
}

async function loadImageBuffer(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch benchmark image: ${path} (${response.status}).`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function benchmarkMode(
  label: string,
  runs: number,
  input: Uint8Array,
  createTask: (buffer: Uint8Array) => Promise<Uint8Array>
): Promise<BenchmarkResult> {
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

async function benchmarkPool(
  runs: number,
  batchSize: number,
  input: Uint8Array,
  options: IEncodeOptions,
  poolSize: number
): Promise<BenchmarkResult> {
  const pool = createKTX2WorkerPool({ size: poolSize });

  try {
    const samples: number[] = [];
    let outputBytes = 0;

    for (let index = 0; index < runs; index++) {
      setStatus(`Worker pool: batch ${index + 1} of ${runs}...`);
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

async function runBenchmark() {
  const config = getConfig();
  setRunning(true);
  setStatus("Loading image...");

  try {
    const input = await loadImageBuffer(config.imagePath);
    const baseOptions = buildOptions(config);

    const direct = await benchmarkMode("Main thread", config.runs, input, (buffer) =>
      encodeToKTX2(buffer, { ...baseOptions })
    );
    renderResult("direct", direct);

    const worker = await benchmarkMode("Worker", config.runs, input, (buffer) =>
      encodeToKTX2(buffer, { ...baseOptions, worker: workerClient })
    );
    renderResult("worker", worker);

    const pool = await benchmarkPool(config.runs, config.batchSize, input, baseOptions, config.poolSize);
    renderResult("pool", pool);

    setStatus(
      `Done. Direct avg ${formatMs(direct.averageMs)}, worker avg ${formatMs(worker.averageMs)}, pool avg ${formatMs(
        pool.averageMs
      )} for batches of ${config.batchSize} with pool size ${config.poolSize}. Real pool result: ${formatMs(
        pool.perItemMs ?? 0
      )} per texture.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  } finally {
    setRunning(false);
  }
}

requireElement(form, "benchmark-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runBenchmark();
});

requireElement(clearButton, "clear-results").addEventListener("click", () => {
  setPlaceholder("direct");
  setPlaceholder("worker");
  setPlaceholder("pool");
  setStatus("Cleared.");
});

window.addEventListener("beforeunload", () => {
  workerClient.terminate();
});

setPlaceholder("direct");
setPlaceholder("worker");
setPlaceholder("pool");
