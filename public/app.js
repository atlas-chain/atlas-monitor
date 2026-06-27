const state = {
  config: null,
  network: "braga",
  snapshot: null,
  selected: null,
  chainHistory: [],
  mouse: { x: -1, y: -1 },
  nodes: [],
  refreshTimer: null,
}

const els = {
  networkTabs: document.querySelector("#networkTabs"),
  refreshButton: document.querySelector("#refreshButton"),
  signalCore: document.querySelector("#signalCore"),
  overallLabel: document.querySelector("#overallLabel"),
  overallSummary: document.querySelector("#overallSummary"),
  headHeight: document.querySelector("#headHeight"),
  headAge: document.querySelector("#headAge"),
  scannerLag: document.querySelector("#scannerLag"),
  entityCount: document.querySelector("#entityCount"),
  chainTitle: document.querySelector("#chainTitle"),
  chainState: document.querySelector("#chainState"),
  blockStrip: document.querySelector("#blockStrip"),
  chainId: document.querySelector("#chainId"),
  chainLatency: document.querySelector("#chainLatency"),
  gasUsed: document.querySelector("#gasUsed"),
  blockHash: document.querySelector("#blockHash"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerState: document.querySelector("#scannerState"),
  lagFill: document.querySelector("#lagFill"),
  scannerHeight: document.querySelector("#scannerHeight"),
  indexedRatio: document.querySelector("#indexedRatio"),
  scannerAge: document.querySelector("#scannerAge"),
  scannerApi: document.querySelector("#scannerApi"),
  updatedAt: document.querySelector("#updatedAt"),
  canvas: document.querySelector("#constellation"),
  serviceList: document.querySelector("#serviceList"),
  decodeButton: document.querySelector("#decodeButton"),
  decodeInput: document.querySelector("#decodeInput"),
  decodeChainId: document.querySelector("#decodeChainId"),
  decodeOutput: document.querySelector("#decodeOutput"),
  detailTitle: document.querySelector("#detailTitle"),
  detailLink: document.querySelector("#detailLink"),
  detailJson: document.querySelector("#detailJson"),
}

const colors = {
  healthy: "#7ee787",
  degraded: "#ffbe55",
  down: "#ff6b8a",
  unknown: "#b69cff",
  line: "#3b3832",
  ink: "#f7f7f2",
  muted: "#aaa79b",
  page: "#11100e",
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-"
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat().format(number)
}

function formatSeconds(value) {
  if (value === null || value === undefined) return "-"
  if (value < 60) return `${value}s`
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}m ${seconds}s`
}

function formatBytes(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return "-"
  const units = ["B", "KB", "MB", "GB"]
  let size = number
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function setStateClass(el, value) {
  el.className = `state-pill state-${value || "unknown"}`
  el.textContent = value || "unknown"
}

function serviceLine(service) {
  if (!service) return "-"
  if (service.id === "payload" && service.summary) {
    return `${formatNumber(service.summary.payloadCount)} payloads, ${formatBytes(service.summary.totalBytes)}`
  }
  if (service.id === "decoder" && service.summary) {
    return `chain ${service.summary.defaultChainId}, ${formatBytes(service.summary.maxInputBytes)} max`
  }
  if (service.id === "faucet" && service.configured) {
    return `${service.httpStatus || "-"} in ${service.latencyMs ?? "-"}ms`
  }
  if (service.id === "explorer" && service.summary) {
    return `${service.summary.lagBlocks ?? "?"} blocks behind`
  }
  if (service.note) return service.note
  if (service.latencyMs != null) return `${service.latencyMs}ms`
  return service.error || "-"
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`)
  }
  return body
}

function renderNetworkTabs() {
  const networks = state.config?.networks || [
    { id: "braga", label: "Braga" },
    { id: "atlas", label: "Atlas" },
  ]
  els.networkTabs.innerHTML = ""
  for (const network of networks) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = network.label
    button.setAttribute("aria-pressed", String(network.id === state.network))
    button.title = network.scannerConfigured ? "Scanner configured" : "Scanner URL missing"
    button.addEventListener("click", () => {
      state.network = network.id
      state.selected = null
      renderNetworkTabs()
      void refresh()
    })
    els.networkTabs.append(button)
  }
}

function rememberHeight(height, chainState) {
  if (height == null) return
  const last = state.chainHistory.at(-1)
  if (!last || last.height !== height) {
    state.chainHistory.push({ height, state: chainState, at: Date.now() })
  } else {
    last.state = chainState
  }
  state.chainHistory = state.chainHistory.slice(-32)
}

