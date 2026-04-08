# Skill: Frontend Module

## When to use
- Adding or fixing a column in a table on any module page
- Fixing a displayed value that comes from an API field
- Adding/removing a UI element in the Internet, Office, Cards, Expenses, Partners, Reports, Settings, or Dashboard pages
- Fixing RTL/Arabic text display
- Debugging why an API call is returning unexpected data in the UI
- Adding a new API call to a frontend module

---

## Architecture

```
src/App.tsx                            # routes (React Router 7) + auth guard
src/context/AppContext.tsx             # global state (user, permissions, settings)
src/shared/permissions/permissions.ts # canAccessSection(), canAction(), canAccessLines()

src/modules/<module>/
  page/                               # main page component (e.g., InternetPage.tsx — 5000+ lines)
  components/                         # sub-components for the module
  api/                                # module-specific API functions
  docs/                               # module notes

src/api/<domain>.ts                   # shared API wrappers (e.g., internet.ts, subscribers.ts)
src/api/client.ts                     # base fetchApi() and fetchApiWithTrace()
src/pages/<Module>.tsx                # thin routing shell that renders <ModulePage />
src/utils/                            # shared utilities (phone formatting, date math, permissions)
```

---

## Module → File Map

| Module | Page file | Key API file |
|---|---|---|
| Internet | `src/modules/internet/page/InternetPage.tsx` | `src/modules/internet/api/subscribers.api.ts` |
| FTTH portal | `src/pages/InternetFtthCustomer.tsx` | `src/modules/internet/api/ftthPortal.api.ts` |
| Office | `src/modules/office/page/` | `src/modules/office/api/` |
| Cards | `src/modules/cards/page/` | `src/modules/cards/api/` |
| Expenses | `src/modules/expenses/page/` | `src/api/expenses.ts` |
| Partners | `src/modules/partners_suppliers/page/` | `src/api/partners.ts` |
| Reports | `src/modules/reports/page/` | `src/api/internetReports.ts` |
| Settings | `src/modules/settings/page/` | `src/modules/settings/api/` |
| Dashboard | `src/modules/dashboard/page/` | `src/modules/dashboard/api/` |

---

## RTL Rules (Non-Negotiable)

- All Arabic labels must use `dir="rtl"` or be inside an RTL container
- Column headers use Arabic text exactly as they appear in the existing code — do not translate or reformat
- Do not swap column order without confirming it doesn't break RTL layout
- `text-right` for Arabic content columns in tables
- Print: `@media print` classes are used to show/hide columns — check `src/index.css`
- Dark mode: `dark:` Tailwind variants — check existing components for the pattern

---

## Adding a Column to a Table

1. Find the table component in the module's page file
2. Add the `<th>` in the header row with the Arabic label
3. Add the `<td>` in the data row with the field access (e.g., `row.fdt ?? '—'`)
4. Add `'—'` or `null` fallback for missing values
5. Use `text-right rtl:text-right` for Arabic-direction cells
6. Do NOT add columns to the print view unless explicitly requested
7. Verify with `npm run lint` (TypeScript check)

---

## API Call Pattern

```typescript
import { fetchApi } from '@/api/client';

// Simple GET
const data = await fetchApi<ResponseType>('/api/path');

// With trace (for user-visible error messages)
import { fetchApiWithTrace } from '@/api/client';
const result = await fetchApiWithTrace<ResponseType>('/api/path', {
  method: 'POST',
  body: JSON.stringify(payload),
});
if (!result.ok) {
  // result.message is Arabic-formatted error
}
```

---

## Development Commands

```bash
# Start frontend only
npm run dev
# Frontend: http://localhost:5173

# TypeScript check (no emit)
npm run lint

# Full stack
npm run start
```

---

## Permissions Guard Pattern

```typescript
import { canAccessSection, canAction } from '@/shared/permissions/permissions';
// or from @/utils/permissions (duplicate path)

if (!canAccessSection(user, 'internet')) return null;
if (!canAction(user, 'internet', 'edit')) {
  // hide edit button
}
```

---

## State and Context

- `AppContext` provides: `user`, `refreshUser()`, `systemSettings`, `permissions`
- Do not fetch user/settings independently — use context
- Module-level state lives in `useState` inside the page component (not global)
- Heavy pages (InternetPage.tsx at 5047 lines) use local state extensively

---

## Forbidden

- Do not change Arabic column headers without explicit instruction
- Do not add new global state to `AppContext` unless the module boundary requires it
- Do not introduce new npm dependencies without checking if an existing one covers the need
- Do not use `@google/genai` (Gemini) for anything not explicitly AI-driven — it's present but rarely used
- Do not break print styles (`@media print` in `index.css`)
