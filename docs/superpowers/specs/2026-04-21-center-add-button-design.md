# Center Add Button — Design Spec

**Date:** 2026-04-21
**Project:** Dani's Book (recipe app)

---

## Overview

Merge the floating "+" FAB and the Scan tab into a single elevated center button in the tab bar. Tapping it opens a bottom sheet with three entry points for adding a recipe.

---

## Tab Bar Restructure

**Before:** 5 tabs — Recipes | Scan | Grocery | Planner | Settings

**After:** 4 tabs + 1 center action button — Recipes | Grocery | **[+]** | Planner | Settings

- The Scan tab is removed entirely from the tab bar.
- The floating FAB "+" button on the Recipes panel is removed.
- The center slot in the tab bar becomes a raised circular button (~52px diameter), styled in `--accent` color (`#C4705A`), with a white plus icon, a white border (3px), and a drop shadow matching the existing `--shadow-md` pattern. It sits elevated above the tab bar baseline.
- The label beneath the center button reads "Add" in `--accent` color.

---

## Center Button — Bottom Sheet

Tapping the center button opens a bottom sheet that slides up from the bottom of the screen.

**Sheet anatomy:**
- Semi-transparent dim overlay (`rgba(61,50,41,0.35)`) covers the screen behind the sheet.
- Sheet has rounded top corners (20px), a drag handle at the top center.
- Title: **"Add a Recipe"** (semibold, `--text`)
- Subtitle: **"How would you like to add it?"** (`--text-muted`)
- Three option rows (described below).
- A **Cancel** row at the bottom — tapping it dismisses the sheet.
- Tapping the dim overlay also dismisses the sheet.
- Swipe-down gesture dismisses the sheet.

**Option rows:**

| Option | Icon background | Behavior on tap |
|---|---|---|
| Add Manually | `--accent` | Dismiss sheet → open existing add-recipe form |
| Scan or Photo | Dark (`--text`) | Dismiss sheet → open scan UI in "Identify" mode |
| From Instagram | Instagram gradient | Dismiss sheet → open scan UI in "Instagram" mode |

Each row: icon tile (42×42px, 10px radius) + title + subtitle. "Add Manually" row uses `--accent-light` background and `--accent` border to visually emphasize it as the primary option.

---

## Scan UI Changes

The existing scan panel content (`#panel-scan`) is preserved as-is — mode toggle, upload section, loading state, error state, vine animation — but it is no longer a tab. It becomes a view that is shown/hidden programmatically when triggered from the sheet.

- "Scan or Photo" → sets `scanMode = 'identify'`, shows scan UI
- "From Instagram" → sets `scanMode = 'instagram'`, shows scan UI

The scan UI needs a back/close button (top-left) to return to the previously active tab.

---

## Tab Order & Indexing

| Index | Tab | Data attribute |
|---|---|---|
| 0 | Recipes | `data-tab="recipes"` |
| 1 | Grocery | `data-tab="grocery"` |
| — | Center button | (not a tab, no data-tab) |
| 2 | Planner | `data-tab="planner"` |
| 3 | Settings | `data-tab="settings"` |

The `tabOrder` array in JS changes from `['recipes','scan','grocery','planner','settings']` to `['recipes','grocery','planner','settings']`. Swipe/keyboard navigation skips the center button slot.

---

## Out of Scope

- No animation changes to the scan UI itself.
- No changes to the add-recipe form.
- No changes to Grocery, Planner, or Settings tabs.
