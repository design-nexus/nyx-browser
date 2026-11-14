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
pane-nyx-selection-title = Selection Search
category-nyx-selection =
    .tooltiptext = { pane-nyx-selection-title }
pane-nyx-downloads-title = Downloads
category-nyx-downloads =
    .tooltiptext = { pane-nyx-downloads-title }
nyx-pane-group-privacy = Privacy
pane-nyx-passwords-title = Passwords
category-nyx-passwords =
    .tooltiptext = { pane-nyx-passwords-title }
pane-nyx-blocking-title = Content Blocking
category-nyx-blocking =
    .tooltiptext = { pane-nyx-blocking-title }
pane-nyx-vpn-title = VPN
category-nyx-vpn =
    .tooltiptext = { pane-nyx-vpn-title }

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

nyx-tabs-group-new = New tabs
nyx-tabs-new-position = Open new tabs
nyx-tabs-new-next =
    .label = Next to this one
nyx-tabs-new-related =
    .label = After related tabs
nyx-tabs-new-end =
    .label = At the end
nyx-tabs-bookmarks = Open bookmarks in
nyx-tabs-in-new =
    .label = A new tab
nyx-tabs-in-background =
    .label = A background tab
nyx-tabs-in-this =
    .label = This tab
nyx-tabs-in-window =
    .label = A new window
nyx-tabs-urlbar = Address bar and search results open in
nyx-tabs-urlbar-description = Alt+Enter does the other
nyx-tabs-external = Links from other apps open in

nyx-tabs-group-closing = Closing tabs
nyx-tabs-after-close = After closing a tab, go to
nyx-tabs-after-recent =
    .label = Last used
nyx-tabs-after-left =
    .label = The left
nyx-tabs-after-right =
    .label = The right
nyx-tabs-after-opener =
    .label = Its opener
nyx-tabs-warn-close =
    .label = Ask before closing a window with several tabs

nyx-tabs-group-bar = Tab bar
nyx-tabs-double-click = Double-clicking a tab
nyx-tabs-double-click-description = Renaming works with the sidebar expanded
nyx-tabs-dbl-rename =
    .label = Renames it
nyx-tabs-dbl-close =
    .label = Closes it
nyx-tabs-dbl-pin =
    .label = Pins or unpins it
nyx-tabs-dbl-unload =
    .label = Unloads it
nyx-tabs-dbl-none =
    .label = Does nothing
nyx-tabs-close-buttons = Close buttons
nyx-tabs-close-always =
    .label = Always
nyx-tabs-close-hover =
    .label = On hover
nyx-tabs-close-active =
    .label = Active tab only
nyx-tabs-overflow = When tabs don't fit
nyx-tabs-overflow-description = With tabs in a row; pinned tabs always stay in sight
nyx-tabs-overflow-shrink =
    .label = Shrink them
nyx-tabs-overflow-scroll =
    .label = Scroll
nyx-tabs-wheel =
    .label = Switch tabs with the mouse wheel over them
nyx-tabs-hover-preview =
    .label = Show a preview when hovering a tab
nyx-tabs-pinned-restore =
    .label = Pinned tabs go back to their pinned page
nyx-tabs-pinned-restore-description = When Browser starts, wherever they had been

nyx-tabs-group-switching = Switching
nyx-tabs-ctrl-tab = Ctrl+Tab goes through tabs
nyx-tabs-ctrl-tab-description = Recently used shows the tabs while you switch
nyx-tabs-ctrl-recent =
    .label = Recently used
nyx-tabs-ctrl-order =
    .label = In order

nyx-tabs-group-unload = Unloading
nyx-tabs-unload-after = Unload background tabs after
nyx-tabs-unload-after-description = They stay in place and load again when you come back; tabs playing sound stay loaded
nyx-tabs-unload-never =
    .label = Never
nyx-tabs-unload-15 =
    .label = 15 minutes
nyx-tabs-unload-30 =
    .label = 30 minutes
nyx-tabs-unload-60 =
    .label = 1 hour
nyx-tabs-unload-240 =
    .label = 4 hours
nyx-tabs-unload-pinned =
    .label = Unload pinned tabs too
nyx-tabs-restore-on-demand =
    .label = Load restored tabs only when you open them

nyx-tabs-group-startup = Startup
nyx-tabs-startup = When Browser starts
nyx-tabs-startup-restore =
    .label = Continue where you left off
nyx-tabs-startup-home =
    .label = The start page
nyx-tabs-sessions = Sessions
nyx-tabs-sessions-description = Save the open tabs under a name and open them again later
# $count (Number) - How many sessions are saved
nyx-tabs-sessions-saved = { $count ->
    [one] One session saved
   *[other] { $count } sessions saved
}
nyx-tabs-sessions-save =
    .label = Save open tabs…
nyx-tabs-sessions-list =
    .label = Saved
