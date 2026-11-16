# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Browser's own chrome: the top bar's buttons, the sidebar and its menus.

nyx-sidebar-button =
    .label = Sidebar
    .tooltiptext = Sidebar (Ctrl+B)
nyx-share-button =
    .label = Share
    .tooltiptext = Share this page (Alt+Shift+S)
nyx-share-button-unavailable =
    .label = Share
    .tooltiptext = This page can’t be shared
nyx-capture-button =
    .label = Capture
    .tooltiptext = Capture this page (Alt+Shift+C)
nyx-capture-button-unavailable =
    .label = Capture
    .tooltiptext = This page can’t be captured
nyx-assistant-button =
    .label = Assistant
    .tooltiptext = Assistant (Alt+Shift+A)
nyx-appearance-button =
    .label = Settings
    .tooltiptext = Settings (Ctrl+,)
nyx-overflow-button =
    .label = More tools
    .tooltiptext = More tools

## The Share button's dropdown: where Nyx Share sends the page in one click.

nyx-share-view =
    .title = Share
nyx-share-more =
    .label = More in Share…
nyx-share-devices = Nearby
nyx-share-looking = Looking for where to share…
nyx-share-nowhere = Share has nowhere to send a link in one click.
nyx-share-copy = Copy link
nyx-share-clean-label = Clean link
nyx-share-clean =
    .title = Copy the link without the parts sites add to track you
nyx-share-no-address = No web address to share
nyx-share-qr-tile = QR code
nyx-share-qr-title = QR code
nyx-share-qr-caption = Point your phone’s camera at it to open the page
nyx-share-qr-save = Save to Downloads
nyx-share-back =
    .title = Back

## Open in: the page, a link or a tab in another installed browser.

nyx-openin-button =
    .label = Open in
    .tooltiptext = Open this page in another browser (Alt+Shift+O)
nyx-openin-view =
    .title = Open in
nyx-openin-sites-view =
    .title = Always open in
nyx-openin-heading = Open this page in
nyx-openin-none = No other browsers are installed.
# $name (String) - A browser's name, such as Firefox
nyx-openin-browser =
    .label = { $name }
nyx-openin-private =
    .tooltiptext = { $name }, in a private window
nyx-openin-private-item =
    .label = { $name }, private window
# $host (String) - The page's site, such as example.com
nyx-openin-site =
    .label = Always open { $host } in…
nyx-openin-site-ruled =
    .label = { $host } always opens in { $name }
nyx-openin-site-here =
    .label = Here, in Browser
nyx-openin-site-in =
    .label = { $name }
nyx-openin-link-preferred =
    .label = Open link in { $name }
nyx-openin-link-other =
    .label = Open link in
nyx-openin-tab-preferred =
    .label = Open in { $name }
nyx-openin-tab-other =
    .label = Open in

## Nyx Passwords, built in.

nyx-passwords-button =
    .label = Passwords
    .tooltiptext = Passwords (Alt+Shift+Y)
nyx-passwords-fill =
    .label = Fill the login for this page
nyx-passwords-generate =
    .label = Generate a password here

## Quick Commands (F2).

nyx-qc-placeholder = Search tabs, bookmarks, history, commands and settings
nyx-qc-tabs = Tabs
nyx-qc-places = Bookmarks and history
nyx-qc-commands = Commands
nyx-qc-settings-group = Settings
nyx-qc-switch = Switch
nyx-qc-new-tab = New tab
nyx-qc-new-window = New window
nyx-qc-private-window = New private window
nyx-qc-close-tab = Close this tab
nyx-qc-reopen-tab = Reopen the closed tab
nyx-qc-duplicate-tab = Duplicate this tab
nyx-qc-pin-tab = Pin or unpin this tab
nyx-qc-unload-others = Unload the other tabs
nyx-qc-open-in = Open this page in another browser
nyx-qc-video = Download this page’s video
nyx-qc-share = Share this page
nyx-qc-qr = Show a QR code for this page
nyx-qc-passwords = Open Passwords
nyx-qc-sidebar = Show or hide the sidebar
nyx-qc-downloads = Downloads
nyx-qc-bookmarks = Bookmarks
nyx-qc-history = History
nyx-qc-settings = Settings

## Content blocking's shield (uBlock Origin).

