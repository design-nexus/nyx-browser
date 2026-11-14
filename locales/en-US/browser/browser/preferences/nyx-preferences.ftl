# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Browser's settings panes and their place in Settings' navigation.

nyx-find =
    .placeholder = Find in Settings
    .aria-label = Find in Settings
# $query (String) - What was typed into Find in Settings
nyx-find-results = Results for “{ $query }”
# $count (Number) - How many settings match; $panes (Number) - in how many panes
nyx-find-count =
    { $count ->
        [one] 1 setting
       *[other] { $count } settings
    } in { $panes ->
        [one] 1 pane
       *[other] { $panes } panes
    }
nyx-find-none = No settings match

nyx-pane-group-browser = Browser
nyx-pane-group-privacy = Privacy
nyx-pane-group-tools = Tools

pane-nyx-general-title = General
pane-nyx-general-sub = Startup, files and language
category-nyx-general =
    .tooltiptext = { pane-nyx-general-title }
pane-nyx-appearance-title = Appearance
pane-nyx-appearance-sub = Theme, colours and how pages look
category-nyx-appearance =
    .tooltiptext = { pane-nyx-appearance-title }
pane-nyx-tabs-title = Layout & tabs
pane-nyx-tabs-sub = How the window is laid out, and how tabs behave
category-nyx-tabs =
    .tooltiptext = { pane-nyx-tabs-title }
pane-nyx-start-title = Start page
pane-nyx-start-sub = What new windows and tabs open on
category-nyx-start =
    .tooltiptext = { pane-nyx-start-title }
pane-nyx-search-title = Search
pane-nyx-search-sub = Engines, suggestions and keywords
category-nyx-search =
    .tooltiptext = { pane-nyx-search-title }
pane-nyx-blocking-title = Privacy & blocking
pane-nyx-blocking-sub = What sites can see and keep
category-nyx-blocking =
    .tooltiptext = { pane-nyx-blocking-title }
pane-nyx-passwords-title = Passwords
pane-nyx-passwords-sub = Logins and passkeys, filled by Nyx Passwords
category-nyx-passwords =
    .tooltiptext = { pane-nyx-passwords-title }
pane-nyx-permissions-title = Permissions
pane-nyx-permissions-sub = What sites can use, and which sites you've let
category-nyx-permissions =
    .tooltiptext = { pane-nyx-permissions-title }
pane-nyx-vpn-title = VPN
pane-nyx-vpn-sub = Connections, and which workspaces use them
category-nyx-vpn =
    .tooltiptext = { pane-nyx-vpn-title }
pane-nyx-selection-title = Selection search
pane-nyx-selection-sub = Search what you select, in one click
category-nyx-selection =
    .tooltiptext = { pane-nyx-selection-title }
pane-nyx-downloads-title = Downloads
pane-nyx-downloads-sub = Files and videos you save
category-nyx-downloads =
    .tooltiptext = { pane-nyx-downloads-title }
pane-nyx-gestures-title = Gestures
pane-nyx-gestures-sub = Touchpad, mouse and keyboard
category-nyx-gestures =
    .tooltiptext = { pane-nyx-gestures-title }
pane-nyx-extensions-title = Extensions
pane-nyx-extensions-sub = What you've added to Browser
category-nyx-extensions =
    .tooltiptext = { pane-nyx-extensions-title }
pane-nyx-sync-title = Sync
pane-nyx-sync-sub = Your bookmarks, history and tabs on your other devices
category-nyx-sync =
    .tooltiptext = { pane-nyx-sync-title }

## Appearance

nyx-appearance-group-theme = Theme
nyx-appearance-theme = Theme
nyx-appearance-theme-description = Browser follows your Nyx theme as it changes; a theme chosen here is for Browser alone
# $name (String) - the theme the system shows now, like Omarchy
nyx-appearance-theme-follow-name =
    .label = Follow system ({ $name })
nyx-appearance-all-themes =
    .label = All themes…
nyx-appearance-accent = Accent
nyx-appearance-accent-default =
    .label = Theme default
nyx-appearance-accent-blue =
    .label = Blue
