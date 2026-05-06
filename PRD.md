# PRD: Figma Icon Management Plugin

## Problem Statement

Design teams manage large icon libraries in Figma but have no tooling to help them understand which icon sets are used in which product categories. Designers must manually search through Component Sets to find icons suitable for a given context (e.g., "Kitchen", "System", "Interface"). There is no structured overview showing which icons belong to which category, and no way to attach searchable metadata (tags, sizes) to icon sets in a way that is visible at a glance. The release process for new or updated icon sets is entirely manual, with no automated way to update the category overview when icons change.

---

## Solution

A Figma plugin that lets designers attach metadata (name, tags, sizes, categories) to icon set Component Sets, and with one click generates and maintains a synchronized "category overview" frame on the same page. The overview shows one column per category, each containing short visual cards for every icon set in that category. Cards stay in sync — when an icon set is updated and re-released, its cards are updated across all relevant category columns. Orphan cards are removed automatically when icon sets are deleted or re-categorized.

---

## User Stories

1. As a designer, I want to select a Component Set in Figma and open the plugin to see its current metadata, so that I can review what information is attached to it.
2. As a designer, I want the plugin to automatically recognize when I've selected a variant Component inside a set (instead of the set itself), so that I don't have to navigate the layers panel to select the parent.
3. As a designer, I want to enter a name for an icon set, so that it appears correctly labeled in the category overview.
4. As a designer, I want to enter available sizes (e.g., 16 24 32 44) for an icon set, so that other designers can see at a glance what size variants exist.
5. As a designer, I want to enter comma-separated tags (in multiple languages) for an icon set, so that the card is searchable by keyword and locale.
6. As a designer, I want to assign one or more categories to an icon set, so that it appears in the corresponding columns of the category overview.
7. As a designer, I want to save metadata to a Component Set without triggering a release, so that I can edit multiple sets before publishing the overview.
8. As a designer, I want to release all tagged icon sets at once with a single click, so that the category overview is rebuilt to reflect the current state of all sets.
9. As a designer, I want the category overview to appear on the same Figma page as my icon library, so that I can see both the source sets and the overview without switching pages.
10. As a designer, I want short visual cards in the overview to show the icon's 24px preview, name, tags, and available sizes, so that I can assess an icon set at a glance without opening it.
11. As a designer, I want icon sets that have categories to show a blue "Edit" indicator in their sizes row, so that I can tell at a glance which sets are actively managed by the plugin.
12. As a designer, I want uncategorized icon sets to appear in a dedicated "НОВЫЕ ИКОНКИ" column in the overview, so that I can identify sets that still need to be categorized.
13. As a designer, I want the "НОВЫЕ ИКОНКИ" column to disappear when all sets have been categorized, so that the overview stays clean.
14. As a designer, I want category columns to maintain their left-to-right order across releases, so that I don't have to relearn the layout after each update.
15. As a designer, I want new categories to be appended to the right of existing columns, so that existing columns stay in their familiar positions.
16. As a designer, I want cards within each category column to be sorted alphabetically by icon set name, so that I can scan for a specific set by name.
17. As a designer, I want the plugin to update in real time when I select a different Component Set while the plugin is open, so that I don't need to close and reopen the plugin to switch sets.
18. As a designer, I want to see an unsaved-changes warning when I select a different Component Set while editing, so that I don't accidentally lose my edits.
19. As a designer, I want to discard or save my changes when switching selection, so that I have explicit control over what gets saved.
20. As a designer, I want to remove an icon set from plugin management with a dedicated button, so that its cards are immediately removed from the overview without needing to run a full release.
21. As a designer, I want deleted Component Sets to have their cards automatically cleaned up on the next release, so that the overview doesn't contain stale entries.
22. As a designer, I want to see a release summary (cards created, updated, removed) after a release completes, so that I know what changed.
23. As a designer, I want to see a progress indicator during release, so that I know the plugin is working on a large icon set.
24. As a designer, I want to receive a clear error message when I click Release with no tagged sets on the page, so that I understand why nothing happened.
25. As a designer, I want to configure the display name of the root category overview frame, so that it matches our team's naming conventions.
26. As a designer, I want the root frame name setting to be stored in the Figma document (not per-user), so that all team members see the same frame name when they open the plugin.
27. As a designer, I want the settings section to always be visible in the plugin UI, so that I can update the frame name at any time without navigating to a settings screen.
28. As a team, I want the category overview frame to be found reliably by pluginData (not by name), so that renaming the frame doesn't break the plugin.

