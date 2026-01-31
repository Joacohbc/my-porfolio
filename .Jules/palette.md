## 2025-05-24 - Accessibility of Interactive SVGs
**Learning:** Interactive SVGs without wrapper buttons are invisible to keyboard users. Simply adding `aria-label` to the SVG is not enough; they need `role="button"` and `tabindex="0"` or better, a native `<button>` wrapper.
**Action:** Always wrap interactive icons in `<button type="button">` and transfer the event listener or ensure the button triggers the action.
