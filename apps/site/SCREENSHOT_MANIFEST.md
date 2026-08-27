# Screenshot manifest

**Status: done.** Thirteen captures are cropped, placed, and live on the
preview, and the social card landed 2026-08-27. This file is now the record of
what each one is and how it was cropped, so a re-shoot can match.

Raw captures came in at `apps/site/shots-raw/` and were deleted after cropping.
There is no second copy. **If a shot needs re-cutting, it needs re-shooting.**

## What is on the page

| File | From | Crop | Size |
|---|---|---|---|
| `hero-claude-answer.png` | a real Claude answer | trimmed to end at the Resolution paragraph | 600 x 554 |
| `claude-01-settings.png` | the account menu | menu plus the initials button; **address redacted** | 320 x 297 |
| `claude-02-add-custom-connector.png` | settings window | dialog only, Add menu open | 782 x 596 |
| `claude-03-url-entered.png` | Add custom connector | the modal only | 446 x 430 |
| `claude-04-connect.png` | not-connected state | right pane only | 617 x 438 |
| `claude-05-connected.png` | connected state | dialog only, six tools visible | 782 x 596 |
| `chatgpt-01-developer-mode.png` | Security and login | settings dialog only | 690 x 610 |
| `chatgpt-02-plugins-developer-mode.png` | Plugins settings | settings dialog only | 690 x 610 |
| `chatgpt-03-new-plugin.png` | plugins page | heading, search box, plus button | 800 x 345 |
| `chatgpt-04-form-empty.png` | the empty form | panel only, page bleed trimmed | 432 x 724 |
| `chatgpt-05-risk-warning.png` | the filled form | panel only, warning and checkbox | 420 x 644 |
| `chatgpt-06-connect.png` | the Add DEG card | card only | 584 x 436 |
| `chatgpt-07-connected.png` | connected plugin | sidebar cropped away | 496 x 548 |

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
