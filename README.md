You are a senior multi-agent product design and frontend engineering team.



Your task is to redesign the existing Landfall game interface shown in the attached screenshots. Use the Aviator screenshots only as a UX and visual-structure reference.



The goal is to make Landfall feel:



- More minimalistic

- More compact

- Easier to understand immediately

- More focused on the main game action

- Faster to operate during repeated rounds

- Visually similar in quality and usability to modern crash-style casino games

- Suitable for desktop now and mobile applications later



IMPORTANT ORIGINALITY RULE:



Do not create an exact copy of Aviator.



Do not copy:



- The Aviator logo

- The airplane graphic

- Aviator-specific illustrations

- Proprietary icons

- Exact text

- Exact animations

- Exact layout measurements

- Branded visual assets



Instead, extract and apply its general design principles:



- Dark high-contrast interface

- Compact information density

- Clear separation between gameplay and secondary information

- Large central game area

- Clearly visible round status

- Persistent action controls

- Minimal decorative UI

- Strong primary action buttons

- Fast access to amount presets

- Small and readable round-history indicators

- Reduced visual noise

- Immediate understanding of what the player should do next



The redesigned interface must preserve Landfall’s original nautical identity, gameplay mechanics, locations, ocean map, anchoring mechanic, split/focus options, missions, chat, recent results, user balance and all existing functionality.



Do not convert the game into a plane or crash-game clone. It must remain a maritime strategy/betting game.



==================================================

MULTI-AGENT TEAM

==================================================



Create and coordinate the following agents.



1. PRODUCT UX LEAD



Responsibilities:



- Analyze the existing Landfall interface and identify UX problems.

- Identify which elements compete for attention.

- Define the correct hierarchy of information.

- Make the current round status understandable within one second.

- Reduce the number of unnecessary visual containers.

- Make the primary player action obvious.

- Decide which information must always be visible and which information can be collapsible.

- Preserve all existing game functionality.



The Product UX Lead must create a short redesign plan before implementation.



2. VISUAL SYSTEM DESIGNER



Responsibilities:



- Create a dark, premium, minimal visual system.

- Use Aviator only as inspiration for visual clarity and compactness.

- Preserve Landfall’s nautical character.

- Build a consistent system for:

  - Colors

  - Typography

  - Spacing

  - Borders

  - Shadows

  - Buttons

  - Inputs

  - Chips

  - Status indicators

  - Tooltips

  - Panels

  - Modals

  - Notifications

- Replace excessive blue transparent panels with a more controlled dark surface system.

- Ensure that ocean imagery remains visible without reducing text readability.

- Avoid excessive gradients, glassmorphism, glow and decorative effects.



Suggested original Landfall color direction:



- Main background: near-black navy

- Primary surfaces: dark charcoal-blue

- Secondary surfaces: slightly lighter navy

- Main action: vivid green

- Active nautical accent: cyan or ocean blue

- Warning/risk state: amber

- Critical state: controlled red

- Primary text: off-white

- Secondary text: desaturated blue-gray

- Dividers: low-contrast neutral borders



Do not use the exact Aviator color values.



3. GAMEPLAY INTERACTION DESIGNER



Responsibilities:



- Redesign the controls around the actual round flow.

- Make the player understand:

  1. What phase the round is currently in

  2. How much time remains

  3. Which cove or location is selected

  4. What amount is being committed

  5. Whether Focus or Split mode is active

  6. What will happen after pressing the main action button

- Reduce interaction steps.

- Add immediate visual feedback for selection, hover, disabled, loading, success and error states.

- Keep critical controls in a stable position between rounds.

- Prevent controls from moving when labels or values change.

- Make rapid repeated actions comfortable.



4. INFORMATION ARCHITECTURE DESIGNER



Responsibilities:



Reorganize the screen into four clear zones.



A. TOP STATUS BAR



Create a thin and compact top bar containing:



- Landfall logo

- Current round number

