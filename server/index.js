import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = normalize(join(__dirname, ".."))
const publicDir = join(rootDir, "public")

const host = process.env.HOST || process.env.APP_HOST || "127.0.0.1"
const port = Number(process.env.PORT || process.env.APP_PORT || 4177)
const defaultScannerUrl = "https://scanner.atlas.arkiv-global.net"

const thresholds = {
  chainFreshSeconds: Number(process.env.CHAIN_FRESH_SECONDS || 16),
  chainStaleSeconds: Number(process.env.CHAIN_STALE_SECONDS || 40),
  scannerFreshBlocks: Number(process.env.SCANNER_FRESH_BLOCKS || 4),
  scannerLaggingBlocks: Number(process.env.SCANNER_LAGGING_BLOCKS || 24),
  scannerFreshSeconds: Number(process.env.SCANNER_FRESH_SECONDS || 40),
  serviceSlowMs: Number(process.env.SERVICE_SLOW_MS || 1800),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 6500),
}

const atlasStack = {
  id: "atlas",
  label: "Atlas",
  chainId: "42069",
  rpcUrl: process.env.ATLAS_RPC_URL || "https://rpc.atlas.arkiv-global.net",
  scannerUrl: process.env.ATLAS_SCANNER_URL || defaultScannerUrl,
  scannerApiUrl: process.env.ATLAS_SCANNER_API_URL || `${defaultScannerUrl}/api/blocks?limit=1`,
  scannerTransactionsApiUrl: process.env.ATLAS_SCANNER_TRANSACTIONS_API_URL || `${defaultScannerUrl}/api/transactions?limit=1`,
  faucetUrl: process.env.ATLAS_FAUCET_URL || "https://faucet.atlas.arkiv-global.net",
  notes: ["Atlas scanner freshness is measured from /api/blocks?limit=1."],
}

const plannerUrl = process.env.PLANNER_URL || process.env.ATLAS_PLANNER_URL || ""

const supportServices = [
  {
    id: "payload",
    label: "Payload Provider",
    kind: "status",
    url: process.env.PAYLOAD_PROVIDER_URL || "https://payload.atlas.arkiv-global.net",
    path: "/status",
  },
  {
    id: "decoder",
    label: "Transaction Decoder",
    kind: "status",
    url: process.env.DECODER_URL || "https://decoder.atlas.arkiv-global.net",
    path: "/status",
  },
  ...(plannerUrl ? [{
    id: "planner",
    label: "Protocol Planner",
    kind: "status",
    url: plannerUrl,
    path: "/status",
    optional: true,
  }] : []),
]

const cache = new Map()
const cacheTtlMs = 2500

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
])

function nowIso() {
  return new Date().toISOString()
}

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(body)
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  })
  res.end(body)
}

function stateRank(state) {
  return { healthy: 0, degraded: 1, down: 2, unknown: 3 }[state] ?? 3
}

function worstState(items) {
  const states = items.map((item) => item?.state).filter(Boolean)
  if (states.includes("down")) return "down"
  if (states.includes("degraded")) return "degraded"
  if (states.includes("unknown")) return "unknown"
  return "healthy"
}

