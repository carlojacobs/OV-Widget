// OV Widget — Tram 12 + Intercity to Utrecht
// Small: tram countdowns | Medium: tram left + trains right

const TEST_MEDIUM = false
const isMedium = config.widgetFamily === "medium" || (config.runsInApp && TEST_MEDIUM)

const TRAM_STOP_ID = "3258885"
const TRAIN_STOP_ID = "2992155"
const UTRECHT_HEADSIGNS = new Set(["Maastricht", "Heerlen", "Nijmegen"])

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDelay(punctuality) {
  if (punctuality === 0) return null
  const sign = punctuality > 0 ? "+" : "-"
  const abs = Math.abs(punctuality)
  if (abs < 60) return `${sign}${abs}s`
  const mins = Math.floor(abs / 60)
  const secs = abs % 60
  if (mins < 60) return `${sign}${mins}m ${String(secs).padStart(2, "0")}s`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${sign}${hours}h ${String(remainMins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`
}

async function fetchJSON(url) {
  const req = new Request(url)
  req.headers = { "X-Requested-With": "XMLHttpRequest" }
  return req.loadJSON()
}

async function getUtrechtTs(trip_id) {
  try {
    const trip = await fetchJSON(`https://ovzoeker.nl/api/trip/${trip_id}`)
    return trip.stop_times?.find(s => s.stop_name === "Utrecht Centraal")?.ts ?? null
  } catch { return null }
}

// ─── Fetch data ──────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)
let tramArrivals = [], trainArrivals = []
let fetchError = false

try {
  const fetches = [fetchJSON(`https://ovzoeker.nl/api/arrivals/${TRAM_STOP_ID}`)]
  if (isMedium) fetches.push(fetchJSON(`https://ovzoeker.nl/api/arrivals/${TRAIN_STOP_ID}`))
  const results = await Promise.all(fetches)

  tramArrivals = results[0].arrivals
    .map(a => ({ ...a, secsAway: a.ts - now }))
    .filter(a => a.secsAway > -60)
    .slice(0, 3)

  if (isMedium && results[1]) {
    const filtered = results[1].arrivals
      .filter(a => UTRECHT_HEADSIGNS.has(a.trip_headsign) && (a.ts - now) > -60)
      .slice(0, 3)
    const utrechtTimes = await Promise.all(filtered.map(a => getUtrechtTs(a.trip_id)))
    trainArrivals = filtered.map((a, i) => ({ ...a, utrechtTs: utrechtTimes[i] }))
  }
} catch(e) {
  fetchError = true
}

// ─── Widget setup ────────────────────────────────────────────────────────────

const widget = new ListWidget()
widget.backgroundColor = new Color("#1a1a2e")
widget.refreshAfterDate = new Date(Date.now() + 30 * 1000)
widget.url = "scriptable:///run/Tram%2012"

// ─── Shared builders ─────────────────────────────────────────────────────────

function addSectionHeader(stack, symbolName, title, badge, fontSize) {
  const row = stack.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  row.spacing = 5
  try {
    const sym = SFSymbol.named(symbolName)
    sym.applyFont(Font.systemFont(fontSize))
    const img = row.addImage(sym.image)
    img.imageSize = new Size(fontSize + 1, fontSize + 1)
    img.tintColor = new Color("#a0a0c0")
  } catch(e) {}
  const t = row.addText(title)
  t.textColor = new Color("#a0a0c0")
  t.font = Font.semiboldSystemFont(fontSize)
  if (badge) {
    const b = row.addStack()
    b.backgroundColor = new Color("#4a90d9")
    b.cornerRadius = 4
    b.setPadding(1, 5, 1, 5)
    b.centerAlignContent()
    const bt = b.addText(badge)
    bt.textColor = Color.white()
    bt.font = Font.boldSystemFont(fontSize)
  }
}

function addFooterRow(stack, fontSize) {
  const row = stack.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const icon = row.addText("↻ ")
  icon.font = Font.systemFont(fontSize)
  icon.textColor = new Color("#808090")
  const timer = row.addDate(new Date())
  timer.applyTimerStyle()
  timer.font = Font.systemFont(fontSize)
  timer.textColor = new Color("#808090")
}

// ─── Layout ──────────────────────────────────────────────────────────────────

if (isMedium) {
  // mainStack as sole child fills full widget frame
  // top inset is added via explicit spacers inside each column
  widget.setPadding(0, 0, 0, 0)
  const mainStack = widget.addStack()
  mainStack.layoutHorizontally()
  mainStack.addSpacer(16)

  // ── Left column: tram ──────────────────────────────────────────────────────
  const leftCol = mainStack.addStack()
  leftCol.layoutVertically()
  leftCol.addSpacer(16)

  addSectionHeader(leftCol, "tram.fill", "Tram", "12", 11)

  if (fetchError || tramArrivals.length === 0) {
    leftCol.addSpacer()
    const msg = leftCol.addText(fetchError ? "⚠︎ No data" : "No trams")
    msg.font = Font.systemFont(11)
    msg.textColor = fetchError ? new Color("#ff6b6b") : Color.white()
    leftCol.addSpacer()
  } else {
    for (const a of tramArrivals) {
      leftCol.addSpacer()
      const row = leftCol.addStack()
      row.layoutHorizontally()
      row.centerAlignContent()
      row.spacing = 4

      const cd = row.addDate(new Date(a.ts * 1000))
      cd.applyTimerStyle()
      cd.font = Font.boldSystemFont(18)
      cd.textColor = Color.white()

      const delay = formatDelay(a.punctuality)
      const isScheduled = a.type !== "actual"
      const parts = []
      if (delay) parts.push({ text: delay, color: a.punctuality > 0 ? new Color("#ff6b6b") : new Color("#50fa7b") })
      if (isScheduled) parts.push({ text: "⚠︎", color: new Color("#808090") })
      if (parts.length > 0) {
        const rs = row.addStack()
        rs.layoutHorizontally()
        rs.centerAlignContent()
        for (let j = 0; j < parts.length; j++) {
          const t = rs.addText((j > 0 ? " " : "") + parts[j].text)
          t.font = Font.systemFont(15)
          t.textColor = parts[j].color
        }
      }
    }
  }

  leftCol.addSpacer()
  addFooterRow(leftCol, 12)
  leftCol.addSpacer(16)

  // ── Gap ───────────────────────────────────────────────────────────────────
  mainStack.addSpacer(16)

  // ── Right column: trains ───────────────────────────────────────────────────
  const rightCol = mainStack.addStack()
  rightCol.layoutVertically()
  rightCol.addSpacer(16)

  addSectionHeader(rightCol, "train.side.front.car", "Amstel → Utrecht", null, 11)

  if (trainArrivals.length === 0) {
    rightCol.addSpacer()
    const n = rightCol.addText("No trains")
    n.textColor = Color.white()
    n.font = Font.systemFont(11)
    rightCol.addSpacer()
  } else {
    for (const a of trainArrivals) {
      rightCol.addSpacer()

      const trainEntry = rightCol.addStack()
      trainEntry.layoutVertically()

      const depRow = trainEntry.addStack()
      depRow.layoutHorizontally()
      depRow.centerAlignContent()
      depRow.spacing = 4

      const dep = depRow.addDate(new Date(a.ts * 1000))
      dep.applyTimeStyle()
      dep.font = Font.boldSystemFont(18)
      dep.textColor = Color.white()

      if (a.punctuality > 0) {
        const d = depRow.addText(formatDelay(a.punctuality))
        d.font = Font.systemFont(10)
        d.textColor = new Color("#ff6b6b")
      }

      if (a.utrechtTs) {
        depRow.addSpacer(6)
        const arrow = depRow.addText("→")
        arrow.font = Font.boldSystemFont(18)
        arrow.textColor = new Color("#404060")
        depRow.addSpacer(6)
        const utr = depRow.addDate(new Date(a.utrechtTs * 1000))
        utr.applyTimeStyle()
        utr.font = Font.boldSystemFont(18)
        utr.textColor = Color.white()
      }

    }
    rightCol.addSpacer()
  }

  rightCol.addSpacer(20)

  // ── Right margin ──────────────────────────────────────────────────────────
  mainStack.addSpacer(16)

} else {
  // ── Small: tram only ────────────────────────────────────────────────────────
  widget.setPadding(16, 16, 16, 16)
  addSectionHeader(widget, "tram.fill", "Tram", "12", 11)

  if (fetchError) {
    widget.addSpacer()
    const e = widget.addText("⚠︎ Could not load data")
    e.textColor = new Color("#ff6b6b")
    e.font = Font.systemFont(12)
    widget.addSpacer()
  } else if (tramArrivals.length === 0) {
    widget.addSpacer()
    const n = widget.addText("No upcoming trams")
    n.textColor = Color.white()
    n.font = Font.systemFont(14)
    widget.addSpacer()
  } else {
    for (const a of tramArrivals) {
      widget.addSpacer()
      const row = widget.addStack()
      row.layoutHorizontally()
      row.centerAlignContent()

      const cd = row.addDate(new Date(a.ts * 1000))
      cd.applyTimerStyle()
      cd.font = Font.boldSystemFont(18)
      cd.textColor = Color.white()

      row.addSpacer()

      const delay = formatDelay(a.punctuality)
      const isScheduled = a.type !== "actual"
      const parts = []
      if (delay) parts.push({ text: delay, color: a.punctuality > 0 ? new Color("#ff6b6b") : new Color("#50fa7b") })
      if (isScheduled) parts.push({ text: "⚠︎", color: new Color("#808090") })
      if (parts.length > 0) {
        const rs = row.addStack()
        rs.layoutHorizontally()
        rs.centerAlignContent()
        for (let i = 0; i < parts.length; i++) {
          const t = rs.addText((i > 0 ? " " : "") + parts[i].text)
          t.font = Font.systemFont(14)
          t.textColor = parts[i].color
        }
      }
    }
  }

  widget.addSpacer()
  addFooterRow(widget, 11)
}

// ─── Present / set ───────────────────────────────────────────────────────────

Script.setWidget(widget)
Script.complete()