nyx-appearance-accent-violet =
    .label = Violet
nyx-appearance-accent-pink =
    .label = Pink
nyx-appearance-accent-red =
    .label = Red
nyx-appearance-accent-coral =
    .label = Coral
nyx-appearance-accent-amber =
    .label = Amber
nyx-appearance-accent-green =
    .label = Green
nyx-appearance-accent-teal =
    .label = Teal
nyx-appearance-accent-graphite =
    .label = Graphite
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

nyx-layout-studio =
    .label = Studio
    .tooltiptext = Header, bookmarks bar, tab sidebar
nyx-layout-focus =
    .label = Focus
    .tooltiptext = Sidebar only, with the address and a bookmarks shelf
nyx-layout-workbench =
    .label = Workbench
    .tooltiptext = Tab bar, address bar, Library rail
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

nyx-tabs-startup = When Browser starts
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
nyx-sidebar-mode = Sidebar
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

nyx-toolbar-buttons = Buttons
nyx-toolbar-buttons-description = Choose and arrange them; those without room go into More tools
nyx-toolbar-customize =
    .label = Customize…
nyx-toolbar-qr =
    .label = Show the QR code button in the address field
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
nyx-selection-engines-description = Drag to reorder; switch an engine off to leave it out of the popup. Engines come from Settings › Search.
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
nyx-passwords-group-firefox = Logins saved before Nyx Passwords
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
nyx-vpn-help-nordvpn = Not your NordVPN account password: your service credentials, under Manual setup in your Nord Account
nyx-vpn-help-pia = Your PIA proxy login (it starts with “x”), from the Downloads page of your account
nyx-vpn-help-proxy = Any SOCKS5, HTTPS or HTTP proxy, with its login if it has one
nyx-vpn-username = Username
nyx-vpn-service-username = Service username
nyx-vpn-username-optional = Username, if it asks
nyx-vpn-password = Password
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
nyx-blocking-cookie-banners-description = Browser answers them for you, refusing where it can
nyx-blocking-query-stripping =
    .label = Remove tracking from links
nyx-blocking-query-stripping-description = Parameters such as fbclid and mc_eid, when you open a link

## General

nyx-general-group-startup = Startup
nyx-general-startup-restore =
    .label = Open last session
nyx-general-startup-home =
    .label = Open the start page
nyx-general-startup-blank =
    .label = Open a blank page
nyx-general-default = Default browser
nyx-general-default-note = Browser opens links from other apps
nyx-general-default-yes = Yes
nyx-general-default-make =
    .label = Make default
nyx-general-group-files = Files
nyx-general-pdf = Open PDFs in
nyx-general-pdf-browser =
    .label = Browser
nyx-general-pdf-app =
    .label = Your PDF app
nyx-general-group-language = Language
nyx-general-language = Language
nyx-general-web-languages = Languages for websites
nyx-general-web-languages-note = The order sites are asked to use
nyx-general-choose =
    .label = Choose…
nyx-general-translate =
    .label = Offer to translate pages
nyx-general-translate-note = In languages you don't read
nyx-general-spellcheck =
    .label = Check spelling as you type
nyx-general-group-apps = Nyx apps
nyx-general-group-system = System
nyx-general-acceleration =
    .label = Use the graphics card
nyx-general-acceleration-note = Smoother pages; turn off if they draw wrongly
nyx-general-connection = Network
nyx-general-connection-note = Proxies and how Browser connects
nyx-general-settings-button =
    .label = Settings…
nyx-general-customize =
    .label = Customize…

## Appearance › Pages

nyx-appearance-group-pages = Pages
nyx-appearance-sites = Website appearance
nyx-appearance-sites-note = For sites that come in light and dark
nyx-appearance-sites-auto =
    .label = Automatic
nyx-appearance-sites-light =
    .label = Light
nyx-appearance-sites-dark =
    .label = Dark
nyx-appearance-fonts = Fonts

## Layout & tabs › In this layout

nyx-tabs-group-in-layout = In this layout
nyx-tabs-shelf = Bookmarks shelf
nyx-tabs-shelf-note = Bookmarks as tiles above the tabs
nyx-tabs-shelf-shown =
    .label = Shown
