# Design System Strategy: The Intentional Workspace

## 1. Overview & Creative North Star: "The Digital Curator"
Most B2B SaaS platforms feel like rigid spreadsheets. This design system moves beyond the "standard grid" to embrace **The Digital Curator**—a North Star that prioritizes focus, editorial breathing room, and tonal depth. 

We are not building a dashboard; we are building a high-end workspace. By using the Inter typeface and a palette of deep indigos, we create an atmosphere of quiet authority. We break the "template" look by using **intentional asymmetry**: sidebars are slightly narrower, hero headers use oversized typography scales, and content "floats" on layered surfaces rather than being trapped inside heavy boxes. The goal is to make the user feel like they are interacting with a premium physical desktop made of fine paper and frosted glass.

---

## 2. Colors: Tonal Architecture
The palette is rooted in `primary` (#3525cd) and its deep container variants. We utilize a light-warm background to prevent the "sterile" feel of pure white, providing a sophisticated foundation.

### The "No-Line" Rule
To achieve a signature look, **explicitly prohibit 1px solid borders for sectioning.** Boundaries are defined through:
*   **Background Shifts:** Place a `surface-container-low` (#f3f4f5) sidebar against a `surface` (#f8f9fa) main stage.
*   **Tonal Transitions:** Use subtle shifts between `surface-container` tiers to denote hierarchy.

### Surface Hierarchy & Nesting
Treat the UI as physical layers. Instead of a flat grid, use the nesting principle:
*   **Foundation:** `surface` (#f8f9fa).
*   **Intermediate Zones:** `surface-container-low` (#f3f4f5).
*   **Active Focus Areas:** `surface-container-lowest` (#ffffff) for primary content cards to create a natural, soft "lift."

### The "Glass & Gradient" Rule
Standard flat colors feel static. For main CTAs and floating navigation elements:
*   **Glassmorphism:** Use `surface_container_lowest` at 80% opacity with a `backdrop-blur` (12px–20px).
*   **Signature Textures:** For high-impact areas, use a linear gradient transitioning from `primary` (#3525cd) to `primary_container` (#4f46e5) at a 135-degree angle. This adds "soul" and professional depth.

---

## 3. Typography: Editorial Authority
We use **Inter** as our typographic backbone. The scale is designed to be highly legible but carries an editorial weight that differentiates it from generic SaaS interfaces.

*   **Display & Headlines:** Use `display-md` (2.75rem) for high-level summaries. These should have a slightly tighter letter-spacing (-0.02em) to feel "custom."
*   **The Title Tier:** `title-lg` (1.375rem) serves as the primary navigation hook. It represents the "Curator's" voice—authoritative and clear.
*   **Body & Labels:** `body-md` (0.875rem) is the workhorse. We never use pure black for text; use `on_surface` (#191c1d) to maintain a soft, premium contrast against the warm background.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are often messy. We achieve hierarchy through **Tonal Layering**.

*   **The Layering Principle:** Depth is "stacked." For example, a card (`surface-container-lowest`) sitting on a section (`surface-container-low`) creates an immediate sense of importance without a single shadow.
*   **Ambient Shadows:** When a floating state is mandatory (e.g., Modals), use a shadow with a 40px blur and 6% opacity. Use a tint of `on_surface` (#191c1d) for the shadow color rather than neutral gray to mimic natural light.
*   **The "Ghost Border":** If a container requires a border for accessibility, use `outline-variant` (#c7c4d8) at **20% opacity**. It should be a suggestion of a line, not a boundary.

---

## 5. Components: Refined Primitives

### Buttons & Chips
*   **Primary Button:** Gradient fill (`primary` to `primary_container`) with `lg` (0.5rem) roundedness. No border.
*   **Secondary Button:** `surface_container_high` background with `on_secondary_container` text. This feels integrated, not floating.
*   **Chips:** Use `secondary_fixed` (#e2dfff) backgrounds with `label-md` type. These should be pills (`full` roundedness) to contrast against the more structured card layouts.

### Input Fields & Controls
*   **Input Fields:** `surface_container_lowest` (#ffffff) background. Use the "Ghost Border" (20% `outline_variant`) that transitions to a 100% `primary` border only on focus.
*   **Checkboxes & Radios:** Avoid sharp corners. Even the "Selected" state should use a soft `primary` fill with a white `on_primary` icon.

### Cards & Lists
*   **The "No-Divider" Rule:** Forbid 1px horizontal lines between list items. Instead, use 12px of vertical white space or a subtle hover state shift to `surface_container_high`.
*   **Focused Task Cards:** Use `xl` (0.75rem) roundedness. These are the most prominent elements and should always utilize `surface_container_lowest` to "pop" from the page.

---

## 6. Do’s and Don’ts

### Do:
*   **DO** use whitespace as a structural element. If you think it needs a line, try adding 16px of padding instead.
*   **DO** use `tertiary` (#7e3000) accents for time-sensitive tasks. It provides a sophisticated "Warning" color that isn't as aggressive as standard red.
*   **DO** ensure all text on `primary` containers uses `on_primary` (#ffffff) for AA accessibility.

### Don't:
*   **DON'T** use 100% opaque borders for anything other than active input focus.
*   **DON'T** use standard grey shadows. They muddy the warm background.
*   **DON'T** use the "Default" (0.25rem) roundedness for large containers; reserve it for small inputs to maintain a hierarchy of "softness."