function renderBlockStrip() {
  const history = state.chainHistory
  els.blockStrip.innerHTML = ""
  const total = 32
  for (let i = 0; i < total; i += 1) {
    const item = history[history.length - total + i]
    const bar = document.createElement("span")
    const age = item ? Math.max(0, Date.now() - item.at) / 1000 : 99
    const freshness = Math.max(0.16, 1 - age / 80)
    const height = item ? 16 + ((item.height % 13) * 4) : 8
    bar.style.height = `${height}px`
    bar.style.opacity = String(freshness)
    bar.style.background = item ? `linear-gradient(180deg, ${colors[item.state] || colors.unknown}, rgba(107, 214, 255, 0.28))` : "#24221e"
    els.blockStrip.append(bar)
  }
}

function renderSnapshot() {
  const snapshot = state.snapshot
  if (!snapshot) return
  const { overall, chain, scanner, services } = snapshot
  const signal = colors[overall.state] || colors.unknown
  els.signalCore.style.setProperty("--signal", signal)
  els.overallLabel.textContent = overall.label
  els.overallSummary.textContent = overall.summary
  els.headHeight.textContent = formatNumber(chain.height)
  els.headAge.textContent = formatSeconds(chain.ageSeconds)
  els.scannerLag.textContent = scanner.lagBlocks == null ? "-" : `${formatNumber(scanner.lagBlocks)} blocks`
  els.entityCount.textContent = formatNumber(chain.entityCount)
  els.chainTitle.textContent = chain.label
  setStateClass(els.chainState, chain.state)
  els.chainId.textContent = chain.chainId || "-"
  els.chainLatency.textContent = chain.latencyMs == null ? "-" : `${chain.latencyMs}ms`
  els.gasUsed.textContent = chain.gasUsed && chain.gasLimit ? `${formatNumber(chain.gasUsed)} / ${formatNumber(chain.gasLimit)}` : "-"
  els.blockHash.textContent = chain.hash || "-"
  els.scannerTitle.textContent = scanner.label
  setStateClass(els.scannerState, scanner.state)
  els.scannerHeight.textContent = formatNumber(scanner.height)
  els.indexedRatio.textContent = scanner.indexedBlocksRatio ? `${Math.round(Number(scanner.indexedBlocksRatio) * 100)}%` : "-"
  els.scannerAge.textContent = formatSeconds(scanner.ageSeconds)
  els.scannerApi.textContent = scanner.configured ? "configured" : "missing"
  const lag = scanner.lagBlocks == null ? 0 : Math.min(100, (scanner.lagBlocks / snapshot.thresholds.scannerLaggingBlocks) * 100)
  els.lagFill.style.width = `${lag}%`
  els.updatedAt.textContent = new Date(snapshot.generatedAt).toLocaleTimeString()
  rememberHeight(chain.height, chain.state)
  renderBlockStrip()
  renderServices(services)
  renderDetail()
}

function selectItem(item) {
  state.selected = item
  renderServices(state.snapshot?.services || [])
  renderDetail()
}

function renderServices(services) {
  els.serviceList.innerHTML = ""
  const items = [state.snapshot.chain, state.snapshot.scanner, ...services]
  for (const service of items) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `service-card state-${service.state || "unknown"}${state.selected?.id === service.id ? " active" : ""}`
    button.innerHTML = `
      <strong>${service.label}</strong>
      <span>${service.state || "unknown"} - ${service.latencyMs == null ? "-" : `${service.latencyMs}ms`}</span>
      <span>${serviceLine(service)}</span>
    `
    button.addEventListener("click", () => selectItem(service))
    els.serviceList.append(button)
  }
}

function renderDetail() {
  const selected = state.selected || state.snapshot?.chain
  if (!selected) return
  els.detailTitle.textContent = selected.label || selected.id || "Signal"
  if (selected.url) {
    els.detailLink.href = selected.url
    els.detailLink.style.visibility = "visible"
  } else {
    els.detailLink.href = "#"
    els.detailLink.style.visibility = "hidden"
  }
  els.detailJson.textContent = safeJson(selected)
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(320, Math.round(rect.width * ratio))
  const height = Math.max(220, Math.round(rect.height * ratio))
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width
    els.canvas.height = height
  }
}

function createNodes(snapshot, width, height) {
  if (!snapshot) return []
  const services = [snapshot.scanner, ...snapshot.services]
  const center = {
    id: "chain",
    label: "RPC",
    item: snapshot.chain,
    x: width * 0.5,
    y: height * 0.5,
    r: 34,
  }
  const ringRadius = Math.min(width, height) * 0.34
  const nodes = [center]
  services.forEach((service, index) => {
    const angle = -Math.PI / 2 + (index / services.length) * Math.PI * 2
    nodes.push({
      id: service.id,
      label: service.label.replace(snapshot.network.label, "").trim() || service.label,
      item: service,
      x: center.x + Math.cos(angle) * ringRadius * (index % 2 ? 1.05 : 0.88),
      y: center.y + Math.sin(angle) * ringRadius,
      r: service.id === "scanner" ? 28 : 23,
    })
  })
  return nodes
}

