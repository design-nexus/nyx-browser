# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Browser's settings panes and their place in Settings' navigation.

nyx-pane-group-browser = Browser
nyx-pane-group-firefox = Firefox

pane-nyx-appearance-title = Appearance
category-nyx-appearance =
    .tooltiptext = { pane-nyx-appearance-title }
pane-nyx-tabs-title = Tabs & Sidebar
category-nyx-tabs =
    .tooltiptext = { pane-nyx-tabs-title }
pane-nyx-toolbar-title = Toolbar
category-nyx-toolbar =
    .tooltiptext = { pane-nyx-toolbar-title }
pane-nyx-integrations-title = Nyx Integrations
category-nyx-integrations =
    .tooltiptext = { pane-nyx-integrations-title }

## Appearance

nyx-appearance-group-theme = Theme
nyx-appearance-theme = Theme
nyx-appearance-theme-description = Browser follows your Nyx theme as it changes; a theme chosen here is for Browser alone
nyx-appearance-theme-follow =
    .label = Follow system
nyx-appearance-theme-dark =
    .label = Dark
nyx-appearance-theme-light =
    .label = Light
nyx-appearance-accent = Accent
nyx-appearance-density = Density
nyx-appearance-density-default =
    .label = Default
nyx-appearance-density-compact =
    .label = Compact
nyx-appearance-density-balanced =
    .label = Balanced
nyx-appearance-density-relaxed =
    .label = Relaxed
nyx-appearance-group-effects = Effects
nyx-appearance-frosted =
    .label = Frosted menus and panels
nyx-appearance-frosted-description = Animations follow the system's reduced-motion setting

## Tabs & Sidebar

nyx-tabs-group-tabs = Tabs
nyx-tabs-orientation = Orientation
nyx-tabs-orientation-description = Switches at once; tabs, workspaces and split views stay as they are
nyx-tabs-vertical =
    .label = Vertical
nyx-tabs-horizontal =
    .label = Horizontal
nyx-tabs-middle-click =
    .label = Close tabs with a middle click
nyx-tabs-keep-open =
    .label = Keep Browser open when you close the last tab
nyx-tabs-keep-open-description = The start page opens in a new tab instead
nyx-tabs-group-sidebar = Sidebar
nyx-sidebar-mode = Mode
nyx-sidebar-mode-description = Automatic: expanded from 1400 px, an icon rail from 900 px, hidden below
nyx-sidebar-auto =
    .label = Automatic
nyx-sidebar-expanded =
    .label = Expanded
nyx-sidebar-compact =
    .label = Compact
nyx-sidebar-hidden =
    .label = Hidden
nyx-sidebar-reveal =
    .label = Reveal a hidden sidebar at the window's edge
nyx-tabs-group-workspaces = Workspaces
nyx-sidebar-foot-spaces =
    .label = Show workspace icons at the sidebar's foot

## Toolbar

nyx-toolbar-group-top = Top bar
nyx-toolbar-buttons = Buttons
nyx-toolbar-buttons-description = Choose and arrange them; those without room go into More tools
nyx-toolbar-customize =
    .label = Customize…
nyx-toolbar-qr =
    .label = Show the QR code button in the address field
nyx-toolbar-group-bookmarks = Bookmarks bar
nyx-bookmarks-show = Show the bookmarks bar
nyx-bookmarks-always =
    .label = Always
nyx-bookmarks-newtab =
    .label = New tab only
nyx-bookmarks-never =
    .label = Never
nyx-bookmarks-icons-only =
    .label = Icons only
nyx-bookmarks-icons-only-description = Bookmarks show just their icon, with the name on hover; folders keep their names

## Nyx Integrations

nyx-integrations-group-apps = Nyx apps
nyx-integrations-description = Each needs that app installed. Pages can't reach them: they work only from Browser's buttons, menus and shortcuts.
nyx-integrations-share =
    .label = Share
nyx-integrations-share-description = Send a page, selection, image or download to the Share Sheet (Alt+Shift+S)
nyx-integrations-capture =
    .label = Capture
nyx-integrations-capture-description = Screenshots of a page, a region, or its text (Alt+Shift+C)
nyx-integrations-assistant =
    .label = Assistant
nyx-integrations-assistant-description = Ask about a page, which is read only when you allow it (Alt+Shift+A)
nyx-integrations-unreadable = These choices couldn't be read, so all three are off until they're saved again.
nyx-integrations-group-passwords = Passwords
# $version (String) - The Passwords extension's version
nyx-integrations-passwords-active = Logins, passkeys and masked email come from Nyx Passwords (its extension { $version }). Pair it once from its toolbar button.
nyx-integrations-passwords-missing = Install Nyx Passwords to fill logins, passkeys and masked email here. Browser keeps no passwords of its own.