- Current round phase

- Balance

- Currency

- Sound control

- Settings

- Help or game rules

- Connection status when relevant



Keep the bar visually quiet.



B. ROUND HISTORY STRIP



Place a compact horizontal history strip near the top of the game area.



Show recent round results as small colored chips.



Requirements:



- Keep chips readable but compact.

- Use color coding based on risk or result category.

- Add horizontal scrolling when necessary.

- Show additional information through a tooltip.

- Do not let the history strip dominate the screen.



C. MAIN GAME AREA



The ocean map must remain the visual focus.



Requirements:



- Increase the usable map area.

- Remove unnecessary framing around the map.

- Add a subtle dark overlay only where necessary for readability.

- Keep coves and anchor points visually clear.

- Make location selection feel immediate.

- Use compact location cards instead of large floating rectangles.

- Show selected, available, unavailable, packed, calm, heavy and other states consistently.

- Make the selected location clearly visible without large intrusive glow effects.

- Keep the central round timer or anchor countdown highly visible.

- The timer must not cover important map content.

- Use smooth state transitions.



Each cove card should clearly show:



- Location number

- Location name

- Current state

- Optional risk or activity indicator

- Selection state



D. CONTROL DECK



Create a persistent bottom control area inspired by the usability of Aviator’s betting controls, but redesigned specifically for Landfall.



The control deck should contain:



- Stake or commitment amount input

- Minus and plus controls

- Quick amount presets

- Focus/Split selection

- Selected location summary

- Auto-action option if supported

- Main action button

- Potential outcome or relevant game value if the game supports it



The main button must clearly communicate the current action, for example:



- SELECT A COVE

- ANCHOR AT NORTH QUAY

- CONFIRM 25 STAKE

- CANCEL ANCHOR

- WAITING FOR NEXT ROUND



Do not use generic labels when a more specific label is possible.



If Landfall allows two simultaneous actions, create two compact control modules similar in usability to dual betting panels, but do not copy Aviator’s exact structure.



5. SECONDARY PANEL DESIGNER



Responsibilities:



Redesign the current right panel containing missions and chat.



Create a compact secondary panel with tabs:



- Mission

- Chat

- Activity



Requirements:



- Allow the panel to collapse.

- Remember its open or closed state.

- Do not permanently occupy too much of the game area.

- Clearly separate system messages from player messages.

- Make unread chat messages visible without interrupting gameplay.

- Keep the input area fixed at the bottom.

- Make mission progress understandable at a glance.

- Avoid large empty areas.



On smaller desktop screens, the panel should become an overlay drawer.



6. LIVE ACTIVITY PANEL DESIGNER



Evaluate whether Landfall needs a left-side activity panel similar in purpose to Aviator’s bet list.



Possible content:



- Active players

- Recent anchors

- Recent wins

- Current stakes by location

- Top wins

- Personal activity



Only add this panel if it improves gameplay understanding.



Requirements:



- It must be collapsible.

- It must not reduce the central map excessively.

- Use dense rows with compact typography.

- Highlight the current user’s activity.

- Avoid unnecessary avatars if they add visual noise.

- Provide tabs when several data categories are required.



7. MOTION DESIGNER



Responsibilities:



Create subtle and functional motion.



Allowed motion:



- Location selection transition

- Round phase transition

- Timer progress animation

- Anchor confirmation animation

- Result reveal

- Button feedback

- Panel opening and closing

- New activity row appearance

- Small water or environmental movement already connected to the game



Avoid:



- Excessive glow

- Large bouncing elements

- Constantly moving UI panels

- Distracting particle effects

- Animations longer than necessary

- Motion that delays user actions



Animations should usually last between 120 ms and 300 ms.



Respect prefers-reduced-motion.



8. RESPONSIVE AND MOBILE UX SPECIALIST



Responsibilities:



Design the architecture so it can later be reused for iOS and Android applications.



Desktop layout:



