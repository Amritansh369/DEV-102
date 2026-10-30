# Where U Elevate Exam: Chrome extension

Lets a candidate take a proctored exam in Chrome instead of the desktop app. The extension:

- opens an exam tab (toolbar button) where the candidate enters the exam link and password from their email, then one-time code, face check, consent, screen share, the waiting room, the exam itself and the receipt;
- uploads a webcam frame every 2 s and a screen frame every 20 s, autosaves answers and sends heartbeats, like the desktop app;
- reports every visited tab, search and tab switch to `/proctoring/browsing-logs`;
- on AI sites, records what is typed and what the AI answers;
- sends `WINDOW_BLUR` with a picture when the candidate leaves the exam tab or Chrome loses focus (at most once per 10 s).

It signs in through `/auth/invites/login`, so the link locks to one browser, and sessions keep the same OTP and face requirements as the desktop app. Proctor links are refused.

## Release

Bump `version` in `manifest.json`, then run `API_URL=https://<api> npm run release:extension`. The zip goes on the newest GitHub release, and `/download` offers it.

## Build and load

```bash
npm run build -w apps/extension                         # API at http://localhost:4000
API_URL=https://<api> npm run build -w apps/extension   # another API
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick `apps/extension/dist`. Then click the extension's toolbar button.

The manifest's `key` fixes the extension ID to `fgfompcfejncbbpbipjokoniblfihbnm`, and the API accepts that origin by default. If you publish under a different ID, add it to `EXTENSION_IDS` in the API's environment (comma-separated).

## Limits

- Until it is on the Chrome Web Store and Edge Add-ons, candidates install it with Load unpacked. `docs/deploy.md` covers publishing.
- The proctor gets webcam frames and a screen picture every 20 s, but not the desktop app's live screen video.
- Typing is tracked on the AI sites listed in `manifest.json`. A site already open when the exam starts begins tracking after it reloads.
