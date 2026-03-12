# Budge Up — Claude Instructions
## Approach
We are doing a significant UI overhaul. When implementing new screens:
- REPLACE existing components entirely, don't patch them
- Delete old styles/CSS that conflict
- Follow the Figma design exactly — it is the source of truth
- Don't preserve old layout structure if it conflicts with the design
- The gap at the top of Figma prototypes is the iPhone notch area — ignore it, do not add extra top padding to account for it
- Ignore any progress bars in onboarding and make content taller accordingly
## Design System
- Extract and use tokens from Figma (colors, spacing, typography) and use react-feather where possible
- Create a /tokens or /theme file if one doesn't exist