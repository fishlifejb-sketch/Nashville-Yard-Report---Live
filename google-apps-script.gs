/**
 * Trailer Yard Report: Google Sheet relay (v5: one send at a time, cleans up overlapping sends)
 *
 * Setup: in your Google Sheet → Extensions → Apps Script. Delete what's there, paste this whole file, save.
 * Pick testSetup next to Run and click Run once (approve access). Then Deploy → New deployment →
 * gear → Web app → Execute as: Me → Who has access: Anyone → Deploy. Send the /exec link to the site.
 */
const SECRET = "yard-72e025507f41";

function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.secret !== SECRET) throw new Error("The secret word in config.js doesn't match the Apps Script.");
    const a = body.args || {};
    if (!a.spreadsheetId) throw new Error("No spreadsheet id was sent.");
    const ss = SpreadsheetApp.openById(a.spreadsheetId);
    if (body.tool === "get_spreadsheet") {
      out = { ok: true, payload: { sheets: ss.getSheets().map(s => ({ properties: { sheetId: s.getSheetId(), title: s.getName(), index: s.getIndex() - 1 } })) } };
    } else if (body.tool === "update_spreadsheet") {
      // Several open pages can send at nearly the same moment; Google runs them one at a time here.
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(120000)) throw new Error("The sheet is busy with another update. It will try again.");
      let n;
      try { n = applyRequests_(ss, a.requests || []); cleanStrays_(ss); }
      finally { lock.releaseLock(); }
      out = { ok: true, payload: { spreadsheetId: a.spreadsheetId, replies: n } };
    } else {
      throw new Error("Unknown action: " + body.tool);
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("Trailer Yard Report sheet relay v5 is running.");
}

// Run once from the editor to approve access.
function testSetup() {
  const ss = SpreadsheetApp.openById(SpreadsheetApp.getActive().getId());
  Logger.log("Working! Sheet: " + ss.getName());
}