function drawConstellation(time = 0) {
  resizeCanvas()
  const ctx = els.canvas.getContext("2d")
  const width = els.canvas.width
  const height = els.canvas.height
  const ratio = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = colors.page
  ctx.fillRect(0, 0, width, height)

  const snapshot = state.snapshot
  state.nodes = createNodes(snapshot, width, height)
  if (!snapshot) {
    requestAnimationFrame(drawConstellation)
    return
  }

  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = colors.line
  for (let x = 0; x < width; x += 54 * ratio) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y < height; y += 54 * ratio) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()

  const center = state.nodes[0]
  for (const node of state.nodes.slice(1)) {
    const color = colors[node.item.state] || colors.unknown
    ctx.strokeStyle = color
    ctx.globalAlpha = node.item.state === "healthy" ? 0.34 : 0.62
    ctx.lineWidth = node.item.id === "scanner" ? 2.4 * ratio : 1.2 * ratio
    ctx.beginPath()
    ctx.moveTo(center.x, center.y)
    ctx.lineTo(node.x, node.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  for (const node of state.nodes) {
    const item = node.item
    const color = colors[item.state] || colors.unknown
    const hovered = distance(state.mouse, node) <= node.r + 10 * ratio
    const selected = state.selected?.id === item.id
    const pulse = 1 + Math.sin(time / 420 + node.x) * 0.08
    ctx.beginPath()
    ctx.arc(node.x, node.y, (node.r + (selected ? 7 : hovered ? 5 : 0)) * pulse, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = selected || hovered ? 0.2 : 0.1
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fillStyle = "#171613"
    ctx.fill()
    ctx.lineWidth = (selected ? 3 : 2) * ratio
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, Math.max(4 * ratio, node.r * 0.18), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.ink
    ctx.font = `${Math.max(11 * ratio, 13)}px ui-sans-serif, system-ui`
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    wrapCanvasText(ctx, node.label, node.x, node.y + node.r + 9 * ratio, 116 * ratio, 16 * ratio)
  }

  requestAnimationFrame(drawConstellation)
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/)
  let line = ""
  let offset = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + offset)
      line = word
      offset += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y + offset)
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

async function refresh() {
  clearTimeout(state.refreshTimer)
  try {
    const snapshot = await fetchJson(`/api/snapshot?network=${encodeURIComponent(state.network)}`)
    state.snapshot = snapshot
    if (!state.selected) state.selected = snapshot.chain
    if (state.selected) {
      const nextSelected = [snapshot.chain, snapshot.scanner, ...snapshot.services].find((item) => item.id === state.selected.id)
      state.selected = nextSelected || snapshot.chain
    }
    renderSnapshot()
  } catch (error) {
    els.overallLabel.textContent = "Probe failed"
    els.overallSummary.textContent = error.message
  } finally {
    state.refreshTimer = setTimeout(refresh, 5000)
  }
}

async function decodeTransaction() {
  const data = els.decodeInput.value.trim()
  const chainId = Number(els.decodeChainId.value.trim() || 42069)
  els.decodeOutput.textContent = safeJson({ status: "decoding" })
  try {
    const result = await fetchJson("/api/decode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data, chainId }),
    })
    els.decodeOutput.textContent = safeJson(result)
  } catch (error) {
    els.decodeOutput.textContent = safeJson({ ok: false, error: error.message })
  }
}

async function init() {
  try {
    state.config = await fetchJson("/api/config")
  } catch {
    state.config = null
  }
  renderNetworkTabs()
  els.refreshButton.addEventListener("click", () => refresh())
  els.decodeButton.addEventListener("click", decodeTransaction)
  els.canvas.addEventListener("mousemove", (event) => {
    const rect = els.canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    state.mouse = {
      x: (event.clientX - rect.left) * ratio,
      y: (event.clientY - rect.top) * ratio,
    }
  })
  els.canvas.addEventListener("mouseleave", () => {
    state.mouse = { x: -1, y: -1 }
  })
  els.canvas.addEventListener("click", () => {
    const ratio = window.devicePixelRatio || 1
    const hit = state.nodes.find((node) => distance(state.mouse, node) <= node.r + 10 * ratio)
    if (hit) selectItem(hit.item)
  })
  window.addEventListener("resize", resizeCanvas)
  requestAnimationFrame(drawConstellation)
  await refresh()
}

void init()
