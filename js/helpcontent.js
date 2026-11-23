/* Simple Ledger - helpcontent.js: the Help text, shared by the Help screen and help.html.
   Written for someone who knows very little accounting. Plain static HTML, edit freely. */
(function () {
  const SL = window.SL = window.SL || {};

  const SECTIONS = [
    { id: 'start', title: 'Start here', body: `
<p>Simple Ledger is a bookkeeping program. It keeps a record of where your money came from and where it went, so you can answer questions like <em>How much do we have?</em>, <em>What did we spend on groceries this year?</em>, and <em>Did we make money?</em></p>
<p>Your whole record is one plain-text file that stays on your computer. Nothing is sent anywhere, except what you choose to send to the optional AI helper.</p>
<h3>The three habits that matter</h3>
<ol>
  <li><strong>Record each thing that happens.</strong> Press <strong>+ Add</strong> and say what happened in plain words: you paid someone, you got paid, or you moved money between your own accounts.</li>
  <li><strong>Save.</strong> Press <strong>Save</strong> (or <kbd>Ctrl</kbd>+<kbd>S</kbd>, <kbd>⌘S</kbd> on a Mac). Nothing is stored until you save. The little dot next to the title shows when there is something unsaved.</li>
  <li><strong>Once a month, reconcile.</strong> That means checking your records against the bank statement. It catches mistakes while they are small. See "Reconciling" below.</li>
</ol>
<p>That is the whole job. Everything else in this program is there to make one of those three easier.</p>` },

    { id: 'accounting', title: 'Accounting in five minutes', body: `
<p>You do not need to learn accounting to use this program, but a few ideas make everything else make sense.</p>
<h3>1. An account is a labeled bucket</h3>
<p>Checking, Cash, Groceries, Salary, and Credit Card are all accounts. Each one keeps a running total. There are five kinds:</p>
<table class="help-table">
  <tr><th>Kind</th><th>What it is</th><th>Examples</th></tr>
  <tr><td><strong>Asset</strong></td><td>Things you own or are owed. Money you have.</td><td>Checking, Savings, Cash, a car, money a customer owes you</td></tr>
  <tr><td><strong>Liability</strong></td><td>Money you owe to others.</td><td>Credit card, a loan, a bill you have not paid yet</td></tr>
  <tr><td><strong>Equity</strong></td><td>What is left for you after subtracting what you owe from what you own. It also holds your starting balances.</td><td>Opening balances</td></tr>
  <tr><td><strong>Revenue</strong> (income)</td><td>Money coming in from earning it.</td><td>Salary, sales, donations, interest</td></tr>
  <tr><td><strong>Expense</strong></td><td>Money going out for things you used up.</td><td>Groceries, rent, electricity, supplies</td></tr>
</table>
<h3>2. Every transaction moves money from one account to another</h3>
<p>You buy groceries for $50 with your checking account. Checking goes down by $50 and Groceries goes up by $50. Money did not appear or disappear; it moved. Because every entry has two sides that match, the books always balance. If they ever do not, something was typed wrong, and the program will tell you.</p>
<table class="help-table">
  <tr><th>What happened</th><th>Money leaves</th><th>Money goes to</th></tr>
  <tr><td>Bought groceries with the debit card</td><td>Checking</td><td>Groceries (expense)</td></tr>
  <tr><td>Got paid</td><td>Salary (income)</td><td>Checking</td></tr>
  <tr><td>Moved $500 to savings</td><td>Checking</td><td>Savings</td></tr>
  <tr><td>Bought gas with the credit card</td><td>Credit Card (you now owe more)</td><td>Gas (expense)</td></tr>
  <tr><td>Paid the credit card bill</td><td>Checking</td><td>Credit Card (you now owe less)</td></tr>
</table>
<h3>3. "Debit" and "credit" can be ignored</h3>
<p>Accountants use the words <em>debit</em> and <em>credit</em> for the two sides of an entry. They do not mean "bad" and "good", and they do not mean what your bank means by them. This program uses plain words (<em>I paid someone</em>, <em>I got paid</em>), and the register columns are named for the kind of account you are looking at, such as <em>Deposit</em> and <em>Withdrawal</em>. If you see Debit and Credit, you can treat them as "left column" and "right column".</p>
<h3>4. What the reports tell you</h3>
<ul>
  <li><strong>Balance sheet:</strong> a snapshot on one date. What you own, what you owe, and the difference.</li>
  <li><strong>Income statement</strong> (profit and loss): over a period of time, what came in, what went out, and what was left over. If income is bigger, you made money; if expenses are bigger, you lost money.</li>
</ul>` },

    { id: 'first', title: 'Your first 15 minutes', body: `
<ol>
  <li><strong>Start a book.</strong> Press <strong>New</strong> and pick a starting set of accounts: Household, Small business, or Nonprofit. You can change the accounts later. Or press <strong>Open</strong> to open an existing <code>.journal</code> file. If you only want to look around, <strong>Try the demo</strong> on the welcome screen opens a sample business.</li>
  <li><strong>Check your accounts.</strong> Open <strong>Accounts</strong> in the sidebar. They are grouped by kind (Asset, Liability, Equity, Revenue, Expense) and alphabetical inside each kind. Use <strong>Add account</strong> for anything missing, such as your actual bank, and <strong>Rename</strong> to make a name match your life.</li>
  <li><strong>Enter your starting balances.</strong> On the Accounts screen, click <strong>Opening balance</strong> beside each bank, cash, or card account. Type what the account held on the day you start keeping books. For a credit card, type what you owe. Use the date of your last statement.</li>
  <li><strong>Add your first transaction.</strong> Press <strong>+ Add</strong>, choose what happened, fill in the blanks, and press the button at the bottom.</li>
  <li><strong>Save.</strong> The first time, the program asks where to put the file. Choose a folder you back up.</li>
</ol>
<p><strong>Tip:</strong> You do not have to enter years of history. Start from today with the opening balances.</p>` },

    { id: 'entering', title: 'Entering transactions', body: `
<p>Press <strong>+ Add</strong> at the top of the screen. There are three choices.</p>
<h3>I paid someone</h3>
<ul>
  <li><strong>Who:</strong> the store or person. The program suggests names you used before.</li>
  <li><strong>What it was for:</strong> an expense account such as Groceries or Electricity. Pick the closest one; you can always change it later.</li>
  <li><strong>Paid from:</strong> where the money came from. Paid with a credit card? Choose the card. Paid cash? Choose Cash.</li>
  <li><strong>How:</strong> Check, Online or ACH, Zelle or similar, or Debit card. For a check, the next check number is filled in, and you can print it right away.</li>
</ul>
<h3>I got paid</h3>
<ul>
  <li><strong>From:</strong> who paid you. <strong>For:</strong> the income account (Salary, Sales, Gift, and so on).</li>
  <li><strong>Where it went:</strong> if you are holding a paper check, choose <em>Checks Not Yet Deposited</em>. When you take it to the bank, press <strong>Deposit checks</strong> on the Checks screen (see "Checks").</li>
</ul>
<h3>I moved money between my accounts</h3>
<p>Use this for transfers such as checking to savings, or paying your own credit card. It is not income and not an expense; it just moves money.</p>
<h3>Common situations</h3>
<table class="help-table">
  <tr><th>Situation</th><th>What to do</th></tr>
  <tr><td>Paid the credit card bill</td><td><em>Moved money</em> from Checking to the Credit Card. Do <em>not</em> record it as an expense, because the purchases were already counted when you made them.</td></tr>
  <tr><td>Bought something with the credit card</td><td><em>I paid someone</em>, paid from the Credit Card.</td></tr>
  <tr><td>Got a refund</td><td><em>I got paid</em>, with the expense account as the source (so the expense goes down). Or enter the amount as a negative expense in the register.</td></tr>
  <tr><td>One purchase, several categories (a store trip with groceries and cleaning supplies)</td><td>In a register, press <strong>Split…</strong> and give each part its own account and amount. The parts must add up to the total.</td></tr>
  <tr><td>Took cash out of the ATM</td><td><em>Moved money</em> from Checking to Cash. Record what you spend from Cash as <em>I paid someone</em>.</td></tr>
  <tr><td>Interest from the bank</td><td><em>I got paid</em>, from an Interest income account, into the bank account.</td></tr>
</table>
<h3>Registers</h3>
<p>Click an account in the sidebar (under <strong>Registers</strong>) to see a running list of everything in it, like the paper register in a checkbook. You can type transactions straight into the line at the top, and click any line to change it.</p>
<h3>Changing the account on many transactions at once</h3>
<p>Say twenty "Groceries" entries should really be "Household Supplies". Open <strong>All transactions</strong>, then:</p>
<ol>
  <li>Narrow the list with the search box (and the person choice, if you use it), or just tick transactions one by one.</li>
  <li>Press <strong>Select all shown</strong> to tick everything the search found, then untick any that do not belong.</li>
  <li>Press <strong>Change account…</strong>, choose the account to move <em>from</em> and the account to move <em>to</em>, and confirm.</li>
</ol>
<p>Only the lines on the "from" account move; the other side of each transaction (your bank, say) is untouched. Transactions in a locked period, invoices and bills, and lines you have already reconciled are skipped, and you are told how many. The change is written to the edit log.</p>
<h3>Fixing a mistake</h3>
<p>Click the transaction, change it, and press <strong>Save changes</strong>. To remove it, open it and press <strong>Delete</strong>. Changes and deletions are written to an edit log at the end of your file, so nothing disappears without a trace. Items you have reconciled are protected. To change one, open Reconcile and press <strong>Undo last reconciliation</strong> for that account first.</p>` },

    { id: 'people', title: 'Tracking each person', body: `
<p>Useful for a household or family where you want to know, for example, what each person earned or spent.</p>
<ol>
  <li>Open <strong>Settings → People</strong> and add names (Ana, Ben).</li>
  <li>A <strong>For</strong> choice now appears on each transaction, and on each line of a split. Pick a person or leave it as <em>Shared</em>.</li>
  <li>In <strong>Reports</strong>, choose <em>Income and expenses by person</em>. It shows one column per person, plus Shared.</li>
</ol>
<h3>When someone arrives or leaves</h3>
<ul>
  <li><strong>Someone new:</strong> add their name in Settings → People.</li>
  <li><strong>Someone leaves:</strong> press <strong>Retire</strong>. They disappear from the choices for new entries but keep all their history. <strong>Bring back</strong> reverses it.</li>
  <li><strong>A misspelled name:</strong> press <strong>Rename</strong> and give the correct spelling. Every past entry is updated. If the correct name already exists, the program asks whether to merge the two. A name can be removed only if nothing uses it.</li>
</ul>
<p>The names in the list are in alphabetical order. A name with the label <em>Not in list</em> appears on entries but is not on your list yet; press <strong>Add to list</strong>, or rename it to match.</p>` },

    { id: 'phone', title: 'Recording on a phone (Simple Ledger Pocket)', body: `
<p>People on your People list can record spending and income on their phone as it happens, with your categories, and send it to you. You import the file and every entry lands in the right accounts, marked For that person.</p>
<h3>Setting up a person (once)</h3>
<ol>
  <li>Open <strong>Settings → Phone app</strong> and press <strong>Set up…</strong> next to the person.</li>
  <li>Tick the accounts they pay with or receive into (Cash, their card, a shared card…), and the spending and income categories they may choose. Fewer choices make the phone quicker to use.</li>
  <li>Press <strong>Save and download setup file</strong>, then email or message the file (it ends in <code>.pocket.json</code>) to that person.</li>
  <li>On their phone, they open the Pocket app, press <strong>Open setup file</strong>, and choose the file. Done.</li>
</ol>
<p>When you add or rename categories, send them a new setup file the same way. Their unsent entries stay on the phone.</p>
<h3>On the phone</h3>
<ul>
  <li>Press <strong>Spent</strong> or <strong>Received</strong>, type the amount, choose the category and the account, optionally the store and a note, and Save.</li>
  <li>When they are ready (weekly, say), they press <strong>Send to bookkeeper</strong> and pick Mail or Messages. Sent entries stay on the phone for 90 days under <em>Sent earlier</em>, in case a file gets lost.</li>
</ul>
<h3>Traveling abroad</h3>
<p>The phone app converts foreign money for you. In the entry, change the currency next to the amount (for example from USD to EUR). It fetches today's rate over the internet and shows what the entry counts as in your book's currency. The person can change the rate, or simply type the amount their card or bank actually charged, and the rate adjusts to match. Offline, the last rate it saw is used; with none, they type it in. The file records both amounts, and your entry shows the original in its note, like <em>(EUR 45.00 at 1.11333)</em>.</p>
<p>The rate is a reference rate (central banks, and some crypto codes such as BTC under <em>Other…</em>), so it will differ slightly from what a card company charges after its own rate and fees. For exact books, type the charged amount from the card app or statement. Purchases the card company later reports are still recognized as already entered if the amounts are within 5%. Set your book's currency code (such as USD) in the Phone app setup window; the phone uses it to know what to convert into.</p>
<h3>Importing what they send</h3>
<ol>
  <li>Save the attached <code>.csv</code> file, then press <strong>+ Add → Import entries from a phone</strong> (or Settings → Phone app → Import phone entries).</li>
  <li>Review the list and press <strong>Import</strong>.</li>
</ol>
<ul>
  <li>Each entry has its own ID, so importing the same file twice never adds anything twice.</li>
  <li>If a purchase is already in your books (for example from the card company's file), it is marked <em>Check</em> and left unticked. Tick it only if it really is a different purchase.</li>
  <li>If a category was renamed since the setup file was made, you are asked where those entries go.</li>
  <li>If you later import the card company's file, purchases already entered from the phone are recognized and marked cleared, not added again.</li>
</ul>
<h3>Where the phone app lives</h3>
<p>The phone app is the <code>pocket</code> folder that comes with Simple Ledger. To use it on a phone it must be on a website (https), for example the same site where you put Simple Ledger. Open its address on the phone once and add it to the Home Screen; after that it works offline. Entries are stored only on that phone until they are sent.</p>` },

    { id: 'helper', title: 'Sharing the work with a helper', body: `
<p>A second person can enter part of the work in their own copy of the books, and you bring their entries into yours. Your file stays the real one. Helpers send <strong>additions</strong>, never changes.</p>
<h3>Setting it up</h3>
<ol>
  <li>Give the helper a copy of your file (<strong>Save As</strong>, then send it), so they have the same accounts. They open it in Simple Ledger on their own computer.</li>
  <li>Split the work by job, not by date: for example, the helper enters bills and one credit card, and you handle the bank accounts and reconciling. Then you will rarely both type the same thing.</li>
</ol>
<h3>Bringing their entries in</h3>
<ol>
  <li>When they send their file, press <strong>+ Add</strong> and choose <strong>Import entries from a helper</strong> (or choose their file in any account's Import window).</li>
  <li>You see only what is new. Entries already in your book, including those from the copy you gave them, are skipped. Entries that look like something you already typed (same account and amount within 3 days) are unticked; tick them if they really are new.</li>
  <li>If they added an account, choose whether to add it to your book or send its entries to one of your accounts.</li>
  <li>New contacts and people named on their entries are added too. Payments they recorded stay linked to the invoices or bills they paid.</li>
</ol>
<h3>What does not come over</h3>
<ul>
  <li>Changes and deletions they made to entries you already have. If something needs fixing, fix it in your book.</li>
  <li>Entries you deleted from your book; they are not brought back.</li>
  <li>Entries in your locked period, and invoices whose number you already used (the helper should renumber those).</li>
  <li>Their reconciliation marks. Reconcile in your book.</li>
</ul>
<p>They can keep working in the same file and send it again later. Only the entries that are new since the last time come in.</p>
` },
    { id: 'checks', title: 'Checks', body: `
<h3>Writing checks</h3>
<ul>
  <li>Choose <strong>I paid someone → Check</strong>, or open <strong>Checks</strong> in the sidebar and press <strong>Write a check</strong>. The number is the next one for that bank account.</li>
  <li>The <strong>Checks</strong> list shows each check, whether the bank has cleared it, and a filter, <em>Show only outstanding checks</em>, for checks you wrote that have not cleared yet.</li>
  <li>A check number is not the same as a transaction number. The check number is the one printed on the check; the program numbers transactions by itself.</li>
</ul>
<h3>Printing</h3>
<ul>
  <li>Printing is for pre-printed check stock, 8.5 × 11 inches, with the check in the middle and a stub above and below. Only the changing parts (date, payee, amount, memo, stub details) are printed.</li>
  <li><strong>Always test first.</strong> Press <strong>Alignment test</strong>, print it on plain paper at 100% scale (not "fit to page"), and hold it up to a real check sheet against a window. If a field is off, use <strong>Calibrate</strong> to move it, in inches.</li>
  <li>With the AI helper on, <strong>Calibrate → Set up from a scan</strong> finds the positions for you from a scan of one blank sheet.</li>
</ul>
<h3>Checks you receive</h3>
<ol>
  <li>Record <em>I got paid</em> and put the money in <strong>Checks Not Yet Deposited</strong>.</li>
  <li>At the bank, press <strong>Deposit checks</strong>, tick the checks that are in the deposit, choose the bank account and date, and confirm. They move into the bank as one deposit that matches your bank statement.</li>
</ol>` },

    { id: 'bank', title: 'Bank files and reconciling', body: `
<h3>Importing from your bank</h3>
<ul>
  <li>On your bank's website, download your recent transactions. <strong>OFX or QFX</strong> files are best because each item has a unique ID, so importing the same file twice never makes duplicates. <strong>CSV</strong> works too; the program remembers how you matched its columns for each account.</li>
  <li>Open the account's register and press <strong>Import</strong>. You see every row before anything is added. Rows that look like something you already typed (same amount, within 3 days; 7 days for credit cards, which post late) are marked as already there. Purchases you entered on the phone in a foreign currency also match when the card's converted amount is within 5%.</li>
  <li>No file from the bank? With the AI helper on, you can also choose a <strong>PDF or a photo of a paper statement</strong> in the same window. The AI reads every line and checks that opening balance plus the transactions equals the printed closing balance. If the check fails, a line was missed or misread, so compare against the paper. Always look over the rows before importing.</li>
  <li>On a credit card statement, a "payment received" row should go to your bank account (it is a transfer, not income). If you already imported the bank statement and chose the card account there, it is recognized and marked as already there.</li>
  <li>Choose an account for each new row. Tick <strong>Rule</strong> to remember the choice for that payee next time. With the AI helper on, it can suggest accounts.</li>
</ul>
<h3>Reconciling</h3>
<p><strong>What it is:</strong> comparing your records to the bank's statement to make sure they agree. <strong>Why:</strong> it catches typos, missing items and bank errors while they are still easy to find. <strong>When:</strong> once a month, when the statement arrives.</p>
<ol>
  <li>Open <strong>Reconcile</strong> and pick the account (bank or credit card).</li>
  <li>Enter the statement date and the <strong>ending balance</strong> printed on the statement.</li>
  <li>Tick each item that appears on the statement.</li>
  <li>When the <strong>Difference</strong> reads $0.00, press <strong>Finish</strong>. Those items are now locked.</li>
</ol>
<p>If the difference will not reach zero, press <strong>Find the difference</strong>. It looks for a missed item, a number typed with the wrong sign, two digits swapped, and similar slips, using only arithmetic on your entries.</p>` },

    { id: 'reports', title: 'Reports', body: `
<p>Open <strong>Reports</strong> and choose one. Set the date range at the top; click any number to see the transactions behind it.</p>
<table class="help-table">
  <tr><th>Report</th><th>Answers the question</th></tr>
  <tr><td>Income statement</td><td>Over this period, how much came in, how much went out, and what was left? (Also called profit and loss.)</td></tr>
  <tr><td>Balance sheet</td><td>On this date, what do I own, what do I owe, and what is the difference?</td></tr>
  <tr><td>Category totals</td><td>How much did I spend or earn in each category?</td></tr>
  <tr><td>Trial balance</td><td>A list of every account's balance, in two columns that must match. A quick check that the books balance.</td></tr>
  <tr><td>General ledger</td><td>Every transaction in every account, in date order. The full detail.</td></tr>
  <tr><td>Income and expenses by person</td><td>What each person earned and spent (appears when you have a People list).</td></tr>
  <tr><td>Customer and supplier aging</td><td>Who owes you, and whom you owe, grouped by how late (business books).</td></tr>
</table>
<h3>Cash or accrual?</h3>
<p>In a business book, reports can count an invoice <strong>when it is issued</strong> (accrual) or <strong>when it is paid</strong> (cash). For a household, there is no difference. Small businesses often use cash; ask your accountant which one your tax return needs.</p>` },

    { id: 'business', title: 'Invoices and bills (business)', body: `
<ul>
  <li>Turn on business features in <strong>Settings</strong>. Add your customers and suppliers under <strong>Contacts</strong>.</li>
  <li>An <strong>invoice</strong> is a request for payment you send to a customer. Recording one raises <em>Accounts Receivable</em> (money customers owe you) and records income.</li>
  <li>A <strong>bill</strong> is a request for payment you receive from a supplier. Recording one raises <em>Accounts Payable</em> (money you owe) and records an expense.</li>
  <li>When the money moves, open the invoice or bill and record the payment. Partial payments are fine; the balance is tracked for you.</li>
  <li>The <strong>aging reports</strong> in Reports show what is overdue. The <strong>Review</strong> screen lists overdue invoices too, and the AI can draft a polite reminder.</li>
</ul>` },

    { id: 'donations', title: 'Donations and thank-you letters (nonprofit)', body: `
<ul>
  <li>Turn on donations in <strong>Settings</strong>. Record each gift under <strong>Donations</strong>: who, when, how much, and whether the donor received any goods or services in return.</li>
  <li>Non-cash gifts (a car, clothing, equipment) are <em>described</em> in the letter, never given a dollar value. The donor decides the value for their own taxes.</li>
  <li><strong>Letters</strong> prepares one page per donor for the year, with the statement the IRS requires. Print them, then press <strong>Mark as sent</strong>. Edit the opening and closing text in Settings to suit your organization.</li>
</ul>
<p>This program does not give tax advice. Ask your tax preparer about your particular case.</p>` },

    { id: 'files', title: 'Saving, backups, and your file', body: `
<ul>
  <li><strong>Save</strong> writes to your file. In Chrome or Edge it saves in place; in other browsers it downloads a copy each time, so keep the newest one.</li>
  <li><strong>Backups:</strong> in Settings → Backups, choose a folder and each save also leaves a dated copy, keeping the latest 30. Pick a folder that syncs to the cloud or lives on a USB drive.</li>
  <li><strong>One file per organization.</strong> Keep your household, your business, and your nonprofit in separate files.</li>
  <li>The file is plain text in a standard format (hledger). You can open it in any text editor, and you will never be locked in. If you use hledger, <code>hledger -f yourbook.journal check</code> verifies it. Lines beginning with <code>; sb:</code> hold this program's settings.</li>
</ul>` },

    { id: 'install', title: 'Installing the app and using it offline', body: `
<p>When Simple Ledger is opened from a web address (https), your browser can keep a copy so it opens without Internet and works like an app.</p>
<ul>
  <li><strong>Computer (Chrome or Edge):</strong> click the install icon at the right end of the address bar, or open the browser menu and choose Install Simple Ledger.</li>
  <li><strong>iPhone or iPad (Safari):</strong> press Share, then <strong>Add to Home Screen</strong>.</li>
  <li><strong>Android (Chrome):</strong> open the menu and choose <strong>Install app</strong> or Add to Home screen.</li>
</ul>
<p><strong>Updates:</strong> every time you open the app while online, it loads the newest version and keeps that copy for offline use. Close and reopen the app to get an update. Nothing is sent anywhere; your books stay in your own file. Only the optional AI helper, and exchange rates in the phone app, need Internet.</p>
<p>If you open the file straight from your computer (a web address starting with file:), it already works offline, but it cannot be installed.</p>
` },
    { id: 'ai', title: 'AI helper (optional)', body: `
<p>Everything works without it. If you choose an AI provider in <strong>Settings → AI helper</strong>, buttons appear that can read a bill or statement PDF, suggest accounts for imported rows, explain a reconciliation difference, draft reminders, and set up check printing from a scan.</p>
<h3>Choosing a provider</h3>
<table class="help-table">
  <tr><th>Provider</th><th>What you need</th><th>Notes</th></tr>
  <tr><td>OpenRouter</td><td>A key from openrouter.ai/keys</td><td>One key reaches hundreds of models, from every major company. Good if you want to try several.</td></tr>
  <tr><td>Anthropic (Claude)</td><td>A key from console.anthropic.com</td><td>Reads PDFs and photos.</td></tr>
  <tr><td>OpenAI</td><td>A key from platform.openai.com</td><td>Reads PDFs and photos.</td></tr>
  <tr><td>Google (Gemini)</td><td>A key from aistudio.google.com/apikey</td><td>Reads photos; PDFs may not work through this connection, so use a photo or screenshot if a PDF is refused.</td></tr>
  <tr><td>Local or other</td><td>The server's address, such as <code>http://localhost:11434/v1</code> for Ollama or <code>http://localhost:1234/v1</code> for LM Studio</td><td>Runs on your own computer, so nothing leaves it. Also works for any OpenAI-compatible service (xAI, Mistral, DeepSeek, Groq…) with its address and key.</td></tr>
</table>
<p>Each provider's key and model are remembered separately, so you can switch back and forth. To set up: pick the provider, paste the key (or enter the server address), press <strong>Load model list</strong>, pick a model, and press <strong>Save model and test</strong>.</p>
<h3>Which model?</h3>
<p>For reading bills and statements, use a current model that accepts images (almost every recent large model does). A smaller, cheaper model is fine for account suggestions and reminders; a larger one reads messy scans better. If the names in the model list are unfamiliar, choose the newest one from the company you picked, or ask the provider's site which is recommended. Model names change often, which is why the list is loaded from your account.</p>
<h3>Using a local model</h3>
<ul>
  <li>Install a server such as Ollama or LM Studio, download a model, and start the server. For photos, pick a model that accepts images (a "vision" model). PDFs are not accepted by local models here; take a photo or screenshot of the page.</li>
  <li>Small local models can make mistakes with structured answers. Always review what they suggest; nothing is saved until you do.</li>
  <li>The server must allow this page to connect. In LM Studio, turn on its server's CORS option. In Ollama, if you open Simple Ledger from a website address, start Ollama with the environment variable <code>OLLAMA_ORIGINS</code> set to that address. If you open the file straight from your computer, Ollama's defaults usually work. Safari blocks pages from the internet from reaching <code>http://localhost</code>; use Chrome or Edge in that case.</li>
</ul>
<h3>What leaves your computer</h3>
<ul>
  <li>Nothing is sent until you press an AI button.</li>
  <li><strong>What was sent to the AI</strong> shows exactly what was sent, and to which provider and model.</li>
  <li>With a cloud provider, the request goes to that company, under its own terms and privacy policy. With a local server, it stays on your computer.</li>
  <li>The key stays in this browser only. AI suggestions are always shown to you first, and nothing is recorded until you accept it.</li>
</ul>` },

  { id: 'trouble', title: 'Questions and problems', body: `
<dl class="help-faq">
  <dt>The dot next to the title is filled in.</dt><dd>You have unsaved changes. Press Save.</dd>
  <dt>I entered something in the wrong account.</dt><dd>Click the transaction, change the account, and save. Reconciled items are protected: use Reconcile → Undo last reconciliation first.</dd>
  <dt>I cannot delete an account.</dt><dd>An account that has transactions cannot be deleted, because its history would be lost. Press <strong>Hide</strong> instead, or move its transactions to another account first.</dd>
  <dt>A balance looks backwards (a negative number on a credit card).</dt><dd>Money owed is shown as a positive amount in liability accounts in registers and reports. If you see a surprising sign, open the account and check that purchases and payments are on the correct sides. The Review screen also looks for this.</dd>
  <dt>Reconcile will not come out to zero.</dt><dd>Press <strong>Find the difference</strong>. The usual causes are one missed item, a payment entered twice, or a typo in one amount.</dd>
  <dt>I imported the same bank file twice.</dt><dd>With OFX/QFX files nothing is duplicated. With CSV, rows that match existing ones are marked, and Review flags possible duplicates.</dd>
  <dt>The printed check is off by a little.</dt><dd>Use Calibrate to move the field, in inches, and print the Alignment test again. Print at 100% scale.</dd>
  <dt>Can two people use the same file?</dt><dd>Not at the same time. Pass the file back and forth, and keep the newest copy.</dd>
  <dt>Should I ask an accountant?</dt><dd>For taxes, payroll, or anything you are unsure about, yes. This program keeps good records; it does not give tax or legal advice.</dd>
</dl>` },

    { id: 'glossary', title: 'Glossary', body: `
<dl class="help-faq">
  <dt>Account</dt><dd>A labeled bucket that holds a running total, such as Checking or Groceries.</dd>
  <dt>Accounts payable</dt><dd>Money you owe to suppliers for bills you have not paid yet.</dd>
  <dt>Accounts receivable</dt><dd>Money customers owe you for invoices not yet paid.</dd>
  <dt>Accrual</dt><dd>Counting income and expenses when they are billed, not when money moves.</dd>
  <dt>Asset</dt><dd>Something you own or are owed.</dd>
  <dt>Balance</dt><dd>The amount in an account at a point in time.</dd>
  <dt>Balance sheet</dt><dd>A report of assets, liabilities, and equity on one date.</dd>
  <dt>Cash basis</dt><dd>Counting income and expenses when money actually moves.</dd>
  <dt>Chart of accounts</dt><dd>The full list of your accounts. The Accounts screen.</dd>
  <dt>Cleared</dt><dd>Matched to the bank's statement. A check is <em>cleared</em> once the bank has paid it.</dd>
  <dt>Credit / Debit</dt><dd>The two sides of an accounting entry. Ignore them; this program uses plain words.</dd>
  <dt>Equity</dt><dd>What you own minus what you owe. Also where opening balances live.</dd>
  <dt>Expense</dt><dd>Money spent on things used up, such as food, rent, or supplies.</dd>
  <dt>Income statement</dt><dd>A report of income and expenses over a period. Also called profit and loss.</dd>
  <dt>Journal</dt><dd>The list of all transactions in date order. Your file is a "journal file".</dd>
  <dt>Liability</dt><dd>Money you owe.</dd>
  <dt>Outstanding check</dt><dd>A check you wrote that the bank has not paid yet.</dd>
  <dt>Reconcile</dt><dd>Compare your records with a bank or card statement to make sure they agree.</dd>
  <dt>Register</dt><dd>The running list of transactions in one account.</dd>
  <dt>Revenue</dt><dd>Income from earning it. The word for money coming in.</dd>
  <dt>Split</dt><dd>One transaction divided among several accounts.</dd>
  <dt>Transaction</dt><dd>One event that moves money from one account to another.</dd>
  <dt>Trial balance</dt><dd>A list of every account's balance. It must come out even.</dd>
</dl>` }
  ];

  function render(root) {
    const doc = root.ownerDocument;
    const el = (tag, attrs, html) => { const e = doc.createElement(tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };
    const wrap = el('div', { class: 'help' });
    wrap.appendChild(el('h1', null, 'Help'));
    wrap.appendChild(el('p', { class: 'help-lead' }, 'Written for people who know little or no accounting. Start with "Start here" and "Accounting in five minutes"; use the list below to jump to what you need.'));
    const box = el('input', { type: 'search', class: 'help-search', placeholder: 'Search the help (for example: check, reconcile, currency)', 'aria-label': 'Search the help' });
    const status = el('p', { class: 'help-status note' });
    wrap.appendChild(box); wrap.appendChild(status);
    const toc = el('ul', { class: 'help-toc' });
    for (const s of SECTIONS) toc.appendChild(el('li', null, '<a href="#help-' + s.id + '">' + s.title + '</a>'));
    wrap.appendChild(toc);
    for (const s of SECTIONS) {
      const sec = el('section', { id: 'help-' + s.id });
      sec.appendChild(el('h2', null, s.title));
      sec.appendChild(el('div', null, s.body));
      wrap.appendChild(sec);
    }
    // Search: show only sections that contain every word typed, and highlight the words
    const secs = [...wrap.querySelectorAll('section')], tocItems = [...toc.children];
    const unmark = (root) => { root.querySelectorAll('mark.help-hit').forEach(m => { m.replaceWith(doc.createTextNode(m.textContent)); }); root.normalize(); };
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function search() {
      const words = box.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      secs.forEach((sec, i) => {
        unmark(sec);
        const text = sec.textContent.toLowerCase();
        const hit = words.every(w => text.includes(w));
        sec.hidden = !hit; tocItems[i].hidden = !hit;
        if (!hit) return;
        shown++;
        if (!words.length) return;
        const re = new RegExp('(' + words.map(esc).join('|') + ')', 'gi');
        const walker = doc.createTreeWalker(sec, 4 /* text nodes */);
        const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
        for (const n of nodes) {
          if (!re.test(n.nodeValue)) { re.lastIndex = 0; continue; }
          re.lastIndex = 0;
          const span = doc.createElement('span');
          span.innerHTML = n.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(re, '<mark class="help-hit">$1</mark>');
          n.replaceWith(...span.childNodes);
        }
      });
      status.textContent = words.length ? (shown ? shown + ' section' + (shown === 1 ? '' : 's') + ' match. Clear the box to see everything.' : 'Nothing found. Try a shorter or different word.') : '';
      if (words.length && shown) { const first = wrap.querySelector('mark.help-hit'); if (first) first.scrollIntoView({ block: 'center' }); }
    }
    box.addEventListener('input', search);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.value = ''; search(); } });
    // In-app links must scroll inside the app, not change the page address.
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#help-"]');
      if (!a) return;
      e.preventDefault();
      const t = doc.getElementById(a.getAttribute('href').slice(1));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.appendChild(wrap);
    return wrap;
  }

  SL.HelpContent = { SECTIONS, render };
})();
