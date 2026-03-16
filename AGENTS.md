# Based Chat Project Guide

## Product Theme

Based Chat is a premium, dark, model-first chat product focused on fast model discovery, clean pricing visibility, and polished interaction details.

Core visual direction:
- Dark, refined, high-contrast UI
- Compact but not cramped layouts
- Premium model marketplace energy, not generic dashboard styling
- Monochrome provider branding in selectors unless a screen explicitly calls for color
- Smooth hover states, subtle emphasis, and clear information hierarchy

## Product Priorities

When making changes, preserve these priorities:
- Model selection should feel fast, premium, and easy to scan
- Real token pricing is preferred over vague pricing labels
- Capability badges should stay consistent across the app
- Legacy models should stay clearly separated from current models
- Attachment behavior must respect model capabilities

## Current Model Selector Rules

- The model selector opens to `Favorites` or the last selected provider
- There is no `All models` tab
- Provider views can show current models first and legacy models in a collapsed section
- Provider icons use LobeHub monochrome icons
- Provider rail buttons are compact square icon buttons
- Provider hover tooltips appear on the left side of the rail
- If a model cannot accept pending attachments, it must not be selectable

## Capability Meanings

Keep these meanings stable unless explicitly changed by the user:
- `image`: supports image uploads
- `reasoning`: has reasoning / thinking capability
- `pdf`: can understand PDFs and file attachments
- `image-gen`: image generation

## Tech Stack

- App: React + Vite
- Styling: Tailwind
- UI primitives/components: `@based-chat/ui`
- Backend/data: Convex
- Shared interaction primitives commonly used here:
  - `Button`
  - `Tooltip`
  - `Popover`

## UI Implementation Rule

Use shadcn-style shared components from `@based-chat/ui` by default.

Required rule:
- If a component can be done with shadcn, it must be done with shadcn
- If a shared shadcn-style component exists in `@based-chat/ui/components`, use it instead of raw HTML controls or custom one-off implementations
- If the needed shadcn component is not installed yet, install or add it instead of recreating the component manually

Examples:
- Use `Button` instead of raw `button` for interactive controls when the shared button fits
- Use shared `Tooltip` instead of browser `title`
- Use shared popover/dialog primitives already used by the app
- Add the needed shadcn component first if the UI change depends on one that is missing

Avoid:
- Ad hoc button styling when `Button` can be used
- One-off tooltip implementations
- Building custom versions of components that already exist in shadcn or should be added from shadcn
- Reintroducing custom local icon assets for providers when the LobeHub icon system already covers the need

## Design Guardrails

- Do not make the UI feel oversized or bloated
- Do not over-compress spacing to the point that text wraps awkwardly
- Prefer truncation over ugly multiline overflow in dense selector rows
- Keep icon-only rails discoverable with tooltips
- Preserve the app's dark premium tone

## File Areas To Know

- `apps/web/src/lib/models.ts`
  Model catalog, providers, pricing, capabilities, legacy flags, attachment helpers

- `apps/web/src/components/chat/model-selector.tsx`
  Provider rail, model list, favorites, legacy collapse, pricing display, provider icon behavior

- `apps/web/src/components/chat/chat-input.tsx`
  Composer attachment gating and model selection behavior

- `apps/web/src/components/chat/message-bubble.tsx`
  Edit flow attachment gating and model switching behavior

- `packages/backend/convex/llm.ts`
  Frontend model id to OpenRouter id mapping

## Editing Expectations

- Keep model/provider behavior data-driven where possible
- Prefer small, targeted UI patches over large rewrites
- Keep naming and provider mappings aligned with the visible catalog
- If introducing a new provider/model UI pattern, make sure it works for all providers, not just one
