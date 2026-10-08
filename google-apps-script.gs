/**
 * Trailer Yard Report: Google Sheet relay
 *
 * Lets the website update your Google Sheet. Setup (see README.md, Part 3):
 *   1. Go to script.google.com → New project, delete what's there, paste this whole file.
 *   2. Change SECRET below to a word only you know. Put the same word in config.js → sheetRelaySecret.
 *   3. Left sidebar: Services (+) → Google Sheets API → Add.
 *   4. Deploy → New deployment → type: Web app → Execute as: Me → Who has access: Anyone → Deploy.
 *      Approve the permissions it asks for. Copy the Web app URL (ends in /exec) into config.js → sheetRelayUrl.
 *
 * If you change this code later, use Deploy → Manage deployments → Edit (pencil) → Version: New version,
 * so the URL stays the same.
 */
const SECRET = "change-this-word";

function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!SECRET || SECRET === "change-this-word") throw new Error("Set SECRET in the Apps Script first.");
    if (body.secret !== SECRET) throw new Error("The secret word in config.js doesn't match the Apps Script.");
    const a = body.args || {};
    if (!a.spreadsheetId) throw new Error("No spreadsheet id was sent.");

    if (body.tool === "get_spreadsheet") {
      const fields = Array.isArray(a.fields) && a.fields.length ? a.fields.join(",") : "sheets.properties";
      out = { ok: true, payload: Sheets.Spreadsheets.get(a.spreadsheetId, { fields: fields }) };
    } else if (body.tool === "update_spreadsheet") {
      const requests = a.requests || [];
      const res = requests.length ? Sheets.Spreadsheets.batchUpdate({ requests: requests }, a.spreadsheetId) : {};
      out = { ok: true, payload: { spreadsheetId: a.spreadsheetId, replies: (res.replies || []).length } };
    } else {
      throw new Error("Unknown action: " + body.tool);
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the /exec link in a browser shows this, so you can check the deployment is live.
function doGet() {
  return ContentService.createTextOutput("Trailer Yard Report sheet relay is running.");
}