nyx-tabs-shelf-folded =
    .label = Folded
nyx-tabs-shelf-hidden =
    .label = Hidden

## Start page

nyx-start-group-pages = Pages
nyx-start-home = New windows open
nyx-start-home-note = And the Home button
nyx-start-page =
    .label = Start page
nyx-start-blank =
    .label = Blank page
nyx-start-custom =
    .label = An address…
nyx-start-custom-address = Address
nyx-start-new-tabs = New tabs open
nyx-start-group-shows = What it shows
nyx-start-customize = Greeting, sites and recent tabs
nyx-start-customize-note = Change them on the start page, with Customize
nyx-start-open =
    .label = Open the start page

## Search

nyx-search-group-default = Default engine
nyx-search-default = In the address bar
nyx-search-default-private = In private windows
nyx-search-group-suggestions = Suggestions
nyx-search-suggestions =
    .label = Search suggestions
nyx-search-suggestions-note = From the engine as you type
nyx-search-places =
    .label = Open tabs, history and bookmarks
nyx-search-commands =
    .label = Commands
nyx-search-commands-note = Split view, workspaces, site data…
nyx-search-group-keywords = Engines and keywords
# $keyword (String) - An engine's keyword, like w
nyx-search-keyword-note = Type { $keyword } and a space
nyx-search-no-keyword = No keyword
nyx-search-set-keyword =
    .label = Add keyword
nyx-search-keywords-note = A keyword before what you type searches that engine
nyx-search-restore =
    .label = Restore defaults
nyx-search-add =
    .label = Add engine
nyx-search-keyword-title = Keyword
# $engine (String) - A search engine's name
nyx-search-keyword-prompt = A keyword for { $engine }, typed before a search
# $keyword (String) - The keyword; $engine (String) - The engine that has it
nyx-search-keyword-taken = { $engine } already has “{ $keyword }”.

## Privacy & blocking

nyx-privacy-group-cookies = Cookies and site data
nyx-privacy-third-party = Third-party cookies
nyx-privacy-cookies-partitioned =
    .label = Kept to each site
nyx-privacy-cookies-blocked =
    .label = Blocked
nyx-privacy-cookies-allowed =
    .label = Allowed
nyx-privacy-clear-on-close =
    .label = Delete cookies when Browser closes
nyx-privacy-clear-on-close-note = Except sites you keep
nyx-privacy-exceptions = Sites you keep or block
nyx-privacy-exceptions-note = Their cookies, whatever the rule
nyx-privacy-stored = Stored data
# $amount (Number) - How much; $unit (String) - kB, MB…; $sites (Number) - On how many sites
nyx-privacy-stored-note =
    { $amount } { $unit } on { $sites ->
        [one] 1 site
       *[other] { $sites } sites
    }
nyx-privacy-manage =
    .label = Manage
nyx-privacy-group-history = History
nyx-privacy-keep-history = Keep history
nyx-privacy-history-remember =
    .label = Remember
nyx-privacy-history-never =
    .label = Never
nyx-privacy-clear-history = Clear history…
nyx-privacy-clear =
    .label = Clear
nyx-privacy-group-security = Security
nyx-privacy-strict =
    .label = Strict tracking protection
nyx-privacy-strict-note = Blocks more trackers; a few sites may break
nyx-privacy-https = HTTPS only
nyx-privacy-https-note = Asks before opening a page that isn't encrypted
nyx-privacy-https-all =
    .label = Everywhere
nyx-privacy-https-private =
    .label = Private windows
nyx-privacy-https-off =
    .label = Off
nyx-privacy-dns = Secure DNS
nyx-privacy-dns-note = Looks up sites through an encrypted resolver
nyx-privacy-dns-default =
    .label = Automatic
nyx-privacy-dns-increased =
    .label = On
nyx-privacy-dns-max =
    .label = Always
nyx-privacy-dns-off =
    .label = Off
nyx-privacy-safe-browsing =
    .label = Warn about dangerous sites and downloads
nyx-privacy-safe-browsing-note = Checked against lists of known ones
nyx-privacy-gpc =
    .label = Ask sites not to sell or share my data