function toNumber(value) {
  if (value == null) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "string") {
    if (value.startsWith("0x")) return Number.parseInt(value, 16)
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toDecimalString(value) {
  if (value == null) return null
  if (typeof value === "bigint") return value.toString(10)
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null
  if (typeof value === "string" && value.startsWith("0x")) return BigInt(value).toString(10)
  if (typeof value === "string") return value
  return null
}

function secondsSince(timestamp) {
  if (!timestamp) return null
  const millis = typeof timestamp === "number" ? timestamp * 1000 : Date.parse(timestamp)
  if (!Number.isFinite(millis)) return null
  return Math.max(0, Math.round((Date.now() - millis) / 1000))
}

function blockTimestampToIso(value) {
  const seconds = toNumber(value)
  if (seconds == null) return null
  return new Date(seconds * 1000).toISOString()
}

function classifyChain(ageSeconds, hasError) {
  if (hasError) return "down"
  if (ageSeconds == null) return "unknown"
  if (ageSeconds <= thresholds.chainFreshSeconds) return "healthy"
  if (ageSeconds <= thresholds.chainStaleSeconds) return "degraded"
  return "down"
}

function classifyScanner(lagBlocks, ageSeconds, indexingFinished, hasError, configured) {
  if (!configured) return "unknown"
  if (hasError) return "down"
  if (indexingFinished === false) return "degraded"
  if (lagBlocks == null) return "unknown"
  if (lagBlocks <= thresholds.scannerFreshBlocks && (ageSeconds == null || ageSeconds <= thresholds.scannerFreshSeconds)) {
    return "healthy"
  }
  if (lagBlocks <= thresholds.scannerLaggingBlocks) return "degraded"
  return "down"
}

function classifyService(httpOk, latencyMs, optional, error) {
  if (optional && !httpOk && !error) return "unknown"
  if (!httpOk) return "down"
  if (latencyMs > thresholds.serviceSlowMs) return "degraded"
  return "healthy"
}

function withBaseUrl(base, path) {
  if (!base) return ""
  return `${base.replace(/\/+$/, "")}${path}`
}

function withQueryParam(base, key, value) {
  if (!base || !value) return ""
  try {
    const url = new URL(base)
    url.searchParams.set(key, value)
    return url.toString()
  } catch {
    return `${base.replace(/\/+$/, "")}/?${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  }
}

function createErrorSummary(error) {
  if (!error) return null
  if (error.name === "AbortError") return `Timed out after ${thresholds.requestTimeoutMs}ms`
  return error.message || String(error)
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController()
  const started = performance.now()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || thresholds.requestTimeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "atlas-monitor/0.1",
        ...(options.headers || {}),
      },
    })
    const latencyMs = Math.round(performance.now() - started)
    const contentType = response.headers.get("content-type") || ""
    const raw = await response.text()
    let body = raw
    if (contentType.includes("application/json") || raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      body,
      contentType,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function rpcCall(rpcUrl, method, params = []) {
  const response = await timedFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`)
  }
  if (!response.body || typeof response.body !== "object") {
    throw new Error("RPC returned non-JSON response")
  }
  if (response.body.error) {
    throw new Error(response.body.error.message || JSON.stringify(response.body.error))
  }
  return {
    result: response.body.result,
    latencyMs: response.latencyMs,
    raw: response.body,
  }
}

async function probeChain(network) {
  const checkedAt = nowIso()
  const started = performance.now()
  try {
    const [chainId, latestBlock, entityCount] = await Promise.allSettled([
      rpcCall(network.rpcUrl, "eth_chainId"),
      rpcCall(network.rpcUrl, "eth_getBlockByNumber", ["latest", false]),
      rpcCall(network.rpcUrl, "arkiv_getEntityCount"),
    ])

    if (latestBlock.status === "rejected") {
      throw latestBlock.reason
    }

    const block = latestBlock.value.result || {}
    const height = toNumber(block.number)
    const timestamp = blockTimestampToIso(block.timestamp)
    const ageSeconds = secondsSince(timestamp)
    const state = classifyChain(ageSeconds, false)
    const errors = []
    if (chainId.status === "rejected") errors.push(`eth_chainId: ${createErrorSummary(chainId.reason)}`)
    if (entityCount.status === "rejected") errors.push(`arkiv_getEntityCount: ${createErrorSummary(entityCount.reason)}`)

    return {
      id: "chain",
      label: `${network.label} RPC`,
      state,
      ok: state === "healthy",
      checkedAt,
      latencyMs: Math.round(performance.now() - started),
      url: network.rpcUrl,
      height,
      hash: block.hash || null,
      timestamp,
      ageSeconds,
      chainId: chainId.status === "fulfilled" ? toDecimalString(chainId.value.result) : network.chainId,
      entityCount: entityCount.status === "fulfilled" ? toDecimalString(entityCount.value.result) : null,
      gasUsed: toDecimalString(block.gasUsed),
      gasLimit: toDecimalString(block.gasLimit),
      baseFeePerGas: toDecimalString(block.baseFeePerGas),
      errors,
      raw: {
        chainId: chainId.status === "fulfilled" ? chainId.value.raw : null,
        latestBlock: latestBlock.value.raw,
      },
    }
  } catch (error) {
    return {
      id: "chain",
      label: `${network.label} RPC`,
      state: "down",
      ok: false,
      checkedAt,
      latencyMs: Math.round(performance.now() - started),
      url: network.rpcUrl,
      error: createErrorSummary(error),
      errors: [createErrorSummary(error)],
    }
  }
}

