# Plan: Figma Icon Management Plugin

## Context
The client team manages icon sets in Figma and needs a plugin to:
1. Attach metadata (name, sizes, tags, categories) to icon set Component Sets via Figma's `setPluginData` API
2. On "Release", auto-generate and sync "short version" cards organized by category into a root frame
3. Keep cards in sync: add/remove/update as metadata changes
4. Allow removing icon sets from management with immediate card cleanup

---

## File Structure

```
figma-icon-management-plugin/
├── manifest.json
├── package.json
├── tsconfig.json
├── build.js          # esbuild script — bundles code.ts and inlines ui.tsx into ui.html
└── src/
    ├── globals.d.ts  # declare __html__ for TS
    ├── types.ts      # shared types, plugin data keys, message protocol
    ├── code.ts       # Figma sandbox: API logic
    └── ui/
        ├── ui.html   # shell HTML (build.js inlines JS)
        └── ui.tsx    # React UI
```

---

## Architecture

**Two isolated bundles:**
- `dist/code.js` — runs in Figma sandbox (no DOM, has Figma API)
- `dist/ui.html` — runs in iframe (React, no Figma API)

**Build:** esbuild via `build.js` — bundles `code.ts` to `dist/code.js`, bundles `ui.tsx` to a temp JS string, then inlines it into `ui.html` via string replacement.

**Message protocol** (`UIMessage` → plugin, `PluginMessage` → UI):
- `GET_SELECTION` → `SELECTION_DATA | NO_SELECTION | INVALID_SELECTION`
- `SAVE_METADATA` → `SAVE_DONE`
- `RELEASE` → `RELEASE_PROGRESS` (streaming) → `RELEASE_DONE | RELEASE_ERROR`
- `REMOVE_ICONSET` → `REMOVE_DONE`
- `GET_SETTINGS` → `SETTINGS_DATA`
- `SAVE_SETTINGS` → `SETTINGS_SAVED`
- `CLOSE_PLUGIN`

**Metadata stored via `setPluginData` on Component Set nodes:**
```ts
interface IconSetMetadata {
  name: string;
  sizes: number[];       // [16, 24, 32, 44]
  tags: string[];        // ["Like", "Hand", "Рука"]
  categories: string[];  // ["System", "Interface"]
}
```

**Plugin data keys (centralized in `types.ts`):**
- `iconset_metadata` — JSON on Component Set node (marker that a set is managed)
- `source_id` — Component Set node ID stored on each short card
- `card_category` — which category this card belongs to
- `is_category_frame` — marks category sub-frames
- `is_root_frame` — marks the root frame

**Document-level settings (on `figma.root`):**
- `root_frame_name` — display name of the root frame, default "По назначению"

**Constants:**
- `ROOT_FRAME_NAME_DEFAULT = 'По назначению'`
- `UNCATEGORIZED_FRAME_NAME = 'НОВЫЕ ИКОНКИ'`

---

## Implementation Sequence

### 1. package.json + tsconfig.json

**package.json** deps:
- `devDependencies`: `@figma/plugin-typings`, `typescript`, `esbuild`, `@types/react`, `@types/react-dom`
- `dependencies`: `react`, `react-dom`
- Scripts: `"build": "node build.js"`, `"watch": "node build.js --watch"`

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "es6", "lib": ["es6", "dom"], "strict": true,
    "jsx": "react", "module": "commonjs", "moduleResolution": "node",
    "typeRoots": ["./node_modules/@figma/plugin-typings", "./node_modules/@types"]
  },
  "include": ["src"]
}
```

### 2. build.js

```js
const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  // Bundle code.ts
  await esbuild.build({
    entryPoints: ['src/code.ts'],
    bundle: true,
    outfile: 'dist/code.js',
    platform: 'browser',
    target: 'es6',
  });

  // Bundle ui.tsx to inline string
  const uiResult = await esbuild.build({
    entryPoints: ['src/ui/ui.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es6',
  });
  const uiJs = uiResult.outputFiles[0].text;

  // Inline into HTML shell
  const html = fs.readFileSync('src/ui/ui.html', 'utf8');
  const inlined = html.replace('</body>', `<script>${uiJs}</script></body>`);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/ui.html', inlined);
}

