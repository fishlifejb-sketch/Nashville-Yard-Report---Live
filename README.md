# Trailer Yard Report

The yard sheet + employee Clicker, as its own website (GitHub + Netlify), same as the Claude version.

What changed from the Claude version: only the behind-the-scenes plumbing.

| In Claude it used… | On this site it uses… |
|---|---|
| Claude's shared database | **Firebase Firestore** (free), live across every phone |
| Claude sign-in | Each phone/computer gets its own id automatically. No passwords. |
| Google Sheets connector | A small **Google Apps Script** you paste into your Google account (optional) |

## Files

| File | What it is |
|---|---|
| `index.html` | The app (unchanged look and features) |
| `config.js` | **Your settings**: the only file you edit |
| `backend.js` | Connects the app to Firebase and the Google Sheet relay |
| `firestore.rules` | Database security rules to paste into Firebase |
| `google-apps-script.gs` | Google Sheet relay to paste into Apps Script |
| `netlify.toml` | Tells Netlify there's no build step |

---

## Part 1: Firebase (the shared database), about 10 minutes

1. Go to **console.firebase.google.com** and sign in with your Google account.
2. **Create a project** (any name, e.g. `trailer-yard`). You can turn Google Analytics off.
3. **Turn on sign-in:** left menu → *Build* → **Authentication** → *Get started* → *Sign-in method* tab → **Anonymous** → Enable → Save.
4. **Create the database:** *Build* → **Firestore Database** → *Create database* → pick a US location → *Start in production mode* → Create.
5. **Paste the rules:** in Firestore, open the **Rules** tab, delete everything, paste all of `firestore.rules`, click **Publish**.
6. **Get your keys:** gear icon → **Project settings** → *General* → scroll to *Your apps* → click the **web icon `</>`** → give it a nickname → Register (skip Firebase Hosting). It shows a `firebaseConfig = { … }` block.
7. Open `config.js` and copy each value (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) between the matching quotes.

> The Firebase `apiKey` is meant to be public. It's safe in GitHub; the rules from step 5 are what protect the data.

## Part 2: GitHub + Netlify (same as your champ set builder)

1. On GitHub, create a **new repository** (e.g. `trailer-yard-report`).
2. Click **uploading an existing file**, drag in **all the files from this folder** (with your edited `config.js`), and Commit.
3. In Netlify: **Add new site → Import an existing project → GitHub** → pick the repo.
   Leave the build command **empty** and the publish directory **empty** (or `.`) → **Deploy**.
4. Back in Firebase → **Authentication → Settings → Authorized domains → Add domain** → add your Netlify address (e.g. `trailer-yard-report.netlify.app`).

From now on, any change you commit to GitHub goes live on Netlify automatically.

## Part 3: First open (this makes you the owner)

**Open your Netlify link on your own phone or computer first** (the plain link, not an employee link).
The first device that opens it becomes the **owner**: it always gets the yard sheet and is the only one that can mark managers.

- **Add employees:** Employees tab → type a name → copy their link → text it to them. Employee links open straight to the Clicker.
- **More managers:** have the person open the plain site link once, then on your device go to Employees → Managers → **Make manager**. (Anyone can also pick *Manager* on the Who's logging screen, same as before.)
- **Owner on a new device:** in Firebase → Firestore → `owner` collection → delete the `main` document, then open the site on the new device first.

## Part 4: Google Sheet updates (optional)

1. Go to **script.google.com** → **New project**. Delete what's there and paste all of `google-apps-script.gs`.
2. On the `SECRET` line near the top, change `change-this-word` to a word only you know.
3. Left sidebar: **Services (+)** → **Google Sheets API** → Add.
4. **Deploy → New deployment** → gear → **Web app**. Set *Execute as:* **Me**, *Who has access:* **Anyone** → Deploy. Approve the permissions (if it warns the app isn't verified: *Advanced → Go to project*).
5. Copy the **Web app URL** (ends in `/exec`). In `config.js`, paste it into `sheetRelayUrl`, and put your secret word in `sheetRelaySecret`. Commit the change on GitHub.
6. On the site's Yard sheet, paste your Google Sheet's link in the Google Sheet box → **Save link**. It fills the day's tab and keeps it updated whenever the yard changes while a manager page is open.

Use a Google account that owns or can edit that spreadsheet.

---

## Good to know

- **Fresh start:** this site has its own database, so employees and trailers from the Claude version don't carry over. Re-add your employees (their links will be new).
- **Who can get in:** anyone with the site address can open it, like a Claude page shared as *Anyone with the link*. Only share employee links with your crew.
- **Cost:** Firebase's free plan (Spark) easily covers a yard's daily traffic. Netlify and Apps Script are free too.
- **Checking it's working:** the top right of the page shows **Live** with a green dot when connected. If config.js isn't filled in, a banner says so.
