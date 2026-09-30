# AI Bookmark

Highlight anything you read — AI chats or ordinary web pages — add a note, and find it again in one click. Everything stays on your computer.

> **Status:** early prototype, not in the Chrome Web Store yet. Install it yourself with the steps below.

![The side panel listing highlights in a chat](docs/screenshots/chat-panel.jpg)

## What it does

**While you read**
- Select text in any message on **ChatGPT**, **Claude** or **Gemini** and pick a color.
- Switch it on for **any other site** from the toolbar button: blogs, docs, Stack Overflow, GitHub.
- Add a note to any highlight with the ✎ button, or by clicking highlighted text later. Highlights with notes get a dotted underline.
- A side panel lists this page's highlights, numbered in the order you made them. Drag the ⋮⋮ grip to reorder, hover an entry to light up its highlight, click it to jump there.
- Highlighting waits while a reply is still being written.

**Afterwards**
- One library holds every highlight from every site, labelled with where it came from, filterable by site and searchable by text, note, chat name or site.
- Clicking a highlight opens that page and scrolls straight to it, re-using the tab if it's already open.
- Every highlight has a copyable link that lands on the exact spot.
- Export a backup file of everything and import it on another computer.

**When pages change**
- Highlights are found again by their text and its surroundings, so they survive re-renders, edited messages and changed message ids.
- A copy of the text is saved with each highlight, so you keep it even if the chat is deleted.
- If a site changes its layout, the panel says so instead of failing silently.

## Screenshots

| Any web page, with a note | The library |
|---|---|
| ![Highlighting a blog post](docs/screenshots/web-page.jpg) | ![All highlights in one searchable list](docs/screenshots/library.jpg) |

*Screenshots use a sample conversation and a sample article.*

## Install

Requires Node.js 20 or newer.

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3`. Works in Chrome, Edge and Brave.

Open a chat on chatgpt.com, claude.ai or gemini.google.com and select some text. For any other site, click the AI Bookmark button in the toolbar and switch that site on; Chrome will ask you to allow it.

## Keyboard shortcuts

| Keys | What happens |
|---|---|
| `Alt+Shift+H` | Highlight the selected text in yellow |
| `Alt+Shift+N` | Highlight it and open a note |
| `Ctrl+Enter` | Save the note you're writing |
| `Esc` | Close the note without saving |
| `↑` / `↓` on the ⋮⋮ grip | Move a highlight up or down the list |

## Privacy

Everything is stored in your browser, and the extension makes no network requests of any kind. It asks for access to the three chat sites, plus whichever sites you switch on yourself — nothing else. Your backup file is the only copy that leaves the browser, and only when you export one.

## Development

```bash
npm run dev       # Chrome with the extension loaded, rebuilding on save
npm test          # unit tests for anchoring, ordering, search and backups
npm run compile   # type check
npm run build     # production build in .output/chrome-mv3
```

| Piece | Where |
|---|---|
| Site-specific markup — the only part that should break when a site changes | `src/adapters/` |
| Flattening a message's text and mapping offsets to DOM ranges | `src/core/textIndex.ts` |
| Storing a highlight as quote + surrounding context, and finding it again | `src/core/quote.ts` |
| Finding the right message by id, fingerprint or nearby position | `src/core/locate.ts` |
| Painting highlights with the CSS Custom Highlight API, without touching the page | `src/core/painter.ts` |
| Panel order, search, backups | `src/core/order.ts`, `search.ts`, `backup.ts` |
| Page logic: selection, navigation, jumping, storage | `src/content/controller.ts` |
| Panel, toolbar and note card (Preact, in a shadow root) | `src/ui/` |
| Library page, toolbar popup, background script | `src/entrypoints/` |

## Fixing a site that broke

When a site changes its layout, the panel shows a warning. The fix is usually a selector change in that site's adapter, for example `src/adapters/chatgpt.ts`. Each adapter answers the same few questions — where the messages are, which are yours, where a message's text lives, and whether a reply is still being written — so nothing outside that file should need touching.
