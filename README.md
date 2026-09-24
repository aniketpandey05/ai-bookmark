# Chatmarks

Highlight anything in your AI chats, find it again in one click, and keep it even if the chat changes.

> **Status:** early prototype. Works on ChatGPT; Claude and Gemini are next. Chatmarks is a working name.

## What works today

- Select text in any ChatGPT message and pick a color to highlight it.
- Highlights come back when you reopen the chat, even after the page re-renders or message ids change.
- Add a note to any highlight: use the ✎ button when highlighting, click highlighted text later, or use the ✎ in the panel. Highlights with notes get a dotted underline.
- A side panel lists the highlights and notes in the current chat, numbered in the order you made them. Drag the ⋮⋮ grip (or use the arrow keys on it) to reorder. Hover an entry to light up its highlight; click it to jump there.
- `Alt+Shift+H` highlights the current selection in yellow; `Alt+Shift+N` highlights it and opens a note.
- The toolbar button opens a library of every highlight from every chat, searchable by highlight text, note or chat name. Clicking one opens that chat and jumps straight to the highlight.
- Every highlight has a link you can copy. Opening it goes to that exact spot; without the extension it just opens the chat.
- Highlighting is blocked while a reply is still streaming.

Everything is stored locally in your browser. Chatmarks makes no network requests.

## Try it

Requires Node.js 20 or newer.

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `.output/chrome-mv3`. Open a chat on chatgpt.com and select some text.

For development, `npm run dev` opens a separate Chrome profile with the extension loaded and rebuilds on save.

## Test

```bash
npm test          # unit tests for anchoring and re-finding highlights
npm run compile   # type check
```

## How it works

| Piece | File |
|---|---|
| Site-specific markup (the only part that should break when a site changes) | `src/adapters/` |
| Flattening a message's text and mapping offsets to DOM ranges | `src/core/textIndex.ts` |
| Storing a highlight as quote + surrounding context, and finding it again | `src/core/quote.ts` |
| Finding the right message by id, fingerprint, or nearby position | `src/core/locate.ts` |
| Drawing highlights with the CSS Custom Highlight API, without touching the site's DOM | `src/core/painter.ts` |
| The panel's order (creation order, then whatever the user drags) | `src/core/order.ts` |
| Searching saved highlights | `src/core/search.ts` |
| Page logic: selection, navigation, jump, storage sync | `src/content/controller.ts` |
| The library page: every chat's highlights, search, copy link | `src/entrypoints/library/` |
| Opening or re-focusing a chat tab and telling it where to jump | `src/entrypoints/background.ts` |
| Panel and toolbar (Preact, inside a shadow root) | `src/ui/` |

## Fixing a site that broke

If a site changes its layout, the panel shows a warning. The fix is usually a selector change in that site's adapter, for example `src/adapters/chatgpt.ts`.
