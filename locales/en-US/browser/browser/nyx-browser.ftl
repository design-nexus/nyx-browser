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
nyx-share-copy-link =
    .title = Copy link
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
