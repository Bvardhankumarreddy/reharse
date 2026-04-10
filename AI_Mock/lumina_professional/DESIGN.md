# Design System: High-End Editorial AI Mock Interview Platform

## 1. Overview & Creative North Star: "The Digital Stoic"
The visual identity of this design system is defined by the **"Digital Stoic"**—a philosophy that merges the high-density information architecture of a financial terminal with the breathability and calm of a premium meditation app. 

We break the "standard SaaS" template by rejecting the rigid, boxed-in layouts of the last decade. Instead, we use **intentional asymmetry**, wide-tracking typography, and **tonal layering** to create a focused environment. The goal is to make the candidate feel like they are in a high-stakes interview environment that is simultaneously designed for their peak cognitive performance. We do not use borders to separate ideas; we use space and light.

---

## 2. Colors & Surface Architecture
The palette is rooted in a professional `primary` blue and a sophisticated `secondary` violet for AI-driven insights. 

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders (`outline`) for sectioning content. Traditional boxes make an interface feel "trapped." Instead, boundaries must be defined solely through background color shifts. Use `surface_container_low` for sections sitting on a `surface` background. The eye should perceive the change in depth, not a drawn line.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, premium materials.
- **Base Layer:** `background` (#faf8ff) for the overall canvas.
- **Primary Content Area:** `surface_container_low` (#f2f3ff) for main dashboard regions.
- **Interactive Modules:** `surface_container_lowest` (#ffffff) for cards or interview panes to create a natural "lift."
- **Tertiary Information:** `surface_container_high` (#e2e7ff) for sidebars or "code-view" drawers.

### The "Glass & Gradient" Rule
To elevate the AI features beyond a standard bot, use **Glassmorphism**. For floating AI feedback overlays, use `secondary_container` at 80% opacity with a `20px` backdrop-blur. 
*   **Signature Gradients:** For primary CTAs (e.g., "Start Interview"), use a linear gradient from `primary` (#0058be) to `primary_container` (#2170e4) at a 135-degree angle. This adds a "soul" to the action that flat hex codes cannot replicate.

---

## 3. Typography: Editorial Authority
We utilize **Inter** for the UI to maintain clarity, and **JetBrains Mono** for code to provide a sharp, technical edge.

*   **Display Scale (`display-lg` to `display-sm`):** Reserved for high-impact moments, such as "Interview Complete." These should feature tighter letter-spacing (-0.02em) to feel like a high-end magazine.
*   **Headline Scale (`headline-lg` to `headline-md`):** Use these for dashboard headers. They provide the "Bloomberg" sense of authority.
*   **Body & Labels:** `body-md` is our workhorse. For labels (`label-md`), use increased letter-spacing (0.05em) and uppercase transformation when describing AI status or technical metadata to differentiate from human conversational text.
*   **The Technical Edge:** Use `JetBrains Mono` for all coding blocks and "AI logic" strings. This creates a visual mental shift from "Evaluation" (Inter) to "Execution" (Mono).

---

## 4. Elevation & Depth
In this design system, shadows and borders are a last resort. We communicate hierarchy through **Tonal Layering**.

*   **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` section. The minute shift in lightness creates a soft, sophisticated elevation.
*   **Ambient Shadows:** If a floating element (like a modal) is required, use a shadow color tinted with the `on_surface` tone (#131b2e) at 4% opacity. Blur should be a minimum of `32px` to mimic natural studio lighting.
*   **The "Ghost Border" Fallback:** If a border is essential for accessibility (e.g., in high-contrast modes), use `outline_variant` at **15% opacity**. A 100% opaque border is a failure of the system's "Stoic" philosophy.
*   **Frosted Glass:** For AI-generated feedback, use a semi-transparent `secondary_container`. This allows the "code" or "question" underneath to bleed through, making the tool feel like an integrated assistant rather than a separate pop-up.

---

## 5. Components

### Buttons & Chips
*   **Primary Button:** Gradient (`primary` to `primary_container`), `xl` (0.75rem) roundedness. No shadow.
*   **AI Action Button:** `secondary` (#712ae2) with a `secondary_container` glow effect on hover.
*   **Chips:** Use `surface_container_highest` for background. Forbid borders. Chips should feel like "punched out" pieces of the surface.

### Input Fields
*   **Styling:** Use `surface_container_low` for the fill. On focus, transition the background to `surface_container_lowest` and add a subtle `primary` ghost border (20% opacity).
*   **Coding Editor:** Dark mode by default using `inverse_surface`. Typography must be `JetBrains Mono` at `body-md` size.

### Cards & Lists
*   **No Dividers:** Forbid the use of horizontal lines. To separate list items (e.g., past interview history), use `12` (3rem) vertical spacing or alternating tonal shifts between `surface_container_low` and `surface`.
*   **The "Focus Drawer":** Use a `surface_bright` side-panel for AI hints that slides over the main content, utilizing a `surface_dim` backdrop to pull focus.

---

## 6. Do’s and Don'ts

### Do
*   **Do** use whitespace as a functional tool to group related concepts.
*   **Do** use `JetBrains Mono` for all data-heavy technical strings.
*   **Do** use asymmetrical layouts (e.g., a wide main column with a thin, non-bordered metadata column) to create an editorial feel.
*   **Do** use subtle transitions (200ms ease-out) for all surface color shifts.

### Don't
*   **Don't** use 1px #E2E6ED borders to wrap your cards. It breaks the "Digital Stoic" immersion.
*   **Don't** use standard "Drop Shadows" (Black at 25% opacity). They feel "cheap" and dated.
*   **Don't** use `Inter` for code blocks.
*   **Don't** use more than two "surface" levels in a single nested component; keep the stack shallow to maintain a "clean" meditation-app aesthetic.