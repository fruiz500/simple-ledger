# Simple Ledger

Double-entry bookkeeping in the browser for households, small businesses, and nonprofits.
Each book is one plain-text journal file in [hledger](https://hledger.org) format, and you keep that file.
There is no server, no account, and no install step.

**Live app:** https://ledger.simple-apps.org/ · **Help:** https://ledger.simple-apps.org/help.html

## Features

- **Plain-language entry:** choose "I paid someone," "I got paid," or "I moved money between my accounts." Pay by check, online transfer, Zelle, debit card, or cash.
- **Checks:** write and print checks on pre-printed 8.5 × 11 stock, with the amount in numbers and words. Calibrate once against your own paper. Track received checks and deposit them.
- **Bank and card import:** OFX, QFX, and CSV (with a column map remembered per account). Imported items that match entries you already typed are marked cleared, not added twice.
- **Reconciliation:** tick statement items until the difference is $0.00. A "Find the difference" check looks for typos, flipped signs, and late-dated items.
- **Contacts, invoices, and bills:** customers, suppliers, and donors; numbered invoices and bills; partial and multi-document payments; customer and supplier aging; cash or accrual basis.
- **Nonprofit tools:** donations, thank-you letters by year, donor totals as CSV, and Statement of Activities and Statement of Financial Position names.
- **Reports:** income statement, balance sheet, trial balance, general ledger, and category totals for any period. Click an amount to see the transactions behind it. Export CSV or print.
- **Tracking people:** tag entries with a person to see income and expenses by person.
- **Phone app:** Simple Ledger Pocket lets the people you list record spending and income on a phone and send the entries back for import. See below.
- **Sharing the work:** a helper can enter part of the work in their own copy; you bring in only their new entries. See below.
- **Backups:** on Chrome or Edge, choose a folder and every save also writes a dated copy, keeping 30 days.
- **Installable and offline:** add it to your home screen or dock, and it opens without a connection. Updates arrive the next time you open it online.
- **Built for beginners:** a built-in guide starts with the five ideas you need, with a search box.

Every add, edit, and delete is written to an edit log at the end of the file.

## Running it

Open `index.html` in Chrome or Edge on a computer. Nothing needs to be installed.

To install it, serve the folder from any static web host over https (or `localhost`) and use your browser's Install or Add to Home Screen option. Other browsers also run the app, but Save downloads a new copy instead of writing back to the same file.

The Help button opens `help.html`. The same text appears inside the app under Help in the sidebar.

## Starting a book

Choose a template (Household, Small business, Nonprofit, or Empty), then enter opening balances on the Accounts screen. The Demo on the welcome screen is a sample business that is not saved unless you save it. `samples/` holds sample books.

Files that use journal features this app does not edit (other commodities, prices, virtual postings, include files) still open. Those entries are kept exactly as written and shown as read-only.

To check a book with hledger: `hledger -f yourbook.journal check`.

## AI helper (optional)

Everything works without AI. To turn it on, choose a provider under **Settings → AI helper**:

- OpenRouter
- Anthropic (Claude)
- OpenAI
- Google (Gemini)
- Local or other: any OpenAI-compatible server, such as Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`), or a hosted service with its own address and key

Paste the key (or the server address), load the model list, pick a model, and save. Keys are stored in this browser only, never in the journal. Anyone who can use this browser profile can use the key, so use a key with a small credit limit.

Nothing is sent until you press an AI button, and every AI result is a suggestion you review. After any AI result, "What was sent to the AI" shows the exact request.

| Where | What it does | What is sent |
| --- | --- | --- |
| Reconcile → Find the difference | Explains a difference (optional) | Its own text |
| Import → Suggest accounts | Fills in accounts for rows that have none | Payee text and direction, no amounts |
| Import a PDF or photo of a statement | Reads items into the normal review step | The file you chose |
| New bill → Read a bill | Fills in the bill form | The file you chose |
| Review → What should I do first? | Suggests an order for the Review list (optional) | Review items |
| Draft reminder / Draft note | Drafts a message for you to edit and send | That invoice or donor's details |
| Set up checks from a scan | Finds where fields go on your check stock | Only an image of blank stock |

Reading PDFs and photos needs a model that accepts files and images. Local models take photos but not PDFs. Anthropic is called directly from the browser; local servers must allow this page's origin (CORS). The app's own checks (for example, opening balance plus items equals closing balance) run without AI.

## Phone app: Simple Ledger Pocket

The `pocket/` folder is a separate small phone app. It is installable and works offline. People on your People list use it to record spending and income as it happens.

1. In Simple Ledger, go to **Settings → Phone app → Set up…** next to a person. Choose their money accounts and categories, then download their setup file and send it to their phone.
2. On the phone, open Simple Ledger Pocket, press **Open setup file**, and choose it. Record entries with **Spent** or **Received**. Press **Send to bookkeeper** to share a CSV by email or message.
3. In Simple Ledger, go to **+ Add → Import entries from a phone**, or drop the CSV into a register's Import. Review and import. Entries get `for:` and `pocket:` tags. Importing the same file again adds nothing twice, and likely duplicates of bank or card entries are unticked for you to check.

CSV columns: `pocket_id,date,person,kind,amount,category,account,payee,note` (`kind` is `spent` or `received`; `amount` is positive).

**Foreign currency:** setup files carry the book's currency code. Foreign entries use the latest reference rate from `api.frankfurter.dev`, which needs no key and is cached on the phone. A person can type the amount the card charged instead. The CSV adds `orig_amount,orig_currency,rate`, and the memo records the original amount and rate. Without a connection, the phone uses the cached rate or a rate typed in.

The phone app caches its own files with `pocket/sw.js`. When you change any file in `pocket/`, raise `VERSION` in that file so phones pick up the update.

## Sharing the work with a helper

A helper enters part of the work in their own copy of the book (made with Save As) and sends the file back. **+ Add → Import entries from a helper** (or choosing a `.journal` file in an account's Import window) brings in only their new entries. The import never changes or deletes anything already in your book.

- Each imported entry is tagged `from:<id>` with its id in the helper's file, so importing the same file again, or a later version of it, adds nothing twice.
- Entries that look like something already entered (same money account and amount within 3 days) are unticked for review. Entries in the locked period, and invoices whose number is already used, are refused.
- Accounts missing from your book can be added or mapped to an existing account. New contacts and people are added, and payments stay linked to the invoices or bills they settle.

Helpers add entries; they do not change yours. Split the work by job (for example, one person does bills and a card, another does the bank accounts) to avoid entering the same thing twice.

## Install and offline use

`manifest.webmanifest`, the icons, and `sw.js` make the app installable and usable offline over https. The service worker is network-first: online, you always get the newest files, and they are saved; offline, the saved copy is used. You do not need to change a version number when files change. New `.js` files should be added to `FILES` in `sw.js` so the first offline visit has them.

Exchange-rate lookups and AI requests are never saved offline; they need a connection.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page layout and toolbar |
| `styles.css` | All styles, including phone layout and print rules |
| `help.html`, `js/helpcontent.js` | The guide (text lives in `helpcontent.js`) |
| `js/money.js` | Integer-cent arithmetic, parsing, formatting, amounts in words |
| `js/journal.js` | hledger journal reader and writer |
| `js/book.js` | The book model: accounts, transactions, balances, validation, lock, edit log |
| `js/templates.js` | Starter charts of accounts |
| `js/reports.js`, `js/reportui.js` | Report calculations; the Reports screen |
| `js/import.js`, `js/importui.js` | OFX/QFX/CSV parsing, matching, rules; import dialogs |
| `js/reconcile.js`, `js/reconcileui.js`, `js/diagnose.js` | Reconciliation; Find the difference |
| `js/biz.js`, `js/bizui.js` | Contacts, invoices, bills, payments, aging, donations, letters |
| `js/checks.js`, `js/checksui.js` | Check data and layout; the Checks screen and printing |
| `js/flow.js`, `js/quickui.js` | Pay / get paid / move logic; the + Add dialogs; the People setting |
| `js/ai.js`, `js/aiui.js` | AI providers and requests; AI features |
| `js/pocket.js`, `js/pocketui.js` | Phone app setup files and importing phone entries |
| `js/merge.js`, `js/mergeui.js` | Add-only import of a helper's file |
| `js/storage.js` | Open and save files, Recent books, autosave drafts |
| `js/ui.js` | Screen helpers, dialogs, toasts |
| `js/app.js` | Screens: Home, Accounts, registers, All transactions, Settings, Journal text |
| `js/home.js`, `js/demo.js` | Home dashboard, backups, Help screen; the demo book |
| `sw.js`, `manifest.webmanifest`, `icon*` | Install and offline support |
| `pocket/` | The Simple Ledger Pocket phone app |
| `samples/` | Sample books, and sample bank and card files for import |

No build step is needed. The app uses plain JavaScript files loaded by `index.html`.

## License

Copyright (C) 2026 Francisco Ruiz.

Simple Ledger is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; see the [LICENSE](LICENSE) file for the full text.
