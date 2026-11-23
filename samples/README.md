# Sample books (all fake data)

Dates are relative to the day these were generated, so they look current.

- `household.journal`: a household with checking, savings, and a credit card (7 months).
  - `household-checking.ofx`: import into Assets:Bank:Checking. 13 rows match entries already in the book, 6 are new
    (one is a refund, one an unknown ATM fee). The statement balance is filled in, so you can reconcile right after importing.
  - `household-card.csv`: import into Liabilities:Credit Card. Purchases are positive, so tick "Reverse signs" if the preview looks backwards.
    9 rows match, 4 are new.
- `nonprofit.journal`: Riverbend Community Arts, with donors, a gala gift with goods, a non-cash gift, and two donors with no address.
  Go to Donations, then Letters, and pick last year.
- `demo.journal`: a small business with invoices, bills, payments, checks, and a duplicate charge for Review to find
  (the same book as "Try the demo" on the welcome screen).

Open any of them with Open book… (or use Save As first if you want to experiment without touching the original).
