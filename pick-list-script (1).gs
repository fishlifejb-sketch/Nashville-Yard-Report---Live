/**
 * Champ Sets NC: warehouse pick list
 * Netlify sends every website order here; each tire becomes one row.
 *
 * Paste this whole file into your Google Sheet: Extensions > Apps Script.
 * Then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */

// Private key. The Netlify webhook URL must end with ?key= followed by this.
const SECRET = '9e6a6a6be1a20dbddd158d095ea43938';

const SHEET_NAME = 'Pick List';
const HEADERS = ['Order time', 'Order #', 'Customer', 'Phone', 'Note', 'Bay',
                 'Size', 'Load/Speed', 'Brand', 'Model', 'Condition', 'Tread (/32)',
                 'Serial #', 'Price', 'Picked', 'Submission ID'];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i + 1]));

function doPost(e) {
  if (!e || !e.parameter || e.parameter.key !== SECRET) return reply_('forbidden');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    addOrder_(payload);
    return reply_('ok');
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app link in a browser shows this, to confirm it's running.
function doGet() {
  return reply_('Pick list webhook is running.');
}

function addOrder_(payload) {
  const d = payload.data || payload;
  if (payload.form_name && payload.form_name !== 'order') return;

  const sh = sheet_();
  const id = String(payload.id || '');

  // Netlify can retry a webhook; never add the same order twice.
  if (id && sh.getLastRow() > 1) {
    const ids = sh.getRange(2, COL['Submission ID'], sh.getLastRow() - 1, 1).getValues().flat().map(String);
    if (ids.indexOf(id) !== -1) return;
  }

  const when = payload.created_at ? new Date(payload.created_at) : new Date();
  const base = [when, payload.number || '', d.name || '', d.phone || '', d.note || ''];

  let tires = [];
  try { tires = JSON.parse(d.picklist || '[]'); } catch (err) { tires = []; }

  // Walk the warehouse in order: sort this order's tires by bay (tires with no bay go last).
  tires.sort((a, b) => (a.bay || '\uffff').localeCompare(b.bay || '\uffff', 'en', { numeric: true }));

  const rows = tires.length
    ? tires.map(t => base.concat([
        t.bay || '', t.size || '', t.ls || '', t.brand || '', t.model || '', t.cond || '',
        t.tread == null ? '' : t.tread, t.serial || '', t.price == null ? '' : t.price, false, id]))
    // Older order without the per-tire list: keep the full order text so nothing is lost.
    : [base.concat(['', '', '', '', String(d.order || '').slice(0, 45000), '', '', '', '', false, id])];

  const start = sh.getLastRow() + 1;
  const range = sh.getRange(start, 1, rows.length, HEADERS.length);
  // Phone and serial numbers stay as text so leading zeros aren't lost.
  sh.getRange(start, COL['Phone'], rows.length, 1).setNumberFormat('@');
  sh.getRange(start, COL['Serial #'], rows.length, 1).setNumberFormat('@');
  range.setValues(rows);
  sh.getRange(start, COL['Order time'], rows.length, 1).setNumberFormat('ddd m/d h:mm am/pm');
  sh.getRange(start, COL['Price'], rows.length, 1).setNumberFormat('$#,##0.00');
  sh.getRange(start, COL['Picked'], rows.length, 1).insertCheckboxes();

  // Shade alternate orders so each order's tires read as one group.
  const prev = start > 2 ? sh.getRange(start - 1, 1).getBackground() : '#f3f6f4';
  const shade = prev === '#ffffff' ? '#f3f6f4' : '#ffffff';
  range.setBackground(shade);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#0e5160').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, HEADERS.length, 110);
    sh.setColumnWidth(COL['Model'], 180);
    sh.setColumnWidth(COL['Serial #'], 190);
    sh.setColumnWidth(COL['Note'], 180);
    sh.setColumnWidth(COL['Bay'], 140);
    sh.hideColumns(COL['Submission ID']);
    pickedRule_(sh);
  } else if (sh.getRange(1, COL['Bay']).getValue() !== 'Bay') {
    // Sheet made by the first version of this script: add the Bay column in place.
    sh.insertColumnBefore(COL['Bay']);
    sh.getRange(1, COL['Bay']).setValue('Bay')
      .setFontWeight('bold').setBackground('#0e5160').setFontColor('#ffffff');
    sh.setColumnWidth(COL['Bay'], 140);
    pickedRule_(sh);
  }
  return sh;
}

// Picked rows turn green and get struck through.
function pickedRule_(sh) {
  const all = sh.getRange(2, 1, sh.getMaxRows() - 1, HEADERS.length);
  const picked = String.fromCharCode(65 + COL['Picked'] - 1);
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + picked + '2=TRUE')
    .setBackground('#d9ead3').setStrikethrough(true)
    .setRanges([all]).build()]);
}

function reply_(text) {
  return ContentService.createTextOutput(text);
}

/** Run this once from the editor to see a sample order land in the sheet. Delete the rows after. */
function testOrder() {
  addOrder_({
    id: 'test-' + Date.now(), number: 'TEST', form_name: 'order', created_at: new Date().toISOString(),
    data: {
      name: 'Test Buyer', phone: '919-555-0100', note: 'Sample order, delete me',
      picklist: JSON.stringify([
        { serial: 'S434384_2924_00', size: '225/65R17', ls: '102H', brand: 'Dextero', model: 'Touring DTR1', cond: 'Used', tread: 8, price: 44.79, bay: 'NC-BAY41-01-36' },
        { serial: 'S451389_5125_00', size: '225/65R17', ls: '102H', brand: 'Dextero', model: 'Touring DTR1', cond: 'Used', tread: 9, price: 47.18, bay: 'NC-BAY03-05-12' }
      ])
    }
  });
}