# $count (Number) - Requests blocked on this page; $host (String) - its site
nyx-shield-button =
    .tooltiptext = { $count ->
        [one] One request blocked on { $host }
       *[other] { $count } requests blocked on { $host }
    }
nyx-shield-button-off =
    .tooltiptext = Not blocking on { $host }
nyx-shield-unavailable = Content blocking isn’t running for this page.
nyx-shield-on = Blocking ads and trackers
nyx-shield-off = Not blocking on this site
nyx-shield-toggle =
    .title = Blocking on { $host }
nyx-shield-blocked = blocked on this page
# $count (Number) - Requests let through
nyx-shield-allowed = { $count ->
    [one] One request let through
   *[other] { $count } requests let through
}
nyx-shield-pick = Pick an element
nyx-shield-zap = Zap one
nyx-shield-site = On this site
nyx-shield-popups = Pop-ups
nyx-shield-popups-tip =
    .title = Block every pop-up on this site
nyx-shield-media = Large media
nyx-shield-media-tip =
    .title = Block large images, video and sound on this site until you click them
nyx-shield-cosmetic = Cosmetic
nyx-shield-cosmetic-tip =
    .title = Leave the page’s look as it is (no cosmetic filtering) on this site
nyx-shield-fonts = Web fonts
nyx-shield-fonts-tip =
    .title = Block web fonts on this site
nyx-shield-scripts = JavaScript
nyx-shield-scripts-tip =
    .title = Block JavaScript on this site
nyx-shield-settings = Content blocking settings
nyx-shield-dashboard = uBlock Origin ›

## Browser's VPN.

nyx-vpn-button =
    .label = VPN
    .tooltiptext = VPN: off for this tab
# $name (String) - The VPN, such as NordVPN; $place (String) - where, such as Netherlands
nyx-vpn-button-on =
    .label = VPN
    .tooltiptext = VPN: { $name }, { $place }
nyx-vpn-none = No VPN added yet. Browser can go through NordVPN, Private Internet Access, or any SOCKS5 or HTTPS proxy, without their extensions.
nyx-vpn-add = Add a VPN…
nyx-vpn-connected = Connected
nyx-vpn-off = Off for this tab
nyx-vpn-server = Server
nyx-vpn-covers = Covers
nyx-vpn-browser-only = Browser only
nyx-vpn-connection = Connection
nyx-vpn-location = Location
nyx-vpn-fastest = Fastest server
nyx-vpn-fastest-note = Wherever NordVPN is quickest now
nyx-vpn-favorites = Favourites
nyx-vpn-whole-country = Whole country
nyx-vpn-find =
    .placeholder = Find a country or city
    .aria-label = Find a country or city
nyx-vpn-countries-group = Countries
nyx-vpn-cities-group = Cities
nyx-vpn-loading = Loading NordVPN's places…
# $query (String) - What was typed
nyx-vpn-no-match = Nothing called “{ $query }”
# $name (String) - A country or a city
nyx-vpn-star =
    .title = Add { $name } to favourites
nyx-vpn-unstar =
    .title = Remove { $name } from favourites
# $name (String) - A country
nyx-vpn-cities-in =
    .title = Cities in { $name }
nyx-vpn-use-for = Use it for
nyx-vpn-every = Every workspace
# $name (String) - The workspace's name
nyx-vpn-only = { $name } only
nyx-vpn-only-note = Covers this workspace’s tabs. Background requests that belong to no tab, such as service workers, follow the setting for every workspace.
nyx-vpn-settings = VPN settings

## Video downloads, with yt-dlp.

nyx-video-button =
    .tooltiptext = Download this page’s video
nyx-video-looking = Looking at this page’s video…
nyx-video-mode-video = Video
nyx-video-mode-audio = Sound only
nyx-video-best = The best yt-dlp finds
# $format (String) - The sound format, such as OPUS
nyx-video-audio-as = As { $format }
nyx-video-subtitles = Subtitles, in the file
nyx-video-save-to = Save to
nyx-video-change = Change
nyx-video-folder-title = Save videos to
nyx-video-cancel = Cancel
nyx-video-download = Download
nyx-video-stop =
    .title = Stop