nyx-tabs-sessions-empty =
    .label = No saved sessions
nyx-tabs-sessions-name-title = Save open tabs
nyx-tabs-sessions-name-prompt = Name this session:
# $count (Number) - How many tabs the session has
nyx-tabs-sessions-open =
    .label = Open ({ $count ->
        [one] one tab
       *[other] { $count } tabs
    })
nyx-tabs-sessions-delete =
    .label = Delete
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
nyx-integrations-passwords-built-in = Built into Browser: logins, passkeys, cards and addresses come from Nyx Passwords. See Settings › Passwords.

## Shared

nyx-chip-add =
    .label = Add…
# $name (String) - What the chip stands for, such as a site
nyx-chip-remove =
    .tooltiptext = Remove { $name }
nyx-chip-add-site-title = Add a site
nyx-chip-add-site-prompt = The site’s address, such as example.com:

## Selection Search

nyx-selection-group-popup = Popup
nyx-selection-mode = Show the popup
nyx-selection-mode-description = When you select text on a page
nyx-selection-mode-selection =
    .label = On selection
nyx-selection-mode-alt =
    .label = Holding Alt
nyx-selection-mode-middle =
    .label = Middle-click
nyx-selection-mode-off =
    .label = Off
nyx-selection-textbox =
    .label = Edit the text before searching
nyx-selection-textbox-description = A text box above the icons, with the selection in it
nyx-selection-size = Icon size
nyx-selection-size-small =
    .label = Small
nyx-selection-size-medium =
    .label = Medium
nyx-selection-size-large =
    .label = Large
nyx-selection-group-engines = Engines
nyx-selection-engines-description = Drag to reorder; switch an engine off to leave it out of the popup. Engines come from Firefox’s search settings.
nyx-selection-manage =
    .label = Add or remove engines…
# $keyword (String) - The engine's keyword, such as g
nyx-selection-keyword = Keyword { $keyword }
nyx-selection-group-results = Results
nyx-selection-open = Open results in
nyx-selection-open-description = A middle click on an engine always opens a background tab
nyx-selection-open-tab =
    .label = A new tab
nyx-selection-open-background =
    .label = A background tab
nyx-selection-open-current =
    .label = This tab
nyx-selection-off = Turned off on
nyx-selection-off-none = Every site

## Passwords

nyx-passwords-app = Nyx Passwords
nyx-passwords-state-unlocked = Connected and unlocked. Browser keeps no passwords of its own.
nyx-passwords-state-locked = Connected; the vault is locked. Unlock it in Passwords.
nyx-passwords-state-unpaired = Not paired yet: open Passwords from its button to pair Browser once.
nyx-passwords-state-unavailable = Passwords isn’t running, or isn’t installed on this computer.
nyx-passwords-open =
    .label = Open Passwords
nyx-passwords-lock =
    .label = Lock
nyx-passwords-group-fill = Filling
nyx-passwords-fill-on-load =
    .label = Fill logins when a page loads
nyx-passwords-fill-on-load-description = On HTTPS, when the site has one login saved, into empty fields
nyx-passwords-field-icons =
    .label = Show the key in login fields
nyx-passwords-field-icons-description = Click it, or the field, for the site’s logins
nyx-passwords-inline-menu =
    .label = Show the menu when you click into a login field
nyx-passwords-copy-totp =
    .label = Copy the one-time code after filling
nyx-passwords-group-save = Saving
nyx-passwords-offer-save =
    .label = Offer to save new logins and changed passwords
nyx-passwords-remember-sign-in =
    .label = Remember “Sign in with …”
nyx-passwords-remember-sign-in-description = After you sign in with Google, Apple or another account, Passwords offers to click it for you next time
nyx-passwords-group-passkeys = Passkeys
nyx-passwords-passkeys =
    .label = Use passkeys from Nyx Passwords
nyx-passwords-passkeys-description = Sites ask Passwords first; with nothing saved there, or when you choose, the browser’s own (a security key) is used
nyx-passwords-passkey-auto =
    .label = Sign in by itself when only one passkey fits
nyx-passwords-group-firefox = Firefox’s saved logins
# $count (Number) - Logins saved in this profile by Firefox's own password manager
nyx-passwords-firefox-count = { $count ->
    [0] No logins saved in this profile
    [one] One login saved in this profile, outside Passwords
   *[other] { $count } logins saved in this profile, outside Passwords
}
nyx-passwords-import-description = Each one moves into Passwords and leaves the profile
nyx-passwords-import =
    .label = Import into Passwords
# $moved (Number) - Logins moved, $left (Number) - logins still in the profile
nyx-passwords-imported = { $moved } moved into Passwords; { $left } left in the profile

## Downloads

nyx-downloads-group-files = Files
nyx-downloads-folder = Save files to
nyx-downloads-change =
    .label = Change…