nyx-privacy-gpc-note = Global Privacy Control
nyx-privacy-certificates = Certificates
nyx-privacy-view =
    .label = View

## Permissions

nyx-permissions-group-ask = Sites ask to use
nyx-permissions-location = Location
nyx-permissions-camera = Camera
nyx-permissions-microphone = Microphone
nyx-permissions-notifications = Notifications
nyx-permissions-vr = Virtual reality
# $count (Number) - How many sites have a decision for this
nyx-permissions-sites =
    { $count ->
        [0] No sites yet
        [one] 1 site
       *[other] { $count } sites
    }
nyx-permissions-group-pages = Pages
nyx-permissions-autoplay = Autoplay
nyx-permissions-autoplay-allow =
    .label = Allow audio and video
nyx-permissions-autoplay-audio =
    .label = Block audio
nyx-permissions-autoplay-all =
    .label = Block audio and video
nyx-permissions-popups = Pop-ups
nyx-permissions-popups-note = Blocked, except on sites you allow
nyx-permissions-popups-switch =
    .aria-label = Block pop-ups
nyx-permissions-addons = Add-on installs
nyx-permissions-addons-note = Sites ask before installing add-ons
nyx-permissions-addons-switch =
    .aria-label = Warn when sites install add-ons
nyx-permissions-exceptions =
    .label = Exceptions

## Downloads › Panel

nyx-downloads-group-panel = Downloads
nyx-downloads-files = Your downloads
nyx-downloads-files-note = In the Library
nyx-downloads-files-button =
    .label = Show

## Gestures

nyx-gestures-group-touchpad = Touchpad
nyx-gestures-swipe =
    .label = Swipe to go back and forward
nyx-gestures-swipe-note = Two fingers, left or right
nyx-gestures-pinch =
    .label = Pinch to zoom
nyx-gestures-group-mouse = Mouse
nyx-gestures-smooth =
    .label = Scroll smoothly
nyx-gestures-autoscroll =
    .label = Autoscroll
nyx-gestures-autoscroll-note = Click the middle button and move to scroll
nyx-gestures-paste =
    .label = Paste with the middle button
nyx-gestures-ctrl-wheel =
    .label = Zoom with Ctrl and the wheel
nyx-gestures-group-keys = Keyboard
nyx-gestures-shortcuts = Keyboard shortcuts
nyx-gestures-shortcuts-note = See and change Browser's shortcuts
nyx-gestures-edit =
    .label = Edit

## Extensions

nyx-extensions-group-installed = Installed
nyx-extensions-yours = Your extensions
# $added (Number) - how many you've added; $on (Number) - how many of them are on
nyx-extensions-count =
    { $added ->
        [0] None yet
       *[other] { $added } added · { $on } on
    }
nyx-extensions-shortcuts = Their shortcuts
nyx-extensions-shortcuts-note = Keys for what extensions can do
nyx-extensions-get-note = Extensions from the add-ons site
nyx-extensions-manage =
    .label = Open Extensions
nyx-extensions-get =
    .label = Get extensions

## Sync

nyx-sync-group-account = Account
nyx-sync-account = Sync
nyx-sync-signed-out = Not signed in
# $email (String) - The account's email address
nyx-sync-signed-in = Signed in as { $email }
# $email (String) - The account's email address
nyx-sync-syncing = Syncing { $email }…
# $email (String) - The account's email address
nyx-sync-needs-attention = { $email } needs you to sign in again
nyx-sync-sign-in =
    .label = Sign in
nyx-sync-now =
    .label = Sync now
nyx-sync-sign-out =
    .label = Sign out
nyx-sync-group-engines = What syncs
nyx-sync-bookmarks =
    .label = Bookmarks
nyx-sync-history =
    .label = History
nyx-sync-tabs =
    .label = Open tabs
nyx-sync-addons =
    .label = Extensions
nyx-sync-prefs =
    .label = Settings
nyx-sync-prefs-note = Those that make sense on every device

## Gestures › Keyboard shortcuts

nyx-keys-back =
    .label = ‹ Gestures