# $done, $total (String) - Sizes, such as 386 MB; $speed (String) - such as 48 MB/s; $left (String) - time left, such as 0:05
nyx-video-progress = { $done } of { $total } · { $speed } · { $left } left
nyx-video-state-starting = Starting…
nyx-video-state-merging = Merging video and sound…
nyx-video-state-converting = Converting the sound…
nyx-video-state-finishing = Adding subtitles and details…
nyx-video-state-stopped = Stopped

## Selection search: the popup over selected text.

nyx-selection-copy =
    .title = Copy
nyx-selection-link =
    .title = Open as a link
# $name (String) - A search engine's name
nyx-selection-engine =
    .title = { $name } · middle-click for a background tab
# What Enter does in the text box: searches with the first engine.
nyx-selection-enter = Enter · { $name }

nyx-qr-button =
    .tooltiptext = Show a QR code for this page

nyx-tab-search-button =
    .tooltiptext = Search tabs (Ctrl+Shift+E)
nyx-workspace-menu-button =
    .tooltiptext = Workspaces
nyx-workspace-menu-move =
    .label = Move this tab to

nyx-sidebar-folders = Folders
nyx-sidebar-new-folder =
    .tooltiptext = New folder
nyx-sidebar-today = Today
nyx-sidebar-new-tab =
    .label = New tab

nyx-workspace-menu-title = Workspaces
nyx-workspace-menu-new =
    .label = New workspace
# $name (String) - The workspace's name
nyx-workspace-menu-edit =
    .label = Edit { $name }…
nyx-workspace-rename =
    .placeholder = Space name
    .aria-label = Space name

nyx-bookmarks-open-all-split =
    .label = Open all in a split view

nyx-identity-not-secure = Not secure

## The layouts (src/nyx/modules/layout.js)

nyx-bookmarks-shelf =
    .tooltiptext = Fold or unfold your bookmarks
nyx-bookmarks-shelf-title =
    .value = Bookmarks
nyx-rail =
    .aria-label = Workspaces and Library
nyx-rail-bookmarks =
    .tooltiptext = Bookmarks
nyx-rail-history =
    .tooltiptext = History
nyx-rail-reading =
    .tooltiptext = Reading list
nyx-rail-downloads =
    .tooltiptext = Downloads
nyx-rail-settings =
    .tooltiptext = Settings

## The address field's dropdown (src/nyx/modules/address.js)

nyx-urlbar-group-tabs =
    .label = Tabs
nyx-urlbar-group-places =
    .label = Bookmarks and history
nyx-urlbar-group-commands =
    .label = Commands
nyx-urlbar-kind-search = Search
nyx-urlbar-kind-open = Open
nyx-urlbar-kind-switch = Switch to tab
nyx-urlbar-kind-bookmark = Bookmark
nyx-urlbar-kind-history = History
nyx-urlbar-kind-command = Command
nyx-urlbar-hint-open = open
nyx-urlbar-hint-new-tab = new tab
nyx-urlbar-hint-engine = pick an engine
nyx-urlbar-hint-commands = commands only
nyx-urlbar-search-with = Search with
# $engine (String) - The search engine's name
nyx-urlbar-engine =
    .tooltiptext = Searching with { $engine }. Tab picks another.
# $engine (String) - The search engine's name
nyx-urlbar-search-with-engine =
    .tooltiptext = Search with { $engine }

## Commands in the address field's dropdown

# $title (String) - Another tab's title
nyx-action-split-with = Split view with { $title }
# $name (String) - A workspace's name
nyx-action-move-to-space = Move this tab to { $name }
# $host (String) - The site's name, like example.com
nyx-action-clear-site-data = Clear data for { $host }

## The Site card, from the padlock (src/nyx/modules/site.js)

