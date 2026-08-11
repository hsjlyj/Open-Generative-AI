# Admin Console Design

## Direction
A calm, operational console rather than a dark card stack. Deep slate surfaces, restrained cyan for account state, amber only for administrative controls, and clear data density.

## Hierarchy
1. Account identity and available credits.
2. Segmented navigation: Overview, History, Administration.
3. History is a readable activity feed with status, cost, model and result action.
4. Administration uses explicit editable fields and save buttons, never browser prompt dialogs.

## Responsive behavior
On desktop, the account summary and credit balance share a horizontal header. On narrow screens, controls stack, tables become horizontally scrollable, and buttons remain full-width where appropriate.

## Interaction states
- Loading: compact status label.
- Empty history: a clear empty state explaining when records appear.
- Success/error: inline status banner.
- Admin controls remain hidden unless the server confirms admin data.

## Accessibility
Buttons use semantic controls, visible focus rings, labels are associated with inputs, and color is not the sole status signal.