- Main map is always dominant.

- Optional collapsible left activity panel.

- Optional collapsible right mission/chat panel.

- Persistent bottom control deck.

- Compact top navigation.



Tablet layout:



- Map remains central.

- Side panels become drawers.

- Bottom control deck becomes more compact.

- Touch targets must be large enough.



Mobile layout:



- Full-width game map.

- Compact top status area.

- Bottom-sheet controls.

- Mission, chat and activity open as tabs or drawers.

- Important actions remain reachable with one hand.

- Do not reproduce the desktop interface at a smaller scale.

- Avoid hover-dependent functionality.



9. FRONTEND ARCHITECT



Responsibilities:



- Inspect the existing project structure before changing code.

- Reuse the existing framework and component architecture.

- Do not unnecessarily rewrite the project.

- Break large UI sections into reusable components.

- Separate visual presentation from gameplay state.

- Preserve all WebSocket, API, authentication, chat and round-state integrations.

- Do not replace real data with permanent mock data.

- Do not modify game algorithms, odds, results or business logic.

- Keep the redesigned UI compatible with the existing backend.



Suggested component structure:



- AppShell

- TopGameBar

- RoundHistory

- GameStage

- OceanMap

- CoveMarker

- CoveStatusCard

- RoundTimer

- ActivityPanel

- SecondaryPanel

- MissionTab

- ChatTab

- ActivityTab

- ControlDeck

- ActionModule

- StakeInput

- QuickAmountPresets

- ModeSelector

- PrimaryGameButton

- RoundStatusBanner

- ResultOverlay

- MobileBottomSheet



Use the project’s existing naming conventions when they differ.



10. ACCESSIBILITY AND QA AGENT



Responsibilities:



Validate:



- Color contrast

- Keyboard navigation

- Focus states

- Screen-reader labels

- Button semantics

- Input labels

- Disabled states

- Loading states

- Error handling

- Long usernames

- Large balance values

- Empty activity lists

- Slow network states

- Reconnection states

- Very small and very large desktop screens

- Mobile safe areas

- Browser zoom

- Localization and text expansion



Do not communicate game states using color alone.



==================================================

SPECIFIC REDESIGN INSTRUCTIONS

==================================================



1. Reduce the visual height of the current header.



2. Remove unnecessary decorative borders and oversized transparent containers.



3. Make the central ocean map larger and more prominent.



4. Replace the large existing cove labels with smaller, cleaner, high-contrast cards.



5. Use one consistent treatment for all cove states.



6. Redesign the central “Tap a cove to anchor” area into a clear round-status component.



Example structure:



ROUND 315

ANCHOR PHASE

06

Select a cove



7. The countdown must have strong contrast and remain readable over the map.



8. Move the recent results into a compact horizontal strip near the top.



9. Convert Focus and Split into a clear segmented control.



10. Make the current selected mode visually obvious.



11. Create a dark persistent bottom control deck.



12. Add quick stake values such as:



- 1

- 2

- 5

- 10

- 25

- 50



Use values appropriate to the existing game configuration.



13. The amount input must support:



- Manual entry

- Plus

- Minus

- Quick presets

- Validation

- Minimum and maximum values

- Clear error messages



14. The primary button must be the strongest visual element outside the map.



15. Use green only for confirmed positive actions.



16. Use cyan or ocean blue for selection and informational states.



17. Use amber or red only for warning, danger or failed states.



18. Simplify the mission panel.



Current information such as “Salvage — win 5 events” should become a compact progress component:



SALVAGE

Win 5 events

2 / 5



19. Redesign chat into a dense readable interface.



20. The chat input and send action must always remain visible while chat is open.



21. Add proper empty, waiting and disconnected states.



22. Create an unobtrusive waiting state between rounds.



23. Do not cover the ocean map with a large modal while waiting for the next round.



24. Prefer a compact status banner or central status card.



25. Use tooltips for secondary explanations instead of permanently showing instructions.