---

## Implementation Decisions

### Module breakdown

**1. Figma sandbox (`code.ts`) — event-driven message handler**
Runs in the Figma plugin sandbox with access to the Figma API. Listens for UI messages and `selectionchange`. Owns all canvas read/write operations.

Key responsibilities:
- `handleGetSelection`: reads current selection, walks up one level if a `COMPONENT` variant is selected (only one level), resolves to `COMPONENT_SET` or returns `INVALID_SELECTION`
- `handleSaveMetadata`: writes `iconset_metadata` JSON to the Component Set via `setPluginData`
- `handleGetSettings` / `handleSaveSettings`: reads/writes `root_frame_name` on `figma.root` via `setPluginData` (per-document, shared across team)
- `handleRelease`: full page scan → category map → canvas sync (see Release algorithm below)
- `handleRemoveIconset`: clears pluginData on the set, then immediately removes all cards with matching `source_id` pluginData; removes empty category frames

**2. Release algorithm**
Core of the plugin. Runs entirely in the Figma sandbox:
1. Scan `figma.currentPage.findAllWithCriteria({ types: ['COMPONENT_SET'] })` — filter to those with non-empty `iconset_metadata` pluginData
2. If none found → `figma.notify(error)` and return
3. Build `categoryMap: Map<string, IconSet[]>` preserving insertion order; sets with no categories → `UNCATEGORIZED_FRAME_NAME` bucket
4. Read root frame name from `figma.root.getPluginData`
5. Find-or-create root frame (identified by `is_root_frame` pluginData), set to HORIZONTAL auto-layout
6. Load fonts (Inter Bold + Regular) before any text node creation
7. For each category: find-or-create vertical sub-frame (`is_category_frame` pluginData); sort cards A→Z by name; upsert each card
8. Orphan cleanup: for each card node in category frames, remove if `getNodeById(source_id)` is null OR source set no longer lists the card's category; skip heading nodes (no `source_id`)
9. Remove empty category frames; remove `UNCATEGORIZED_FRAME_NAME` frame if empty; append new categories to the right; keep `UNCATEGORIZED_FRAME_NAME` last

**3. Card creation (`createShortCard`)**
Creates a Figma frame representing one icon set in one category:
- HORIZONTAL auto-layout: 48×48 icon preview + vertical text column
- Icon preview: `createInstance()` of the child Component where `width === 24`; instance placed in 48×48 frame with gray fill
- Text column: Name (Inter Bold 14px), Tags (Inter Regular 12px gray, comma-joined), Sizes row (space-joined numbers + " Edit" in blue `#0066FF` via `setRangeFills` — "Edit" omitted on uncategorized cards)
- Card stores `source_id` and `card_category` pluginData

**4. React UI (`ui.tsx`)**
Runs in the plugin iframe. State machine:

```ts
type AppState =
  | { status: 'loading' }
  | { status: 'no_selection' }
  | { status: 'invalid_selection' }
  | { status: 'editing'; nodeId: string; nodeName: string; form: IconSetMetadata; isDirty: boolean; pendingSelection: SelectionData | null; releasing: boolean; releaseStep: string }
  | { status: 'release_done'; summary: ReleaseSummary };
```

Key behaviors:
- On mount: sends `GET_SELECTION` + `GET_SETTINGS`
- `selectionchange` from plugin: if `isDirty` → stores incoming selection in `pendingSelection`, shows unsaved-changes banner (Save / Discard); else switches immediately
- Settings section always visible at bottom; frame name saves on blur via `SAVE_SETTINGS`
- Form fields: Name (required text), Sizes (space-separated → `number[]`), Tags (comma-separated → `string[]`), Categories (comma-separated → `string[]`)
- "Remove" button triggers confirm then `REMOVE_ICONSET` message