nyx-site-card-title = This site
nyx-site-secure = Secure
# $issuer (String) - Who vouches for the site's certificate
nyx-site-secure-by = Secure · { $issuer }
nyx-site-not-secure = Not secure: sent without encryption
nyx-site-blocking = Blocking
# $count (String) - How many requests were blocked, like 14 or 999+
nyx-site-blocked = { $count } blocked
nyx-site-blocked-none = Nothing blocked
nyx-site-off = Off
nyx-site-passwords = Passwords
nyx-site-passwords-state = Logins and passkeys
nyx-site-vpn = VPN
nyx-site-vpn-on = On for this tab
nyx-site-reader = Reader
nyx-site-reader-available = Available
nyx-site-reader-unavailable = Not for this page
nyx-site-copy-link = Copy link
nyx-site-share = Share
nyx-site-qr = QR code
nyx-site-open-in = Open in
nyx-site-capture = Capture
nyx-site-permissions = Permissions
nyx-site-permission-allowed = Allowed
nyx-site-permission-blocked = Blocked
nyx-site-permission-ask = Ask
nyx-site-permission-block-audio = Block audio
nyx-site-permission-cycle = Ask, allow or block
nyx-site-permission-location = Location
nyx-site-permission-camera = Camera
nyx-site-permission-microphone = Microphone
nyx-site-permission-notifications = Notifications
nyx-site-permission-autoplay = Autoplay
nyx-site-permission-popups = Pop-ups
nyx-site-permission-storage = Storage
nyx-site-permission-vr = Virtual reality
nyx-site-permission-screen = Screen sharing
nyx-site-clear-data = Clear site data
nyx-site-connection = Connection details
nyx-site-all-settings = All site settings

## The Library's reading list (src/nyx/modules/library.js)

nyx-tab-reading-list =
    .label = Save to reading list
    .accesskey = r
nyx-library-reading-folder = Reading list
nyx-reading-list-saved = Saved to your reading list

## The menu's tiles and list, and the tab menu (src/nyx/modules/menus.js)

nyx-appmenu-new-window = New window
nyx-appmenu-private = Private
nyx-appmenu-library = Library
nyx-appmenu-capture = Capture
nyx-appmenu-assistant = Assistant
nyx-appmenu-commands = Commands
nyx-appmenu-reader =
    .label = Reader view
nyx-appmenu-customize =
    .label = Customize toolbar…
nyx-appmenu-extensions =
    .label = Extensions
nyx-help-keys =
    .label = Keyboard shortcuts
    .shortcut = F1
nyx-pin-to-bar =
    .tooltiptext = Add to the toolbar
    .aria-label = Add to the toolbar
nyx-tab-new-below =
    .label = New tab below
nyx-tab-move-space =
    .label = Move to workspace
nyx-tab-move-to =
    .label = Move to
nyx-tab-new-space =
    .label = New workspace…
nyx-tab-copy-link =
    .label = Copy link
nyx-tab-close-others =
    .label = Close other tabs

## The downloads panel (src/nyx/modules/dlpanel.js)

# $count (Number) - Downloads in progress; $amount and $unit - their size, like 620 MB
nyx-dl-downloading = { $count } downloading · { $amount } { $unit }
# $count (Number) - Downloads in the list
nyx-dl-files =
    { $count ->
        [one] 1 file
       *[other] { $count } files
    }
nyx-dl-show-all = Show all
nyx-dl-now = Now
nyx-dl-earlier = Earlier
nyx-dl-clear = Clear list

## The Extensions panel (src/nyx/modules/extpanel.js)

nyx-ext-manage = Manage
nyx-ext-sub = What extensions can do here
nyx-ext-sub-page = Extensions can't read this page
nyx-ext-private = Private window
nyx-ext-on-site = On this site
nyx-ext-state-quarantined = Kept off this site
nyx-ext-state-no-access = Doesn't read this site
nyx-ext-state-all = Reads every site
nyx-ext-state-always = Always reads this site
nyx-ext-state-when-clicked = Reads it when you click it
nyx-ext-state-temporary = Reading it until you leave
nyx-ext-state-attention = Wants to read this site
nyx-ext-state-private = Not allowed in private windows
nyx-ext-when-clicked = On click
nyx-ext-always = Always
nyx-ext-every-site = Every site
nyx-ext-allow = Allow
# $name (String) - The extension's name
nyx-ext-more =
    .title = More for { $name }
nyx-ext-menu-pin =
    .label = Pin its button
nyx-ext-menu-up =
    .label = Move up
nyx-ext-menu-down =
    .label = Move down
nyx-ext-menu-manage =
    .label = Manage
nyx-ext-menu-remove =
    .label = Remove…
nyx-ext-menu-report =
    .label = Report…
