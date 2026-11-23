/* Simple Ledger - templates.js
   Starter charts of accounts. Edit freely; they are plain journal text. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};

  function chart(lines) {
    return lines.map(([name, type]) => 'account ' + name + ' '.repeat(Math.max(2, 44 - name.length - 8)) + '; type:' + type).join('\n');
  }

  const household = chart([
    ['Assets:Bank:Checking', 'Asset'],
    ['Assets:Bank:Savings', 'Asset'],
    ['Assets:Cash', 'Asset'],
    ['Liabilities:Credit Card', 'Liability'],
    ['Liabilities:Loans', 'Liability'],
    ['Equity:Opening Balances', 'Equity'],
    ['Income:Salary', 'Revenue'],
    ['Income:Interest', 'Revenue'],
    ['Income:Other', 'Revenue'],
    ['Expenses:Housing', 'Expense'],
    ['Expenses:Utilities', 'Expense'],
    ['Expenses:Groceries', 'Expense'],
    ['Expenses:Dining', 'Expense'],
    ['Expenses:Transportation', 'Expense'],
    ['Expenses:Insurance', 'Expense'],
    ['Expenses:Health', 'Expense'],
    ['Expenses:Education', 'Expense'],
    ['Expenses:Gifts and Donations', 'Expense'],
    ['Expenses:Entertainment', 'Expense'],
    ['Expenses:Taxes', 'Expense'],
    ['Expenses:Bank Fees', 'Expense'],
    ['Expenses:Other', 'Expense']
  ]);

  const business = chart([
    ['Assets:Checking', 'Asset'],
    ['Assets:Savings', 'Asset'],
    ['Assets:Accounts Receivable', 'Asset'],
    ['Liabilities:Credit Card', 'Liability'],
    ['Liabilities:Accounts Payable', 'Liability'],
    ['Liabilities:Sales Tax Payable', 'Liability'],
    ['Equity:Opening Balances', 'Equity'],
    ['Equity:Owner Contributions', 'Equity'],
    ['Equity:Owner Draws', 'Equity'],
    ['Income:Sales', 'Revenue'],
    ['Income:Services', 'Revenue'],
    ['Income:Interest', 'Revenue'],
    ['Income:Other', 'Revenue'],
    ['Expenses:Advertising', 'Expense'],
    ['Expenses:Bank Fees', 'Expense'],
    ['Expenses:Contractors', 'Expense'],
    ['Expenses:Insurance', 'Expense'],
    ['Expenses:Meals', 'Expense'],
    ['Expenses:Office Supplies', 'Expense'],
    ['Expenses:Professional Fees', 'Expense'],
    ['Expenses:Rent', 'Expense'],
    ['Expenses:Software', 'Expense'],
    ['Expenses:Taxes and Licenses', 'Expense'],
    ['Expenses:Travel', 'Expense'],
    ['Expenses:Utilities', 'Expense'],
    ['Expenses:Other', 'Expense']
  ]);

  const nonprofit = chart([
    ['Assets:Checking', 'Asset'],
    ['Assets:Savings', 'Asset'],
    ['Assets:Accounts Receivable', 'Asset'],
    ['Liabilities:Credit Card', 'Liability'],
    ['Liabilities:Accounts Payable', 'Liability'],
    ['Net Assets:Without Donor Restrictions', 'Equity'],
    ['Net Assets:With Donor Restrictions', 'Equity'],
    ['Income:Contributions', 'Revenue'],
    ['Income:Grants', 'Revenue'],
    ['Income:Program Fees', 'Revenue'],
    ['Income:Fundraising Events', 'Revenue'],
    ['Income:Interest', 'Revenue'],
    ['Expenses:Program:Supplies', 'Expense'],
    ['Expenses:Program:Events', 'Expense'],
    ['Expenses:Program:Contractors', 'Expense'],
    ['Expenses:Management and General:Bank Fees', 'Expense'],
    ['Expenses:Management and General:Insurance', 'Expense'],
    ['Expenses:Management and General:Professional Fees', 'Expense'],
    ['Expenses:Management and General:Office', 'Expense'],
    ['Expenses:Fundraising:Events', 'Expense'],
    ['Expenses:Fundraising:Printing and Postage', 'Expense']
  ]);

  SL.Templates = {
    list: [
      { id: 'household', label: 'Household', equity: 'Equity:Opening Balances', chart: household },
      { id: 'business', label: 'Small business', equity: 'Equity:Opening Balances', chart: business },
      { id: 'nonprofit', label: 'Nonprofit', equity: 'Net Assets:Without Donor Restrictions', chart: nonprofit },
      { id: 'empty', label: 'Empty (I will make my own)', equity: 'Equity:Opening Balances',
        chart: chart([['Assets', 'Asset'], ['Liabilities', 'Liability'], ['Equity:Opening Balances', 'Equity'], ['Income', 'Revenue'], ['Expenses', 'Expense']]) }
    ],
    get(id) { return this.list.find(t => t.id === id) || this.list[0]; },
    // Journal text for a new book
    newBook(id, name, fyStart) {
      const t = this.get(id);
      const J = SL.Journal;
      return '; sb:book ' + J.formatKV({ name, template: t.id, 'fy-start': String(fyStart || 1).padStart(2, '0') }) +
        '\n\ncommodity $1,000.00\n\n' + t.chart + '\n';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
