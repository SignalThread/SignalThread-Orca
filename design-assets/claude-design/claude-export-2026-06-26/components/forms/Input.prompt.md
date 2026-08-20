Form primitives composed via `FormField` — the standard pattern for SignalThread forms (invite, event, settings).

```jsx
import { Mail } from "lucide-react";

<FormField label="Email" required helper="Used for invite and sign-in delivery.">
  <Input icon={Mail} placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
</FormField>

<FormField label="Role">
  <Select value={role} onChange={e => setRole(e.target.value)}
    options={["MEMBER", "ADMIN", "OWNER"]} />
</FormField>

<FormField label="Slug" error="Use lowercase letters, numbers, and hyphens only.">
  <Input invalid value={slug} />
</FormField>
```

`FormField` owns label / required asterisk / helper / error. Controls (`Input`, `Select`, `Textarea`, `Checkbox`, `Switch`) take `invalid` and `disabled`. Inputs are 44px tall, 12px radius, slate-200 border, primary focus ring.
