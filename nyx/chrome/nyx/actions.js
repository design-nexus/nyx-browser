/* Toolbar buttons for what the Nyx extension does. A button presses the extension's own keyboard
 * command, so there's one code path, and it carries the same permissions as the shortcut. Keys
 * have no ids; they keep the manifest's order, even when someone rebinds them. */
{
  const KEYSET = "ext-keyset-id-nyx-integration_design-nexus_github_io";
  const BUTTONS = [
    { id: "nyx-share-button", label: "Share", tooltiptext: "Share this page (Alt+Shift+S)", key: 0 },
    { id: "nyx-capture-button", label: "Capture", tooltiptext: "Capture this page (Alt+Shift+C)", key: 1 },
    { id: "nyx-assistant-button", label: "Assistant", tooltiptext: "Assistant (Alt+Shift+A)", key: 2 },
  ];

  // Registered once per process; every window after the first finds them already there.
  if (!Services.nyxActionWidgets) {
    Services.nyxActionWidgets = true;
    for (const button of BUTTONS) {
      window.CustomizableUI.createWidget({
        id: button.id,
        label: button.label,
        tooltiptext: button.tooltiptext,
        defaultArea: window.CustomizableUI.AREA_NAVBAR,
        onCommand(event) {
          event.target.ownerDocument.getElementById(KEYSET)?.children[button.key]?.doCommand();
        },
      });
    }
  }
}