nyx-ext-empty-title = No extensions yet
nyx-ext-empty-text = Add one for dark mode, reading lists, references and more.
nyx-ext-get = Get extensions
nyx-ext-blocking = Blocking
nyx-ext-passwords = Passwords
nyx-ext-vpn = VPN
nyx-ext-built-in = Built in
# $count (Number) - How many requests Blocking stopped on this page
nyx-ext-blocked-count = { $count } blocked
nyx-ext-on = On
nyx-ext-off = Off
nyx-ext-blocked = Blocked
nyx-ext-get-more = Get more
nyx-ext-addons-site = Add-ons site

## The tab list (src/nyx/modules/tablist.js)

nyx-tablist-asleep = Asleep — opens when you choose it
nyx-tablist-mute = Mute
nyx-tablist-unmute = Unmute
nyx-tablist-close = Close tab
nyx-tablist-search = Search tabs
nyx-tablist-today = Today
nyx-tablist-clear = Clear
nyx-tablist-clear-title = Close today's tabs
nyx-tablist-new = New tab
nyx-tablist =
    .aria-label = Tabs
# A tab folder that has no name yet
nyx-tablist-folder = Folder

## Accent colours, wherever Browser's accent is picked (Themes, Settings, Appearance)

nyx-accent-blue =
    .aria-label = Blue
    .title = Blue
nyx-accent-violet =
    .aria-label = Violet
    .title = Violet
nyx-accent-pink =
    .aria-label = Pink
    .title = Pink
nyx-accent-red =
    .aria-label = Red
    .title = Red
nyx-accent-coral =
    .aria-label = Coral
    .title = Coral
nyx-accent-amber =
    .aria-label = Amber
    .title = Amber
nyx-accent-green =
    .aria-label = Green
    .title = Green
nyx-accent-teal =
    .aria-label = Teal
    .title = Teal
nyx-accent-graphite =
    .aria-label = Graphite
    .title = Graphite

## The Appearance panel (src/nyx/modules/appearance.js), Ctrl+,

nyx-appearance-pop-panel =
    .aria-label = Appearance
nyx-appearance-pop-title = Appearance
nyx-appearance-pop-layout = Layout
nyx-appearance-pop-layout-group =
    .aria-label = Layout
nyx-appearance-pop-studio = Studio
nyx-appearance-pop-focus = Focus
nyx-appearance-pop-workbench = Workbench
nyx-appearance-pop-sidebar = Sidebar
nyx-appearance-pop-sidebar-group =
    .aria-label = Sidebar
nyx-appearance-pop-sidebar-auto = Follows window width
nyx-appearance-pop-sidebar-vertical = Studio and Focus only
nyx-appearance-pop-auto = Automatic
nyx-appearance-pop-expanded = Expanded
nyx-appearance-pop-compact = Compact
nyx-appearance-pop-hidden = Hidden
nyx-appearance-pop-theme = Theme
# $name (String) - the theme the system shows now, like Omarchy
nyx-appearance-pop-theme-follow = Follow system ({ $name })
nyx-appearance-pop-all-themes = All themes
nyx-appearance-pop-accent = Accent
nyx-appearance-pop-accent-group =
    .aria-label = Accent
nyx-appearance-pop-accent-default =
    .title = Theme default
    .aria-label = Theme default
nyx-appearance-pop-density = Density
nyx-appearance-pop-density-group =
    .aria-label = Density
nyx-appearance-pop-density-default = Default
nyx-appearance-pop-balanced = Balanced
nyx-appearance-pop-relaxed = Relaxed
nyx-appearance-pop-frosted = Frosted menus
nyx-appearance-pop-all = All browser settings

## Site card · On this site

nyx-site-onsite = On this site
nyx-site-style-browser = Browser's style · follows your theme
nyx-site-style-yours = Your style
nyx-site-script-running = Script · running
nyx-site-styles-link = Site styles
nyx-site-install-style = Install this style?
nyx-site-install-script = Install this script?
nyx-site-install-button = Install
nyx-site-install-cancel = Cancel
nyx-site-install-updates = Keep up to date
nyx-site-install-done = Installed.
nyx-site-install-failed = Couldn't install. Try again.
nyx-site-install-untitled-style = Untitled style
nyx-site-install-untitled-script = Untitled script
nyx-site-install-applies = Where it applies
nyx-site-install-runs-on = Runs on
nyx-site-install-may-do = What it may do
nyx-site-install-talks-to = Talks to another site
nyx-site-install-options = { $count } options
nyx-site-install-options-later = Set them after installing
