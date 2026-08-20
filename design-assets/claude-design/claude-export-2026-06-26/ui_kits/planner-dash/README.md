# Planner Dash — UI kit

A high-fidelity, click-through recreation of the **Planner Dash** admin product, composed entirely from SignalThread design-system components.

## Run
Open `index.html`. You land on the branded OTP **login** → "Send code" → "Verify" drops you into the app shell.

## Screens
- **Login** (`LoginScreen.jsx`) — branded magic-link / 6-digit OTP entry.
- **Shell** (`Shell.jsx`) — fixed 280px sidebar (SignalThread mark + nav) and an 80px top bar with org name, notification bell, SUPER ADMIN badge, avatar, and log out.
- **Platform Users** (`PlatformUsersScreen.jsx`) — SUPER_ADMIN invite & provision form, success alert, then the "Admin surface reference": count tabs, stat cards, filters, and the accounts table. *(Default screen.)*
- **Events** (`EventsScreen.jsx`) — search + status filter, events table with status badges and budget variance, and a New Event modal.
- **Dashboard / placeholders** (`App.jsx`) — overview stat cards; other nav targets reuse the shell with a placeholder card.

## Composition
Everything is built from `window.SignalThreadDesignSystem_204ca3` primitives — `Button`, `Input`, `Select`, `FormField`, `Card`, `PanelHeader`, `Alert`, `StatCard`, `Tabs`, `DataTable`, `Badge`, `RoleBadge`. Icons are inline lucide geometry in `icons.jsx` (`window.STIcons`). No component logic is re-implemented here.

## Source of truth
Recreated from `akamyab12/plannerdash` — `app/(shell)/layout.tsx`, `_components/sidebar-nav.tsx`, `events/page.tsx`, `(public)/login/page.tsx`, and the live design-system gallery at `pd.signalthread.ai/design-system`.