pane-nyx-keys-title = Keyboard shortcuts
pane-nyx-keys-sub = Browser's keys. Change any of them; an extension's are in Extensions › Shortcuts.
nyx-keys-reset-all =
    .label = Reset all
nyx-keys-find =
    .placeholder = Find a shortcut
    .aria-label = Find a shortcut
nyx-keys-change =
    .label = Change
nyx-keys-clear =
    .label = Clear
nyx-keys-reset =
    .label = Reset
nyx-keys-none = Not set
nyx-keys-press = Press the keys · Esc keeps the old ones
nyx-keys-invalid = Use Ctrl or Alt with it
nyx-keys-taken-title = Use these keys here?
# $shortcut (String) - like Ctrl+T; $other (String) - what the keys do now
nyx-keys-taken = { $shortcut } is “{ $other }” now. It will have no keys.
nyx-keys-reset-all-title = Reset every shortcut?
nyx-keys-reset-all-body = Every shortcut goes back to Browser's own.

## About Browser

pane-nyx-about-title = About Browser
pane-nyx-about-sub = Its version, its updates and who made it
category-nyx-about =
    .tooltiptext = { pane-nyx-about-title }
# $version (String) - like 1.4; $date (String) - the build's date; $engine (String) - the engine's version; $arch (String) - like 64-bit
nyx-about-version = Version { $version } · { $date } · engine { $engine } ({ $arch })
nyx-about-check =
    .label = Check for updates
nyx-about-download =
    .label = Download and install
nyx-about-restart =
    .label = Restart to update
nyx-about-manual =
    .label = Download manually
nyx-about-try-again =
    .label = Try again
nyx-about-news = What's new
nyx-about-open =
    .label = Open
nyx-about-copy = Version info
nyx-about-copy-button =
    .label = Copy
nyx-about-copied =
    .label = Copied
nyx-about-credits = Credits
nyx-about-credits-note = Everyone who made Browser, and what it's built on
nyx-about-licences = Licences
nyx-about-licences-note = Browser is free software
nyx-about-report = Report a problem
nyx-about-report-note = Or ask for something, on GitHub

## Layout & tabs › Containers

nyx-containers-group = Containers
nyx-containers-note = Sites in one container can't see your cookies in another. Open a link in one from its menu, a tab's menu, or a space.
nyx-containers-new =
    .label = New container
nyx-containers-new-name = New container
# $count (Number) - how many tabs it has open
nyx-containers-tabs =
    { $count ->
        [0] None open
        [one] 1 tab open
       *[other] { $count } tabs open
    }
nyx-containers-edit =
    .label = Edit
nyx-containers-remove =
    .label = Remove
nyx-containers-done =
    .label = Done
nyx-containers-name =
    .aria-label = Name
nyx-containers-colour =
    .value = Colour
nyx-containers-icon =
    .value = Icon
nyx-containers-remove-title = Remove this container?
# $name (String) - the container's name; $count (Number) - how many of its tabs are open
nyx-containers-remove-body =
    { $count ->
        [0] { $name } goes, with its cookies and site data.
        [one] { $name } goes, with its cookies and site data. Its open tab closes.
       *[other] { $name } goes, with its cookies and site data. Its { $count } open tabs close.
    }

## Site styles

pane-nyx-styles-title = Site styles
pane-nyx-styles-sub = Styles that change how sites look. Browser's follow your theme.
nyx-styles-import =
    .label = Import
nyx-styles-new =
    .label = New style
nyx-styles-group-builtin = Browser's styles
nyx-styles-group-mine = Your styles
nyx-styles-none = None yet. Import a Stylus backup, or write one.
nyx-styles-back =
    .label = Site styles
nyx-styles-name =
    .placeholder = Name
nyx-styles-enabled =
    .label = On
nyx-styles-saved = Saved
nyx-styles-undo =
    .label = Undo changes
nyx-styles-save =
    .label = Save
nyx-styles-applies = Applies to
nyx-styles-options = Its options
nyx-styles-domain = Domain, and its subdomains
nyx-styles-prefix = Addresses that start with this
nyx-styles-no-options = This style has no options.
nyx-styles-import-title = Import styles
nyx-styles-import-confirm = Import { $count } styles from this Stylus backup?
nyx-styles-import-done =
    { $count ->
        [one] Imported 1 style.
       *[other] Imported { $count } styles.
    }

