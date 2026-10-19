# HTE-111 Testing Documentation

## Issue
Apply the Kukulcan design system: the new logo on every page and in the browser tab, design-token colors and fonts everywhere, and a light/dark theme the user can switch from the View menu (or leave following the operating system). Spec: [Theme and logo](https://claude.ai/artifact/QBjCX8DDS4ux2hgeTFKJ2x).

## Automated tests

| File | Positive | Negative | Edge |
| --- | --- | --- | --- |
| `src/styles/theme.test.js` | Committed `theme.css` equals generator output; light values on `:root`, dark under both dark selectors; `{alias}` → `var()`; ink/ink-muted ≥ 4.5:1 on bg/surface/raised and status fg ≥ 4.5:1 on status bg, both themes | Missing dark value falls back to light; tokens without name or value skipped | Identifier sanitising; empty token file; empty font stack |
| `src/styles/noHardcodedColors.test.js` | No color literal in `src/` outside `theme.css`/`tokens.json`; detector finds hex, `rgba()`, named colors | Ignores tokens, comments, `white-space`, `BlinkingRedLine` | Empty input; URLs with `//` |
| `src/theme/ThemeContext.test.js` | Defaults to system and follows OS; Dark/Light set `data-theme` and save; saved choice restored; system mode tracks OS live and clears the key | Invalid stored value → system; invalid `setMode` → system; blocked storage still switches; no `matchMedia` → light | `useTheme()` outside provider is a no-op fallback; listener removed on unmount; legacy `addListener` |
| `src/components/Logo/Logo.test.js` | Mark + name, decorative `alt=""`; `to` makes a named link; `lg` class | Broken mark hidden, name stays; no `to` → no link | Unknown size → `sm` |
| `src/pages/Dashboard/MenuBarTheme.test.js` | Lockup links home; View lists three theme options as `menuitemradio`, system active by default with screen-reader "(active)"; choosing Dark applies, saves and moves the check | Other View options keep their alert and get no radio role | Exactly one option active |

## Test Cases

### TC-01: Logo and tab icon
**Steps:**
1. Open the deployed site signed out.
2. Look at the browser tab, then sign in and visit Home and the Dashboard.

**Expected:** The tab shows the Kukulcan mark and the title "Kukulcan". Login and Set Password show the large lockup above the form; Home shows the small lockup in the menu bar and the large one above the welcome text; the Dashboard menu bar shows the small lockup. The old company logo appears nowhere.

### TC-02: Logo links home
**Steps:**
1. On the Dashboard, click the logo in the menu bar.

**Expected:** Home opens. A screen reader announces the link as "Kukulcan home".

### TC-03: Follows the operating system by default
**Steps:**
1. In a fresh browser profile (or after clearing site data), set the OS to dark mode and open the site.
2. Switch the OS to light mode with the app open.

**Expected:** The app opens dark with no flash of light colors, and switches to light without a reload.

### TC-04: Choose Dark / Light from the View menu
**Steps:**
1. On the Dashboard open View → Dark theme.
2. Open View again.
3. Reload the page, then open Home.

**Expected:** The whole app turns dark at once. View shows a check mark next to "Dark theme" only. After the reload and on Home the app is still dark, with no flash of light colors. Repeat with "Light theme" while the OS is dark: the app stays light.

### TC-05: Back to system theme
**Steps:**
1. With "Dark theme" chosen and the OS in light mode, choose View → Use system theme.

**Expected:** The app turns light, the check mark moves to "Use system theme", and later OS changes are followed again.

### TC-06: Readability in both themes
**Steps:**
1. In each theme, visit Login, Home, the Dashboard (tree, toolbar, canvas, node modals, context menu), and the Save, Open, Share, Version History, Checkout and Unsaved Changes dialogs.

**Expected:** All text is readable on its background; no white-on-white or black-on-black; modal backdrops dim the page; toolbar icons are visible (inverted on dark); status pills (Draft, Pending review, Changes requested, Approved, Deployed) and role pills keep distinct colors.

### TC-07: Canvas
**Steps:**
1. Open a workflow, toggle the grid on, zoom in and out, and pan.
2. Draw a connection, try an invalid connection, and select a node.

**Expected:** The grid is a dot grid that follows pan and zoom; there's no logo watermark. Connections are cyan, the line being drawn is dashed cyan, the invalid line blinks red. Begin has a mint triangle and mint label pill; End has a cyan triangle and cyan label pill. A selected node has a 2px mint outline.

### TC-08: Keyboard focus
**Steps:**
1. Tab through Login and the Dashboard menu bar in both themes.

**Expected:** Every focused control shows a visible cyan focus ring.

### TC-09: Blocked storage (negative)
**Steps:**
1. Open the site in a private window (or with site data blocked) and choose View → Dark theme.

**Expected:** The app turns dark for that session without errors; after a reload it follows the OS again.

### TC-10: Broken logo file (edge)
**Steps:**
1. In DevTools, block requests to `/brand/kukulcan-mark.svg` and reload Login.

**Expected:** The broken-image icon doesn't appear; the "KUKULCAN" wordmark remains.

## Result
Automated: lint, Prettier, Jest and the build pass. Manual: pending (run on the preview deploy).