nyx-downloads-folder-title = Save files to
nyx-downloads-ask =
    .label = Ask where to save each file
nyx-downloads-open-panel =
    .label = Open the Downloads panel when a download starts
nyx-downloads-group-videos = Videos
nyx-video-offer =
    .label = Offer to download videos
nyx-video-offer-description = The download button in the address field, on video sites and pages playing something
nyx-video-quality = Start on the quality
nyx-video-quality-best =
    .label = The best there is
nyx-video-quality-audio =
    .label = Sound only
nyx-video-audio = Sound only, as
nyx-video-folder = Save videos to
nyx-video-folder-title = Save videos to
nyx-video-names = File names
nyx-video-names-title-channel =
    .label = Title [Channel]
nyx-video-names-title =
    .label = Title
nyx-video-names-channel-title =
    .label = Channel - Title
nyx-video-names-date-title =
    .label = Date Title
nyx-video-embed =
    .label = Put chapters, details and the thumbnail in the file
nyx-video-cookies =
    .label = Videos that need you signed in
nyx-video-cookies-description = yt-dlp uses Browser’s sign-in for that site, read from this profile, and only for the video you download
# $version (String) - yt-dlp's version; $path (String) - where it is
nyx-video-version = { $version } · { $path } · updated with the system
nyx-video-missing = Not installed: video downloads need yt-dlp (and ffmpeg to merge video and sound)

## VPN

nyx-vpn-group-connections = Connections
nyx-vpn-connections-description = Only Browser’s traffic goes through these; the rest of the computer doesn’t. Logins are kept encrypted in this profile, like saved passwords.
nyx-vpn-add-button =
    .label = Add VPN…
nyx-vpn-connect =
    .label = Connect
nyx-vpn-disconnect =
    .label = Disconnect
nyx-vpn-remove =
    .label = Remove
nyx-vpn-group-add = Add a VPN
nyx-vpn-provider = Provider
nyx-vpn-provider-proxy =
    .label = Proxy
nyx-vpn-type = Kind
nyx-vpn-server-field = Server and port
nyx-vpn-username = Username
nyx-vpn-service-username = Service username
nyx-vpn-username-optional = Username, if it asks
nyx-vpn-password = Password
nyx-vpn-help-nordvpn = Not your NordVPN account password: your service credentials, under Manual setup in your Nord Account
nyx-vpn-help-pia = Your PIA proxy login (it starts with “x”), from the Downloads page of your account
nyx-vpn-help-proxy = Any SOCKS5, HTTPS or HTTP proxy, with its login if it has one
nyx-vpn-need-login = Enter the username and password.
nyx-vpn-cancel =
    .label = Cancel
nyx-vpn-save =
    .label = Add
nyx-vpn-group-workspaces = Workspaces
nyx-vpn-workspaces-description = Each workspace can go through its own VPN, through none, or follow the switch in the VPN panel.
nyx-vpn-workspace-default =
    .label = The VPN panel’s switch
nyx-vpn-workspace-none =
    .label = No VPN
nyx-vpn-group-protection = Protection
nyx-vpn-kill-switch =
    .label = Stop browsing if the VPN drops
nyx-vpn-kill-switch-description = Pages wait instead of loading without it
nyx-vpn-remote-dns =
    .label = Look up addresses through the VPN
nyx-vpn-remote-dns-description = Site names go to the VPN to look up, not to your network’s server
nyx-vpn-webrtc =
    .label = Keep calls from showing your real address
nyx-vpn-webrtc-description = Video and voice calls (WebRTC) use the VPN too
nyx-vpn-bypass = Sites that skip the VPN
nyx-vpn-bypass-none = This computer and your local network always do

## Content Blocking

nyx-blocking-group = Blocking
nyx-blocking-on = Block ads and trackers
# $version (String) - uBlock Origin's version
nyx-blocking-version = uBlock Origin { $version }, built in; its filter lists update themselves
nyx-blocking-missing = uBlock Origin isn’t in this build
nyx-blocking-lists = Filter lists and your own filters
nyx-blocking-lists-description = EasyList, EasyPrivacy, uBlock’s own and more: choose them in uBlock’s dashboard
nyx-blocking-open-lists =
    .label = Filter lists…
nyx-blocking-trusted = Sites not blocked
nyx-blocking-trusted-description = The shield in the address field turns blocking off for a site; the list is here
nyx-blocking-open-trusted =
    .label = Trusted sites…
nyx-blocking-group-also = Also
nyx-blocking-cookie-banners =
    .label = Reject cookie banners
nyx-blocking-cookie-banners-description = Firefox answers them for you, refusing where it can
nyx-blocking-query-stripping =
    .label = Remove tracking from links
nyx-blocking-query-stripping-description = Parameters such as fbclid and mc_eid, when you open a link