**5. Build tooling (`build.js`)**
esbuild-based, no webpack. Two bundles:
- `src/code.ts` → `dist/code.js` (browser platform, ES6)
- `src/ui/ui.tsx` → in-memory JS string → inlined into `src/ui/ui.html` shell → `dist/ui.html`

**Message protocol:**
```
UIMessage → plugin:   GET_SELECTION | SAVE_METADATA | RELEASE | REMOVE_ICONSET | GET_SETTINGS | SAVE_SETTINGS | CLOSE_PLUGIN
PluginMessage → UI:   SELECTION_DATA | NO_SELECTION | INVALID_SELECTION | SAVE_DONE | RELEASE_PROGRESS | RELEASE_DONE | RELEASE_ERROR | REMOVE_DONE | SETTINGS_DATA | SETTINGS_SAVED
```

**Metadata shape stored on Component Set nodes:**
```ts
interface IconSetMetadata {
  name: string;
  sizes: number[];
  tags: string[];
  categories: string[];
}
```

**pluginData keys:**
- `iconset_metadata` — JSON on Component Set (marker + data)
- `source_id` — Component Set node ID on each card
- `card_category` — category string on each card
- `is_category_frame` — on category sub-frames
- `is_root_frame` — on the root overview frame

**Document-level key on `figma.root`:**
- `root_frame_name` — display name for root frame, default "По назначению"

---

## Testing Decisions

Since this is a Figma plugin, automated unit tests for canvas operations are impractical (Figma API not available outside the sandbox). Testing strategy:

**What makes a good test:** Tests should verify behavior observable from outside the module — e.g., given a specific set of `iconSets[]` input, `buildCategoryMap()` returns the correct map structure. Tests should not reach into implementation details or mock the entire Figma API.

**Testable modules (pure logic, extractable from sandbox):**
- `buildCategoryMap(iconSets[])` → insertion-ordered map, uncategorized bucket
- `sortCardsAlphabetically(cards[])` → sorted array
- `parseMetadata(jsonString)` → typed `IconSetMetadata | null`
- `findVariant24(children[])` → correct child or fallback

**Manual verification checklist (from PLAN.md):**
1. `npm install && node build.js` → `dist/code.js` and `dist/ui.html` appear
2. Select Component Set → UI shows form; fill metadata → Save → reopen → values persist
3. Release → root frame created with correct category columns and cards
4. Change categories → Release → cards moved/removed correctly
5. Delete a Component Set → Release → its cards cleaned up from all columns
6. Uncategorized set → appears in "НОВЫЕ ИКОНКИ" without "Edit" text
7. Click Remove → cards immediately disappear, empty columns removed
8. Two designers open same file → both see same root frame name in Settings
9. Select different set with dirty form → unsaved-changes banner appears

---

## Out of Scope

- Auto-discovery of icon sets by location or naming convention (sets must be manually tagged via the plugin)
- Support for icons without a 24px variant (plugin falls back to `children[0]`)
- Multi-page support (plugin operates on `figma.currentPage` only)
- Clickable "Edit" links on canvas cards (Figma plugin API does not support canvas interactivity)
- Style field (Outline/Filled) on short cards — confirmed not needed by client
- Filtering or searching within the plugin UI
- Export or publishing to external systems
- Undo/redo integration beyond Figma's built-in history

---

## Further Notes

- The "DESIGN SYSTEM" label visible in client reference images is a pre-existing Figma annotation; the plugin does not create or modify it.
- Column order is preserved across releases using existing frame order in the root frame as ground truth — the plugin never reorders existing columns, only appends new ones.
- "НОВЫЕ ИКОНКИ" always appears as the last column when present, and is removed entirely when all sets are categorized.
- Root frame is located by `is_root_frame` pluginData, not by name — renaming is safe.
- The plugin was designed around the client's existing Figma structure: Component Sets nested inside organizing frames (2+ levels deep from page root).
