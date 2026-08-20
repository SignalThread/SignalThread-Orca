Icon-only button for compact actions — dialog close, row overflow, toolbar controls.

```jsx
import { X, MoreHorizontal } from "lucide-react";

<IconButton icon={X} label="Close" onClick={close} />
<IconButton icon={MoreHorizontal} label="More" variant="outline" />
```

Variants: `ghost` (default, transparent) and `outline` (white + border). Always pass `label` for accessibility — it doubles as the tooltip.