build().catch(() => process.exit(1));
```

### 3. manifest.json
```json
{
  "name": "Icon Management",
  "id": "icon-management-plugin",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"]
}
```

### 4. src/globals.d.ts
```ts
declare const __html__: string;
```

### 5. src/types.ts

All shared interfaces + `UIMessage` union + `PluginMessage` union + `PLUGIN_DATA_KEYS` const object + constants.

### 6. src/code.ts

```ts
figma.showUI(__html__, { width: 400, height: 560, themeColors: true });

figma.on('selectionchange', () => handleGetSelection());

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) { ... }
};
```

**`handleGetSelection()`**:
1. Read `figma.currentPage.selection[0]`
2. If `COMPONENT` and parent is `COMPONENT_SET` → use parent (silent walk-up)
3. If result is not `COMPONENT_SET` → send `INVALID_SELECTION`
4. If nothing selected → send `NO_SELECTION`
5. Parse `getPluginData('iconset_metadata')`, send `SELECTION_DATA`

**`handleSaveMetadata(metadata)`**:
`node.setPluginData('iconset_metadata', JSON.stringify(metadata))`, send `SAVE_DONE`.

**`handleGetSettings()`**:
Read `figma.root.getPluginData('root_frame_name')`, send `SETTINGS_DATA` with value or default.

**`handleSaveSettings(settings)`**:
`figma.root.setPluginData('root_frame_name', settings.rootFrameName)`, send `SETTINGS_SAVED`.

**`handleRelease()`** — core algorithm (must be `async` for font loading):
1. Scan: `figma.currentPage.findAllWithCriteria({ types: ['COMPONENT_SET'] })`, filter by `getPluginData('iconset_metadata')` non-empty → `iconSets[]`
2. If `iconSets` is empty → `figma.notify('No icon sets found...')` and return
3. Build `categoryMap: Map<string, IconSet[]>` — insertion-order preserved; sets with no categories → `UNCATEGORIZED_FRAME_NAME` bucket
4. Read root frame name from `figma.root.getPluginData('root_frame_name')` or default
5. Find or create root frame (`is_root_frame = 'true'`), HORIZONTAL auto-layout, padding 48, rename to current setting
6. `await figma.loadFontAsync({ family: 'Inter', style: 'Bold' })` + Regular — before any text node creation
7. For each category (existing columns first in their current order, new categories appended, `UNCATEGORIZED_FRAME_NAME` last if present):
   - Find or create vertical category sub-frame (`is_category_frame = 'true'`)
   - Upsert heading TextNode at `insertChild(0, ...)`
8. For each icon set in category (sorted A→Z by `metadata.name`):
   - Find existing card by `SOURCE_ID + CARD_CATEGORY` → update in place, else create new
9. Orphan cleanup: walk all category frames, remove cards where:
   - `figma.getNodeById(card.getPluginData(SOURCE_ID))` returns null (set deleted), OR
   - Source set no longer lists this card's `CARD_CATEGORY`
   - Skip nodes without `SOURCE_ID` (they are headings)
10. Remove empty category frames from root
11. Remove `UNCATEGORIZED_FRAME_NAME` frame if empty
12. `figma.notify('Release complete')`, send `RELEASE_DONE` with summary

**`handleRemoveIconset(nodeId)`**:
1. Clear `node.setPluginData('iconset_metadata', '')`
2. Find all cards on page: `figma.currentPage.findAll(n => n.getPluginData(SOURCE_ID) === nodeId)`
3. Remove each card
4. Remove empty category frames
5. Send `REMOVE_DONE`

**`createShortCard(metadata, iconSetNode, category)`**:
- Outer frame: HORIZONTAL auto-layout, padding 8/12, gap 12
- Icon preview: 48×48 frame, light gray fill (#F5F5F5), corner radius 8
  - Find child Component where `width === 24`, call `component.createInstance()`
  - Set `instance.layoutPositioning = 'AUTO'`, constraints centered
- Text column: VERTICAL auto-layout, gap 2
  - Name: Bold 14px, `#000000`
  - Tags: Regular 12px, `#666666`, comma-joined
  - Sizes row: Regular 12px — sizes space-joined + " Edit" if `categories.length > 0`; use `setRangeFills` for blue `#0066FF` on "Edit" range