function latestTransactionFromScanner(body, decoderUrl) {
  const transaction = Array.isArray(body?.transactions) ? body.transactions[0] : null
  if (!transaction?.hash) return null
  return {
    hash: transaction.hash,
    blockNumber: toNumber(transaction.blockNumber),
    timestamp: transaction.blockDate || null,
    from: transaction.from || null,
    to: transaction.to || null,
    operationSummary: Array.isArray(transaction.operationsSummary) ? transaction.operationsSummary : [],
    decoderUrl: withQueryParam(decoderUrl, "tx", transaction.hash),
  }
}

async function probeScanner(network, chainHeight, decoderUrl) {
  const checkedAt = nowIso()
  const started = performance.now()
  if (!network.scannerApiUrl) {
    return {
      id: "scanner",
      label: `${network.label} Scanner`,
      state: "unknown",
      ok: false,
      checkedAt,
      latencyMs: 0,
      url: network.scannerUrl || null,
      apiUrl: null,
      configured: false,
      note: "Scanner API URL is not configured for this network.",
    }
  }

  try {
    const [headSettled, txSettled] = await Promise.allSettled([
      timedFetch(network.scannerApiUrl),
      network.scannerTransactionsApiUrl ? timedFetch(network.scannerTransactionsApiUrl) : Promise.resolve(null),
    ])
    if (headSettled.status === "rejected") {
      throw headSettled.reason
    }

    const headResult = headSettled.value
    if (!headResult.ok) {
      throw new Error(`Scanner head HTTP ${headResult.status}`)
    }
    if (!headResult.body || typeof headResult.body !== "object") {
      throw new Error("Scanner returned non-JSON response")
    }

    const names = Array.isArray(headResult.body.names) ? headResult.body.names : []
    const firstBlock = Array.isArray(headResult.body.blocks) ? headResult.body.blocks[0] : null
    const field = (name) => {
      const index = names.indexOf(name)
      return index >= 0 && Array.isArray(firstBlock) ? firstBlock[index] : null
    }

    const scannerHeight = toNumber(field("blockNumber"))
    const timestamp = field("blockDate")
    const ageSeconds = secondsSince(timestamp)
    const lagBlocks = chainHeight != null && scannerHeight != null ? Math.max(0, chainHeight - scannerHeight) : null
    const indexingFinished = firstBlock != null
    const state = classifyScanner(lagBlocks, ageSeconds, indexingFinished, false, true)
    const latestBlock = names.reduce((acc, name, index) => {
      acc[name] = Array.isArray(firstBlock) ? firstBlock[index] : null
      return acc
    }, {})
    const latestTransaction = txSettled.status === "fulfilled" && txSettled.value?.ok
      ? latestTransactionFromScanner(txSettled.value.body, decoderUrl)
      : null
    const errors = []
    if (txSettled.status === "rejected") {
      errors.push(`transactions: ${createErrorSummary(txSettled.reason)}`)
    } else if (txSettled.value && !txSettled.value.ok) {
      errors.push(`transactions: HTTP ${txSettled.value.status}`)
    }

    return {
      id: "scanner",
      label: `${network.label} Scanner`,
      state,
      ok: state === "healthy",
      checkedAt,
      latencyMs: Math.round(performance.now() - started),
      url: network.scannerUrl,
      apiUrl: network.scannerApiUrl,
      transactionsApiUrl: network.scannerTransactionsApiUrl,
      configured: true,
      height: scannerHeight,
      chainHeight,
      lagBlocks,
      timestamp,
      ageSeconds,
      indexingFinished,
      indexedBlocksRatio: null,
      indexedInternalTransactionsRatio: null,
      latestBlockHash: null,
      transactionCount: toNumber(field("transactionCount")),
      latestTransaction,
      totalGasUsed: toDecimalString(field("totalGasUsed")),
      baseBlockFeeWei: toDecimalString(field("baseBlockFeeWei")),
      blockTimeSeconds: toDecimalString(field("blockTimeSeconds")),
      errors,
      raw: {
        latestBlock,
        response: headResult.body,
        latestTransaction: txSettled.status === "fulfilled" ? txSettled.value?.body ?? null : null,
      },
    }
  } catch (error) {
    return {
      id: "scanner",
      label: `${network.label} Scanner`,
      state: "down",
      ok: false,
      checkedAt,
      latencyMs: Math.round(performance.now() - started),
      url: network.scannerUrl,
      apiUrl: network.scannerApiUrl,
      transactionsApiUrl: network.scannerTransactionsApiUrl,
      configured: true,
      error: createErrorSummary(error),
      errors: [createErrorSummary(error)],
    }
  }
}

