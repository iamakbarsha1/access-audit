export interface WcagCriterion {
  id: string;       // e.g. "1.1.1"
  name: string;     // e.g. "Non-text Content"
  level: "A" | "AA";
  axeCoreRules: string[]; // axe-core rule IDs that map to this criterion
}

export const WCAG_21_AA_CRITERIA: WcagCriterion[] = [
  // Principle 1: Perceivable
  { id: "1.1.1", name: "Non-text Content", level: "A", axeCoreRules: ["image-alt", "input-image-alt", "area-alt", "object-alt", "svg-img-alt", "role-img-alt"] },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", axeCoreRules: [] },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", axeCoreRules: [] },
  { id: "1.3.1", name: "Info and Relationships", level: "A", axeCoreRules: ["aria-required-parent", "aria-required-children", "definition-list", "dlitem", "list", "listitem", "th-has-data-cells", "td-headers-attr", "table-fake-caption", "p-as-heading"] },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", axeCoreRules: [] },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", axeCoreRules: [] },
  { id: "1.3.4", name: "Orientation", level: "AA", axeCoreRules: ["css-orientation-lock"] },
  { id: "1.3.5", name: "Identify Input Purpose", level: "AA", axeCoreRules: ["autocomplete-valid"] },
  { id: "1.4.1", name: "Use of Color", level: "A", axeCoreRules: ["link-in-text-block"] },
  { id: "1.4.2", name: "Audio Control", level: "A", axeCoreRules: [] },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", axeCoreRules: ["color-contrast"] },
  { id: "1.4.4", name: "Resize Text", level: "AA", axeCoreRules: ["meta-viewport"] },
  { id: "1.4.5", name: "Images of Text", level: "AA", axeCoreRules: [] },
  { id: "1.4.10", name: "Reflow", level: "AA", axeCoreRules: [] },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", axeCoreRules: [] },
  { id: "1.4.12", name: "Text Spacing", level: "AA", axeCoreRules: [] },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", axeCoreRules: [] },

  // Principle 2: Operable
  { id: "2.1.1", name: "Keyboard", level: "A", axeCoreRules: ["scrollable-region-focusable"] },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", axeCoreRules: [] },
  { id: "2.1.4", name: "Character Key Shortcuts", level: "A", axeCoreRules: [] },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", axeCoreRules: ["meta-refresh"] },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", axeCoreRules: ["blink", "marquee"] },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", axeCoreRules: [] },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", axeCoreRules: ["bypass", "region"] },
  { id: "2.4.2", name: "Page Titled", level: "A", axeCoreRules: ["document-title"] },
  { id: "2.4.3", name: "Focus Order", level: "A", axeCoreRules: ["tabindex"] },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", axeCoreRules: ["link-name"] },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", axeCoreRules: [] },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", axeCoreRules: ["empty-heading"] },
  { id: "2.4.7", name: "Focus Visible", level: "AA", axeCoreRules: [] },
  { id: "2.5.1", name: "Pointer Gestures", level: "A", axeCoreRules: [] },
  { id: "2.5.2", name: "Pointer Cancellation", level: "A", axeCoreRules: [] },
  { id: "2.5.3", name: "Label in Name", level: "A", axeCoreRules: ["label-title-only"] },
  { id: "2.5.4", name: "Motion Actuation", level: "A", axeCoreRules: [] },

  // Principle 3: Understandable
  { id: "3.1.1", name: "Language of Page", level: "A", axeCoreRules: ["html-has-lang", "html-lang-valid"] },
  { id: "3.1.2", name: "Language of Parts", level: "AA", axeCoreRules: ["valid-lang"] },
  { id: "3.2.1", name: "On Focus", level: "A", axeCoreRules: [] },
  { id: "3.2.2", name: "On Input", level: "A", axeCoreRules: [] },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", axeCoreRules: [] },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", axeCoreRules: [] },
  { id: "3.3.1", name: "Error Identification", level: "A", axeCoreRules: [] },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", axeCoreRules: ["label", "select-name"] },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", axeCoreRules: [] },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", axeCoreRules: [] },

  // Principle 4: Robust
  { id: "4.1.1", name: "Parsing", level: "A", axeCoreRules: ["duplicate-id", "duplicate-id-active", "duplicate-id-aria"] },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", axeCoreRules: ["aria-allowed-attr", "aria-hidden-body", "aria-input-field-name", "aria-toggle-field-name", "button-name", "frame-title", "iframe-title", "input-button-name", "role-has-required-aria-props"] },
  { id: "4.1.3", name: "Status Messages", level: "AA", axeCoreRules: ["aria-progressbar-name"] },
];