- Set `SOURCE_ID` and `CARD_CATEGORY` pluginData on outer frame

### 7. src/ui/ui.html
Minimal HTML shell: `<div id="root"></div>`. `build.js` inlines the React bundle before `</body>`.

### 8. src/ui/ui.tsx

**State machine:**
```ts
type AppState =
  | { status: 'loading' }
  | { status: 'no_selection' }
  | { status: 'invalid_selection'; reason: string }
  | { status: 'editing'; nodeId: string; nodeName: string; form: IconSetMetadata; isDirty: boolean; pendingNode: SelectionData | null; releasing: boolean; releaseStep: string }
  | { status: 'release_done'; summary: ReleaseSummary };
```

**Key patterns:**
- On mount: `GET_SELECTION` + `GET_SETTINGS`
- `window.onmessage` handles all inbound plugin messages
- `selectionchange` from plugin: if `isDirty` → set `pendingNode`, show unsaved-changes banner ("Unsaved changes — Save or Discard?"); else switch immediately
- Form fields: Name (text, required), Sizes (space-separated → `number[]`), Tags (comma-separated → `string[]`), Categories (comma-separated → `string[]`)
- "Save" → `SAVE_METADATA`; "Release" → `SAVE_METADATA` then `RELEASE`; "Remove" → confirm then `REMOVE_ICONSET`; "Close" → `CLOSE_PLUGIN`
- Settings section (always visible at bottom): "Frame name" text input, auto-saves on blur via `SAVE_SETTINGS`
- Show `releaseStep` during release
- Show `ReleaseSummary` (created/updated/removed counts) on `RELEASE_DONE`

---

## Key Figma API Details

| Task | API |
|------|-----|
| Scan icon sets | `figma.currentPage.findAllWithCriteria({ types: ['COMPONENT_SET'] })` |
| Store metadata | `node.setPluginData(key, JSON.stringify(value))` |
| Read metadata | `JSON.parse(node.getPluginData(key))` |
| Document settings | `figma.root.setPluginData / getPluginData` |
| Create frame | `figma.createFrame()` then set `layoutMode`, `itemSpacing`, `padding*` |
| Text node | `figma.createText()` — MUST `await figma.loadFontAsync()` first |
| Icon preview | Find `children` where `width === 24`, call `component.createInstance()` |
| Listen for selection | `figma.on('selectionchange', handler)` |
| Auto-layout sizing | `frame.primaryAxisSizingMode = 'AUTO'`, `frame.counterAxisSizingMode = 'AUTO'` |
| Heading as first child | `catFrame.insertChild(0, headingTextNode)` |
| Notify user | `figma.notify('...')` |

---

## Pitfalls to Avoid

1. **`__html__` undefined**: Declare `declare const __html__: string` in `globals.d.ts`
2. **Font loading**: Call `loadFontAsync` for ALL font variants before any `textNode.characters = ...` assignment
3. **Instance positioning**: After `createInstance()` inside auto-layout, set `instance.layoutPositioning = 'AUTO'`
4. **Heading vs card nodes**: Heading TextNodes have no `SOURCE_ID` — orphan cleanup must skip nodes where `getPluginData(SOURCE_ID)` is empty string
5. **Column order**: Use the existing order of category frames in the root frame as ground truth; only append new ones; never reorder existing columns
6. **`getNodeById` null**: Always null-check when looking up source nodes during orphan cleanup
7. **`selectionchange` fires on plugin open**: Guard against processing selection events before UI is ready

---

## Verification

1. `npm install && node build.js` → `dist/code.js` and `dist/ui.html` appear
2. In Figma: Plugins → Development → Import plugin from manifest → plugin opens
3. Select a Component Set → UI shows form; fill metadata → Save → close and reopen → values persist
4. Click Release → root frame created with correct category columns and short cards
5. Change categories → Release → cards moved/removed correctly
6. Completely delete a Component Set → Release → its cards removed from all columns
7. Icon set with no categories → appears in "НОВЫЕ ИКОНКИ" without "Edit" text
8. Click Remove → cards immediately disappear from canvas, empty columns removed
9. Two designers open same file → both see same root frame name in Settings
10. Change selection while form is dirty → unsaved changes banner appears
