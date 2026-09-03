# Screenshot manifest

**Status: done.** Twenty-one captures are cropped, placed, and live: fourteen
from the Claude/ChatGPT launch, plus seven Gemini captures cut 2026-09-03 from
the owner's real Spark walk-through. The social card landed 2026-08-27. This
file is the record of what each capture is and how it was cropped, so a
re-shoot can match.

Raw captures came in at `apps/site/shots-raw/` and were deleted after cropping.
There is no second copy. **If a shot needs re-cutting, it needs re-shooting.**
(Exception: `claude-06-always-allow.png` was cut 2026-08-28 from a capture in
the owner's OneDrive screenshots folder, which may still hold the raw.)

## What is on the page

| File | From | Crop | Size |
|---|---|---|---|
| `hero-claude-answer.png` | a real Claude answer | trimmed to end at the Resolution paragraph | 600 x 554 |
| `claude-01-settings.png` | the account menu | menu plus the initials button; **address redacted** | 320 x 297 |
| `claude-02-add-custom-connector.png` | settings window | dialog only, Add menu open | 782 x 596 |
| `claude-03-url-entered.png` | Add custom connector | the modal only | 446 x 430 |
| `claude-04-connect.png` | not-connected state | right pane only | 617 x 438 |
| `claude-05-connected.png` | connected state | dialog only, six tools visible | 782 x 596 |
| `claude-06-always-allow.png` | MT Tool permissions page, group set to Always allow | left icon rail and space below the list trimmed, scaled from a 2x capture | 782 x 479 |
| `chatgpt-01-developer-mode.png` | Security and login | settings dialog only | 690 x 610 |
| `chatgpt-02-plugins-developer-mode.png` | Plugins settings | settings dialog only | 690 x 610 |
| `chatgpt-03-new-plugin.png` | plugins page | heading, search box, plus button | 800 x 345 |
| `chatgpt-04-form-empty.png` | the empty form | panel only, page bleed trimmed | 432 x 724 |
| `chatgpt-05-risk-warning.png` | the filled form | panel only, warning and checkbox | 420 x 644 |
| `chatgpt-06-connect.png` | the Add DEG card | card only | 584 x 436 |
| `chatgpt-07-connected.png` | connected plugin | sidebar cropped away | 496 x 548 |
| `gemini-01-spark-toggle.png` | Spark home after flipping the switch | sidebar + title strip (y 140-560 of the raw), scaled 0.6; **red highlight box drawn on the Spark toggle** | 786 x 252 |
| `gemini-02-url-entered.png` | Set up a custom connected app dialog | dialog only, DEG URL entered, OAuth fields empty | 520 x 615 |
| `gemini-03-risk-warning.png` | Google's custom-app warning dialog | dialog only, checkbox ticked | 520 x 670 |
| `gemini-04-actions.png` | Save your custom app dialog | dialog only: name "Repairmcp Deg" + six synced actions | 840 x 330 |
| `gemini-05-connected.png` | Custom apps for Spark section | connected card + Add tile | 570 x 270 |
| `gemini-06-use-the-app.png` | Spark routing to the app | prompt bubble + reasoning trail with the app icon | 820 x 400 |
| `gemini-07-answer.png` | the completed answer | right panel, DEG #21350 + MOTOR GTE quote, scaled 0.85 | 782 x 642 |

## The Gemini captures, 2026-09-03

Cut from the owner's real "Custom apps for Spark" walk-through on a personal
@gmail.com account with Google AI Pro (the 2026-08-31 Workspace attempt
confirmed a work sign-in hides the section entirely; no error, just absent).
Raw sources: `C:\Users\ttrav\OneDrive\Pictures\Screenshots\`, files
`Screenshot 2026-09-03 110848.png` through `123831.png` (all 1920x1032); the
raws may persist in OneDrive, so unlike the launch set these can be re-cut.
Every crop starts below y=140 of the raw, which keeps a "ChatGPT started
debugging this browser" banner and all browser chrome out of frame.
`gemini-01` is the one annotated capture on the site: a 5px #9a3412 rectangle
drawn on the Spark toggle before scaling, at the owner's direction, because
the whole flow hides behind that unlabeled switch.

What these captures corrected, same tradition as the launch set: custom apps
connect on the web only (mobile use comes after), the app's name defaults to
the SOURCE's own server name ("Repairmcp Deg") and is editable at the save
dialog, Gemini's vocabulary is "apps" (asking for "the DEG connector" routed
to Google Search; "Use the App Repairmcp Deg" routed to the source), and the
six synced actions screen is the Gemini analog of Claude's Read-only heading
and ChatGPT's READ tags, now cited in the trust section.

1. `gemini-01-connected-apps.png`: the Settings & help menu (or settings page)
   showing the **Connected apps** entry. Crop to the menu/panel.
2. `gemini-02-custom-apps.png`: the **Custom apps for Spark** area with its
   add-a-custom-app control visible.
3. `gemini-03-url-entered.png`: the add dialog with a RepairMCP URL pasted in,
   advanced/sign-in fields visibly untouched.
4. `gemini-04-connected.png`: the source connected, ideally showing whatever
   label Gemini gives it and, if visible, its tool list or read-only marker.
   If Gemini labels tools read-only the way Claude/ChatGPT do, the trust
   section's evidence list should gain a Gemini clause, so look for it.

Same hygiene as always: crop out browser chrome, redact the account email or
avatar if the frame catches it, PNG under 250 KB. **The setup copy in
`index.html` was written from Google's documentation before anyone here had
walked the flow. If the real flow contradicts a step (different menu names,
a name field that does exist, a consent screen), correct the copy to match
reality, the same way the Claude and ChatGPT captures corrected theirs.**

Every capture had its browser chrome removed: tab strips, the address bar, the
extension row, the profile chip, and the conversation sidebars. The only text
that needed painting over was the email address at the top of the Claude account
menu, patched with the panel's own background colour.

The page renders each of these at its **captured size**, capped to the column on
narrow screens. Nothing is upscaled, because upscaling small interface text
turns it to mush. That is why the sizes above vary so much and why that is fine.

## `og-image.png`

**Not a screenshot.** The card that appears when the link is pasted into a
text, an email, or LinkedIn. Done 2026-08-27: 1200 x 630 PNG, 48 KB, rendered
from HTML with headless Chrome (`--headless --window-size=1200,630
--screenshot`). Words only — `RepairMCP` large, accent rule above, then "More
than 22,000 real DEG inquiries, inside Claude and ChatGPT. Cited by inquiry
number and date. Free." and `repairmcp.com` beneath. Ink `#16181d` on off-white
`#fbfaf8`, accent `#9a3412`. It deliberately says "more than 22,000" rather
than an exact count so the weekly corpus refresh cannot stale it. To re-render,
rebuild the same layout in a 1200x630 HTML file and screenshot it the same way.

## If you re-shoot

- PNG, roughly 1x, and crop to the panel rather than the desktop
- Keep it under 250 KB
- Check the frame for anything you would not want public: addresses, workspace
  names, conversation titles, other connectors, tab titles
- Drop it in `public/img/` under the same filename, then `bun run test` and
  `wrangler deploy` from `apps/site`
- If the new crop is a different size, update the `width`/`height` on that
  `<img>` in `index.html` and the entry in
  `scripts/make-placeholder-shots.ts`. Those attributes reserve the space
  before the image loads, so a stale pair means the page jumps while loading.

`scripts/make-placeholder-shots.ts` will never overwrite a file that exists. To
regenerate a placeholder, delete the file first, or pass `--force`.

## What the captures changed

The shots contradicted two things the copy had taken from official
documentation, and both were corrected on the page:

1. **ChatGPT custom connectors worked on a free account.** OpenAI's docs say a
   paid plan is required. The page now says what the docs say and what actually
   happened, and tells people to look before assuming they need to upgrade.
2. **Claude's path is the account menu, then Settings, then Connectors.**
   Anthropic documents it as "Customize > Connectors". Customize turns out to be
   a heading inside the settings window, not a separate menu. The page is now
   definite about it.

They also turned two claims into evidence. Claude files the connector's six
tools under a heading that reads **Read-only tools**, and ChatGPT tags every
action **READ**. The trust section now points at those labels instead of just
asserting that the thing only reads.