async function probeSupportService(service) {
  const checkedAt = nowIso()
  if (!service.url) {
    return {
      id: service.id,
      label: service.label,
      state: "unknown",
      ok: false,
      checkedAt,
      latencyMs: 0,
      configured: false,
      optional: Boolean(service.optional),
      note: "No public URL configured yet.",
    }
  }

  const url = withBaseUrl(service.url, service.path || "/status")
  try {
    const response = await timedFetch(url)
    const state = classifyService(response.ok, response.latencyMs, service.optional, null)
    return {
      id: service.id,
      label: service.label,
      state,
      ok: state === "healthy",
      checkedAt,
      latencyMs: response.latencyMs,
      url: service.url,
      statusUrl: url,
      configured: true,
      optional: Boolean(service.optional),
      httpStatus: response.status,
      summary: summarizeService(service.id, response.body),
      raw: response.body,
      errors: response.ok ? [] : [`HTTP ${response.status}`],
    }
  } catch (error) {
    return {
      id: service.id,
      label: service.label,
      state: "down",
      ok: false,
      checkedAt,
      latencyMs: null,
      url: service.url,
      statusUrl: url,
      configured: true,
      optional: Boolean(service.optional),
      error: createErrorSummary(error),
      errors: [createErrorSummary(error)],
    }
  }
}

async function probeFaucet(network) {
  const checkedAt = nowIso()
  if (!network.faucetUrl) {
    return {
      id: "faucet",
      label: `${network.label} Faucet`,
      state: "unknown",
      ok: false,
      checkedAt,
      latencyMs: 0,
      configured: false,
      note: "No faucet URL configured for this network.",
    }
  }

  try {
    const response = await timedFetch(withBaseUrl(network.faucetUrl, "/status"))
    const state = classifyService(response.ok, response.latencyMs, false, null)
    return {
      id: "faucet",
      label: `${network.label} Faucet`,
      state,
      ok: state === "healthy",
      checkedAt,
      latencyMs: response.latencyMs,
      url: network.faucetUrl,
      statusUrl: withBaseUrl(network.faucetUrl, "/status"),
      configured: true,
      httpStatus: response.status,
      summary: summarizeService("faucet", response.body),
      raw: response.body,
      errors: response.ok ? [] : [`HTTP ${response.status}`],
    }
  } catch (error) {
    return {
      id: "faucet",
      label: `${network.label} Faucet`,
      state: "down",
      ok: false,
      checkedAt,
      latencyMs: null,
      url: network.faucetUrl,
      configured: true,
      error: createErrorSummary(error),
      errors: [createErrorSummary(error)],
    }
  }
}

function summarizeService(id, body) {
  if (!body || typeof body !== "object") return null
  if (id === "payload") {
    return {
      payloadCount: body.payloadCount,
      totalBytes: body.totalBytes,
      signingEnabled: body.signingEnabled,
      signerAddress: body.signerAddress,
      maxPayloadBytes: body.maxPayloadBytes,
      latestCount: Array.isArray(body.latest) ? body.latest.length : 0,
    }
  }
  if (id === "decoder") {
    return {
      defaultChainId: body.defaultChainId,
      arkivAddress: body.arkivAddress,
      maxInputBytes: body.maxInputBytes,
      referenceContentType: body.payloadReferenceContentType,
      trustedDefault: body.trustedProviderSigners?.default,
    }
  }
  if (id === "faucet") {
    return {
      chainId: body.chainId,
      faucetAddress: body.faucetAddress,
      dripWei: body.dripWei,
      cooldownSecs: body.cooldownSecs,
      inFlight: body.inFlight,
      queueCapacity: body.queueCapacity,
      powBits: body.pow?.bits,
      powPuzzles: body.pow?.puzzles,
    }
  }
  if (id === "planner") {
    return {
      service: body.service,
      version: body.version,
      scheduleVersion: body.scheduleVersion,
      currentBlock: body.currentBlock,
    }
  }
  return body
}

