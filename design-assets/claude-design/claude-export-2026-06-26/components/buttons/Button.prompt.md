Primary action button — use for the main CTA on a panel, form, or toolbar; pair with `secondary`/`ghost` for lower-priority actions and `danger` for destructive ones.

```jsx
import { Plus } from "lucide-react";

<Button variant="primary" icon={Plus} onClick={createEvent}>New Event</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" size="sm">Clear filters</Button>
<Button variant="danger">Delete account</Button>
```

Variants: `primary` (deep indigo `#28439A`), `secondary` (white + slate border), `ghost` (transparent), `danger` (rose). Sizes: `md` (44px) default, `sm` (36px). Pass a Lucide icon via `icon`; set `iconRight` to trail the label. `loading` dims and disables.