/* ---------- applies the site's Google Sheets "batchUpdate" requests using SpreadsheetApp ---------- */
function applyRequests_(ss, requests) {
  const made = {}; // sheetId the site asked for → the sheet actually created
  const sizes = new Map(); // tab sizes, tracked here so Google isn't asked before every change
  const sheetFor = id => {
    if (made[id]) return made[id];
    const s = ss.getSheets().filter(x => x.getSheetId() === id)[0];
    if (!s) throw new Error("Sheet " + id + " not found");
    return s;
  };
  // a tab another send already removed is simply skipped
  const sheetIfThere = id => made[id] || ss.getSheets().filter(x => x.getSheetId() === id)[0] || null;
  // giving a tab a name another tab already has: the older tab with that name is replaced
  const freeName = (name, keep) => {
    const other = ss.getSheetByName(name);
    if (other && other.getSheetId() !== keep.getSheetId()) {
      Object.keys(made).forEach(k => { if (made[k] === other) delete made[k]; });
      sizes.delete(other.getSheetId());
      ss.deleteSheet(other);
    }
  };
  const hex = c => {
    c = c || {};
    const h = v => ("0" + Math.round(Math.max(0, Math.min(1, v || 0)) * 255).toString(16)).slice(-2);
    return "#" + h(c.red) + h(c.green) + h(c.blue);
  };
  // Sheet sizes are tracked here instead of asked of Google each time: every question forces Google to
  // apply all the formatting so far, which made sends slow.
  const dims = sheet => {
    const id = sheet.getSheetId();
    if (!sizes.has(id)) sizes.set(id, { r: sheet.getMaxRows(), c: sheet.getMaxColumns() });
    return sizes.get(id);
  };
  const ensureSize = (sheet, rows, cols) => {
    const d = dims(sheet);
    if (d.r < rows) { sheet.insertRowsAfter(d.r, rows - d.r); d.r = rows; }
    if (d.c < cols) { sheet.insertColumnsAfter(d.c, cols - d.c); d.c = cols; }
  };
  const gridRange = g => {
    const sheet = sheetFor(g.sheetId);
    const r0 = g.startRowIndex || 0, c0 = g.startColumnIndex || 0;
    const r1 = g.endRowIndex != null ? g.endRowIndex : dims(sheet).r;
    const c1 = g.endColumnIndex != null ? g.endColumnIndex : dims(sheet).c;
    if (r1 <= r0 || c1 <= c0) return null;
    ensureSize(sheet, r1, c1);
    return sheet.getRange(r0 + 1, c0 + 1, r1 - r0, c1 - c0);
  };
  const H = { LEFT: "left", CENTER: "center", RIGHT: "right" };
  const V = { TOP: "top", MIDDLE: "middle", BOTTOM: "bottom" };
  const W = { CLIP: SpreadsheetApp.WrapStrategy.CLIP, WRAP: SpreadsheetApp.WrapStrategy.WRAP, OVERFLOW_CELL: SpreadsheetApp.WrapStrategy.OVERFLOW };
  const B = { SOLID: SpreadsheetApp.BorderStyle.SOLID, SOLID_MEDIUM: SpreadsheetApp.BorderStyle.SOLID_MEDIUM, SOLID_THICK: SpreadsheetApp.BorderStyle.SOLID_THICK,
    DOTTED: SpreadsheetApp.BorderStyle.DOTTED, DASHED: SpreadsheetApp.BorderStyle.DASHED, DOUBLE: SpreadsheetApp.BorderStyle.DOUBLE };

  const applyFormat = (rg, f) => {
    if (!rg || !f) return;
    const t = f.textFormat;
    if (t) {
      if (t.fontFamily) rg.setFontFamily(t.fontFamily);
      if (t.fontSize) rg.setFontSize(t.fontSize);
      if (t.bold != null) rg.setFontWeight(t.bold ? "bold" : "normal");
      if (t.italic != null) rg.setFontStyle(t.italic ? "italic" : "normal");
      if (t.foregroundColor) rg.setFontColor(hex(t.foregroundColor));
    }
    if (f.backgroundColor) rg.setBackground(hex(f.backgroundColor));
    if (f.horizontalAlignment && H[f.horizontalAlignment]) rg.setHorizontalAlignment(H[f.horizontalAlignment]);
    if (f.verticalAlignment && V[f.verticalAlignment]) rg.setVerticalAlignment(V[f.verticalAlignment]);
    if (f.wrapStrategy && W[f.wrapStrategy]) rg.setWrapStrategy(W[f.wrapStrategy]);
    if (f.numberFormat && f.numberFormat.pattern) rg.setNumberFormat(f.numberFormat.pattern);
  };
  const cellValue = c => {
    const v = c && c.userEnteredValue;
    if (!v) return "";
    if (v.formulaValue != null) return v.formulaValue;
    if (v.numberValue != null) return v.numberValue;
    if (v.boolValue != null) return v.boolValue;
    if (v.stringValue != null) return v.stringValue === "" ? "" : "'" + v.stringValue; // ' keeps it as text
    return "";
  };

  let n = 0;
  requests.forEach(req => {
    n++;
    if (req.addSheet) {
      const p = req.addSheet.properties || {};
      const clash = p.title && ss.getSheetByName(p.title);
      const name = clash ? p.title + " tmp " + Date.now() : p.title;
      const s = p.index != null ? ss.insertSheet(name, Math.min(p.index, ss.getSheets().length)) : ss.insertSheet(name);
      if (clash) { freeName(p.title, s); s.setName(p.title); }
      const gp = p.gridProperties || {}, d = dims(s);
      if (gp.rowCount) { ensureSize(s, gp.rowCount, 1); if (d.r > gp.rowCount) { s.deleteRows(gp.rowCount + 1, d.r - gp.rowCount); d.r = gp.rowCount; } }
      if (gp.columnCount) { ensureSize(s, 1, gp.columnCount); if (d.c > gp.columnCount) { s.deleteColumns(gp.columnCount + 1, d.c - gp.columnCount); d.c = gp.columnCount; } }
      if (p.sheetId != null) made[p.sheetId] = s;
    } else if (req.deleteSheet) {
      const s = sheetIfThere(req.deleteSheet.sheetId);
      if (!s || ss.getSheets().length < 2) return;
      Object.keys(made).forEach(k => { if (made[k] === s) delete made[k]; });
      sizes.delete(s.getSheetId());
      ss.deleteSheet(s);
    } else if (req.updateSheetProperties) {
      const p = req.updateSheetProperties.properties || {}, s = sheetFor(p.sheetId);
      const fields = String(req.updateSheetProperties.fields || "");
      if (/(^|,)title/.test(fields) && p.title && s.getName() !== p.title) { freeName(p.title, s); s.setName(p.title); }
      if (/hideGridlines/.test(fields) && p.gridProperties) s.setHiddenGridlines(!!p.gridProperties.hideGridlines);
    } else if (req.repeatCell) {
      applyFormat(gridRange(req.repeatCell.range), req.repeatCell.cell && req.repeatCell.cell.userEnteredFormat);
    } else if (req.updateCells) {
      const u = req.updateCells, st = u.start || {}, s = sheetFor(st.sheetId);
      const rows = (u.rows || []).map(r => (r.values || []).map(cellValue));
      const width = Math.max(1, ...rows.map(r => r.length));
      if (!rows.length) return;
      const grid = rows.map(r => r.concat(Array(width - r.length).fill("")));
      ensureSize(s, (st.rowIndex || 0) + grid.length, (st.columnIndex || 0) + width);
      s.getRange((st.rowIndex || 0) + 1, (st.columnIndex || 0) + 1, grid.length, width).setValues(grid);
    } else if (req.mergeCells) {
      const rg = gridRange(req.mergeCells.range);
      if (rg && (rg.getNumRows() > 1 || rg.getNumColumns() > 1)) rg.merge();
    } else if (req.updateBorders) {
      const u = req.updateBorders, rg = gridRange(u.range);
      if (!rg) return;
      const side = (b, args) => {
        if (!b || !B[b.style]) return;
        const col = hex((b.colorStyle && b.colorStyle.rgbColor) || b.color);
        rg.setBorder(args[0], args[1], args[2], args[3], args[4], args[5], col, B[b.style]);
      };
      side(u.innerHorizontal, [null, null, null, null, null, true]);
      side(u.innerVertical, [null, null, null, null, true, null]);
      side(u.top, [true, null, null, null, null, null]);
      side(u.bottom, [null, null, true, null, null, null]);
      side(u.left, [null, true, null, null, null, null]);
      side(u.right, [null, null, null, true, null, null]);
    } else if (req.updateDimensionProperties) {
      const u = req.updateDimensionProperties, r = u.range || {}, s = sheetFor(r.sheetId);
      const px = u.properties && u.properties.pixelSize, a = (r.startIndex || 0) + 1, cnt = (r.endIndex || a) - (r.startIndex || 0);
      if (!px || cnt <= 0) return;
      if (r.dimension === "COLUMNS") { ensureSize(s, 1, a + cnt - 1); s.setColumnWidths(a, cnt, px); }
      else { ensureSize(s, a + cnt - 1, 1); s.setRowHeightsForced(a, cnt, px); }
    }
  });
  SpreadsheetApp.flush();
  return n;
}

// Removes leftover copies from sends that overlapped: "10-08-2026 new 123…", "… tmp …" and Google's "_conflict" copies,
// but only when the real tab with that name is there.
function cleanStrays_(ss) {
  const names = new Set(ss.getSheets().map(s => s.getName()));
  ss.getSheets().forEach(s => {
    const m = s.getName().match(/^(.+?)(?: new \d+| tmp \d+|_conflict\d+)$/);
    if (m && names.has(m[1]) && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}