function summarizeOverall(network, chain, scanner, services) {
  const required = [chain, scanner]
  const requiredState = worstState(required)
  const supportState = worstState(services)
  const state = requiredState !== "healthy" ? requiredState : supportState === "down" ? "degraded" : supportState
  const scannerText = scanner?.state === "healthy"
    ? `scanner lag ${scanner.lagBlocks ?? "?"} blocks`
    : scanner?.state === "unknown"
      ? "scanner URL missing"
      : "scanner needs attention"
  const chainText = chain?.state === "healthy"
    ? `head age ${chain.ageSeconds ?? "?"}s`
    : "chain head needs attention"
  return {
    state,
    label: state === "healthy" ? "Live" : state === "degraded" ? "Watch" : state === "down" ? "Stalled" : "Incomplete",
    summary: `${network.label}: ${chainText}; ${scannerText}`,
  }
}

async function buildSnapshot() {
  const network = atlasStack
  const decoderBase = supportServices.find((service) => service.id === "decoder")?.url
  const cacheKey = network.id
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    return { ...cached.snapshot, cached: true }
  }

  const chain = await probeChain(network)
  const [scanner, serviceResults, faucet] = await Promise.all([
    probeScanner(network, chain.height, decoderBase),
    Promise.all(supportServices.map(probeSupportService)),
    probeFaucet(network),
  ])
  const services = [
    ...serviceResults,
    faucet,
  ].sort((a, b) => stateRank(a.state) - stateRank(b.state) || a.label.localeCompare(b.label))

  const snapshot = {
    generatedAt: nowIso(),
    network: {
      id: network.id,
      label: network.label,
      chainId: network.chainId,
      rpcUrl: network.rpcUrl,
      scannerUrl: network.scannerUrl,
      scannerApiUrl: network.scannerApiUrl,
      scannerTransactionsApiUrl: network.scannerTransactionsApiUrl,
      faucetUrl: network.faucetUrl,
      notes: network.notes,
    },
    thresholds,
    overall: summarizeOverall(network, chain, scanner, services),
    chain,
    scanner,
    services,
  }
  cache.set(cacheKey, { createdAt: Date.now(), snapshot })
  return snapshot
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function handleDecodeProxy(req, res) {
  const decoderBase = supportServices.find((service) => service.id === "decoder")?.url
  if (!decoderBase) {
    json(res, 503, { ok: false, error: "Decoder URL is not configured." })
    return
  }

  const raw = await readRequestBody(req)
  let payload
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = { data: raw }
  }

  try {
    const response = await timedFetch(withBaseUrl(decoderBase, "/decode"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: Math.max(thresholds.requestTimeoutMs, 12000),
    })
    json(res, response.ok ? 200 : response.status || 502, response.body)
  } catch (error) {
    json(res, 502, { ok: false, error: createErrorSummary(error) })
  }
}

async function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname)
  const target = pathname === "/" ? "/index.html" : pathname
  const filePath = normalize(join(publicDir, target))
  if (!filePath.startsWith(publicDir)) {
    text(res, 403, "Forbidden")
    return
  }

  try {
    const body = await readFile(filePath)
    const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream"
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": target === "/index.html" ? "no-store" : "public, max-age=60",
    })
    res.end(body)
  } catch {
    if (!target.includes(".")) {
      const body = await readFile(join(publicDir, "index.html"))
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      })
      res.end(body)
      return
    }
    text(res, 404, "Not found")
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)

  try {
    if (url.pathname === "/healthz") {
      json(res, 200, { ok: true, service: "atlas-monitor", checkedAt: nowIso() })
      return
    }

    if (url.pathname === "/api/config") {
      json(res, 200, {
        stack: {
          id: atlasStack.id,
          label: atlasStack.label,
          chainId: atlasStack.chainId,
          rpcUrl: atlasStack.rpcUrl,
          scannerUrl: atlasStack.scannerUrl,
          scannerTransactionsApiUrl: atlasStack.scannerTransactionsApiUrl,
          faucetUrl: atlasStack.faucetUrl,
        },
        thresholds,
      })
      return
    }

    if (url.pathname === "/api/snapshot") {
      json(res, 200, await buildSnapshot())
      return
    }

    if (url.pathname === "/api/decode" && req.method === "POST") {
      await handleDecodeProxy(req, res)
      return
    }

    if (url.pathname.startsWith("/api/")) {
      json(res, 404, { ok: false, error: "Unknown API endpoint." })
      return
    }

    await serveStatic(req, res, url)
  } catch (error) {
    json(res, 500, { ok: false, error: createErrorSummary(error) })
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res)
})

server.listen(port, host, () => {
  console.log(`Atlas Monitor listening at http://${host}:${port}`)
})