==================================================

TYPOGRAPHY

==================================================



Use a modern, highly readable sans-serif font already available in the project or a suitable open-source alternative.



Typography hierarchy:



- Round result or main timer: large and bold

- Main action: bold and highly readable

- Panel titles: medium weight

- Important values: semibold

- Table rows and metadata: compact regular text

- Secondary information: smaller muted text



Avoid:



- Extremely thin font weights

- Excessive uppercase text

- Wide letter spacing

- Decorative fonts

- Text shadows



Use uppercase only for short status labels and primary actions.



==================================================

VISUAL DENSITY

==================================================



The Aviator reference is effective because it displays a large amount of information without making every section visually heavy.



Apply the same principle:



- Small gaps inside dense data areas

- Larger spacing only between major sections

- Compact buttons for secondary actions

- Large button only for the main action

- Thin separators

- Few container layers

- No card inside card inside card

- No unnecessary labels when position and icon already explain the action



==================================================

TECHNICAL REQUIREMENTS

==================================================



- Preserve all current game behavior.

- Preserve current server communication.

- Preserve chat functionality.

- Preserve balance updates.

- Preserve round history.

- Preserve location statuses.

- Preserve Focus and Split logic.

- Preserve mission progress.

- Preserve responsive behavior that already works.

- Do not hardcode values that are currently provided by the backend.

- Do not remove functionality to make the design cleaner.

- Do not add large dependencies without a clear reason.

- Use the current project’s styling solution.

- Reuse existing design-system libraries when available.

- Avoid duplicated styles.

- Use design tokens or CSS variables for core colors, spacing, radii and typography.

- Maintain good runtime performance.

- Avoid unnecessary re-renders of the ocean map.

- Lazy-load secondary panels when appropriate.

- Keep animations GPU-friendly.



==================================================

WORKFLOW

==================================================



Follow this sequence:



Phase 1: Audit



- Inspect the project.

- Identify the files controlling the current screen.

- Identify existing shared components.

- Identify gameplay state and data dependencies.

- List the main UX problems.

- Do not modify code yet.



Phase 2: Redesign plan



Produce:



- New screen hierarchy

- Desktop layout description

- Tablet behavior

- Mobile behavior

- Component map

- Design tokens

- State model

- Files that will be changed



Phase 3: Implementation



- Implement the redesign in small reusable components.

- Preserve integrations.

- Replace the old interface progressively.

- Do not leave old and new duplicated UI in production code.



Phase 4: Validation



Test:



- Before a round

- During cove selection

- After selecting a cove

- Focus mode

- Split mode

- Waiting state

- Successful result

- Failed result

- Mission update

- Incoming chat messages

- Empty chat

- Reconnection

- Insufficient balance

- Minimum and maximum stake

- Desktop

- Tablet

- Mobile



Phase 5: Final review



Each agent must review the implementation from its own perspective.



The final response must contain:



1. Summary of UX problems found

2. Explanation of the new layout

3. List of created or modified components

4. List of modified files

5. Important implementation decisions

6. Remaining limitations

7. Testing results

8. Screenshots or visual previews when the environment supports them



==================================================

SUCCESS CRITERIA

==================================================



The redesign is successful when:



- A new player understands the main action within three seconds.

- The ocean map is the dominant visual element.

- The current round phase is always obvious.

- The selected location is always obvious.

- The stake amount is always obvious.

- Focus or Split mode is always obvious.

- The primary action is always obvious.

- Chat and missions do not distract from gameplay.

- Repeated actions require fewer clicks.

- The layout remains usable at smaller resolutions.

- The design feels premium, compact and modern.

- The interface is inspired by Aviator’s usability but remains visually and functionally original to Landfall.

- No existing game logic is broken.



Start by analyzing the screenshots and the existing codebase. Then provide the audit and implementation plan before editing the files.

Don't forget to change our current background to something minimal like aviator has. 
