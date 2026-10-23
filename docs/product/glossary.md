# Glossary

| Term | Meaning |
| --- | --- |
| **Account** | A customer account from the ERP. Either a *bill-to* (who pays) or a *sold-to* (where goods go; belongs to a bill-to). |
| **Customer group** | A roll-up of accounts that belong to one customer. Levels: conglomerate, corporation, standalone. |
| **Book** | The accounts a rep owns. |
| **Rep** | A salesperson record from the ERP or HR system. Users link to a rep. |
| **Division** | A line of business accounts belong to. Each tenant defines its own (for example wholesale and uniforms, or trade and institutional). |
| **Division lens** | The top-bar switch that narrows every page to one of the tenant's lenses, each covering one or more divisions (senior roles). |
| **Health band** | Green (healthy), amber (watch) or red (at risk), from sales, activity and sentiment signals. |
| **Mirror data** | Records copied from the customer's systems of record (reps, groups, accounts, contracts). Read-only in Ambient. |
| **Rollup** | A dated snapshot of figures computed in the warehouse (sales vs target, open orders, stock). |
| **App-native data** | Records Ambient owns (tasks, visits, contacts, notes, captured messages). Soft-deleted, never hard-deleted. |
| **Passive capture** | Filing customer email and meetings automatically from Microsoft 365, with no rep action. |
| **Matcher** | The step that decides which account an email or meeting belongs to. |
| **Review queue** | Captured items the matcher could not file confidently, waiting for a person. |
| **Participant fence** | The rule that captured content is readable only by the internal people who were on it. |
| **Smart task** | A task Wren suggests from a captured conversation; a person accepts or dismisses it. |
| **Next action** | A follow-up the AI found in a conversation, offered as a one-click task. |
| **Wren** | Ambient's AI assistant. |
| **Action** | One thing Ambient can do, a read or a change, shared by the forms and Wren (AI-first, planned). |
| **Risk level** | How a change Wren makes is handled: read, low (done with Undo), medium (confirm), high (preview and confirm), or never by AI (planned). |
| **Undo** | Reverses a low-risk change Wren made, for 24 hours while the record is unchanged (planned). |
| **Skill** | A saved routine Wren runs on request, such as "prepare for my visit"; built in or written by an admin (planned). |
| **Connector** | An outside system Wren can use, such as Microsoft 365 or the ERP (planned). |
| **Wren inbox** | Where background work leaves what it found and prepared, for the user to approve (planned). |
| **Scope** | What the signed-in user may see: their rep scope plus the division lens. Every query applies it. |
| **Tenant** | One customer organisation using Ambient. All data is partitioned by tenant. |