## Scripts

pane-nyx-scripts-title = Scripts
pane-nyx-scripts-sub = Little programs that run on the sites they name, like Tampermonkey's.
nyx-scripts-import =
    .label = Import
nyx-scripts-new =
    .label = New script
nyx-scripts-find =
    .placeholder = Find a script
nyx-scripts-check =
    .label = Check for updates
nyx-scripts-foot = Scripts run only on their sites. Their menus are in the Site card.
nyx-scripts-none = None yet. Import from Tampermonkey, or write one.
nyx-scripts-back =
    .label = Scripts
nyx-scripts-enabled =
    .label = On
nyx-scripts-tab-code =
    .label = Code
nyx-scripts-tab-values =
    .label = Values
nyx-scripts-saved = Saved
nyx-scripts-undo =
    .label = Undo changes
nyx-scripts-save =
    .label = Save
nyx-scripts-grants = What it may do
nyx-scripts-grant-sites = Runs on
nyx-scripts-grant-api = Functions it asked for
nyx-scripts-grant-connect = Talks to
nyx-scripts-value-add =
    .label = Add a value
nyx-scripts-value-clear =
    .label = Clear all
nyx-scripts-values-note = What the script kept with GM_setValue.
nyx-scripts-values-empty = Nothing stored.
nyx-scripts-import-title = Import scripts
nyx-scripts-import-confirm = Import { $count } scripts from this Tampermonkey backup?
nyx-scripts-import-done =
    { $count ->
        [one] Imported 1 script.
       *[other] Imported { $count } scripts.
    }
nyx-scripts-check-done =
    { $count ->
        [0] Everything is up to date.
        [one] Updated 1 script.
       *[other] Updated { $count } scripts.
    }

## YouTube

pane-nyx-youtube-title = YouTube
pane-nyx-youtube-sub = How YouTube plays in Browser. Its colours are a Site style; its ads are Blocking's.
nyx-youtube-group-player = Player
nyx-youtube-theater =
    .label = Theater mode, always
nyx-youtube-theater-note = Videos open wide; YouTube's own button still switches back.
nyx-youtube-miniplayer =
    .label = No mini player
nyx-youtube-miniplayer-note = Scrolling to the comments keeps the video where it is.
nyx-youtube-group-playback = Playback
nyx-youtube-quality = Quality
nyx-youtube-quality-note = For videos, playlists and embedded videos
nyx-youtube-quality-auto =
    .label = Default
nyx-youtube-speed = Speed
nyx-youtube-speed-auto =
    .label = 1×
nyx-youtube-volume = Volume
nyx-youtube-volume-note = Each video starts at
nyx-youtube-volume-auto =
    .label = Default
nyx-youtube-wheel =
    .label = Mouse wheel over the video
nyx-youtube-wheel-note = Volume; with Ctrl, speed
nyx-youtube-pause-others =
    .label = Pause other tabs' videos
nyx-youtube-pause-others-note = When one starts playing
nyx-youtube-autoplay-next =
    .label = Turn off “autoplay next”
nyx-youtube-group-page = Page
nyx-youtube-hide-cards =
    .label = Hide cards and end screens
nyx-youtube-hide-cards-note = The boxes over the video's last seconds
nyx-youtube-shorts =
    .label = Open Shorts in the normal player
nyx-youtube-shorts-note = With its controls, speed and theater mode

## Selection search · Swift Selection Search

nyx-selection-import = Import from Swift Selection Search
nyx-selection-import-note = Its engines and settings, from a backup or from Swift Selection Search here
nyx-selection-import-button =
    .label = Import…
nyx-selection-import-profile = Swift Selection Search's data is in this profile. Use it? (Cancel to pick a backup file instead.)
nyx-selection-import-preview = Add { $count } of { $total } engines?
nyx-selection-import-done =
    { $count ->
        [one] Added 1 engine.
       *[other] Added { $count } engines.
    }
