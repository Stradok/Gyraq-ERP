// Role walkthroughs shown at /learn. Each task is something that role really does in the app; "href" opens the screen.
import type { Role } from "./rbac";

export interface Task { title: string; goal: string; steps: string[]; href: string }
export const TUTORIALS: Record<Role, { intro: string; tasks: Task[] }> = {
  owner: {
    intro: "You see everything and approve the big things. Start from Overview, then work through the approval queue.",
    tasks: [
      { title: "Read the morning picture", goal: "Know cash, receivables and risks in two minutes.", href: "/overview", steps: ["Open Overview and read the AI Business Brief.", "Click a KPI (for example Accounts receivable) to drill into its list.", "Use Recommended actions on the right to jump to the screen that fixes each item."] },
      { title: "Approve or reject requests", goal: "Release purchase orders, credit overrides and large journals.", href: "/approvals", steps: ["Open Approvals.", "Open a request to see the amount, who asked and why.", "Press Approve or Reject. Large manual journals need a second approver."] },
      { title: "Set the company limits", goal: "Decide how much each role can do before it needs you.", href: "/settings/policies", steps: ["Open Settings, Policies & tax.", "Change a limit such as the PO approval limit.", "Save. The change is written to the audit log and applies at once."] },
      { title: "Hire someone", goal: "Add an employee so they appear in payroll.", href: "/employees", steps: ["Open Employees and press New employee.", "Fill name, department, position, salary, CNIC and join date.", "Add employee. They are in the next payroll run."] },
    ],
  },
  admin: {
    intro: "You run users, settings and integrations.",
    tasks: [
      { title: "Check who can do what", goal: "Review the permission matrix.", href: "/settings/roles", steps: ["Open Settings, Users & roles.", "Compare roles across modules.", "Use the persona switcher (bottom of the sidebar) to see the app as another role."] },
      { title: "Watch the outbox and FBR", goal: "See messages and FBR submissions the system sent.", href: "/integrations", steps: ["Open Integrations.", "Switch to the Outbox tab to see queued messages.", "Open an invoice's FBR payload to check the fields before submission."] },
      { title: "Read the audit trail", goal: "Find who changed what.", href: "/settings/audit", steps: ["Open Settings, Audit log.", "Search for an entity such as an invoice number.", "Every create, approve and change appears with the actor and time."] },
    ],
  },
  finance: {
    intro: "You post, reconcile and close. Everything you enter lands in the ledger as a balanced journal.",
    tasks: [
      { title: "Record a customer payment", goal: "Apply money received against invoices.", href: "/sales/payments", steps: ["Open Sales, Payments and press Record payment.", "Choose the customer, amount and method (bank, cash, cheque).", "Save. Oldest invoices are cleared first and the receivable drops."] },
      { title: "Handle a cheque", goal: "Move a post-dated cheque through deposit, clear or bounce.", href: "/sales/payments", steps: ["Open Payments and filter to cheques.", "Press Deposit when you take it to the bank.", "Press Clear when it settles, or Bounce to reopen the invoices."] },
      { title: "Pay a supplier bill", goal: "Settle bills that matched the PO and receipt.", href: "/purchasing/bills", steps: ["Open Purchasing, Supplier bills.", "Select the matched bills and press Pay.", "Choose the bank account and confirm."] },
      { title: "Reconcile the bank", goal: "Accept or reject the system's matches.", href: "/finance/reconciliation", steps: ["Open Finance, Bank reconciliation.", "Review each suggested match and its reason.", "Confirm or reject. Unmatched lines stay in the list."] },
      { title: "Run payroll", goal: "Post last month's salaries.", href: "/employees/payroll", steps: ["Open Employees, Payroll and press Run payroll.", "Pick the finished month.", "Post. Salaries, tax and EOBI go to the ledger and the net is paid from the payroll bank."] },
      { title: "Close a period", goal: "Lock a finished month.", href: "/finance/journal", steps: ["Open Finance, Journal & ledger.", "Open the periods panel and close the month.", "Posting into a closed month is now refused."] },
    ],
  },
  sales_manager: {
    intro: "You turn orders into cash and keep customers within their limits.",
    tasks: [
      { title: "Create an order", goal: "Book stock for a customer with live price, tax and credit checks.", href: "/sales/orders/new", steps: ["Open Sales, Orders, New order.", "Pick the customer, then Add product for each line.", "Watch the credit check on the right. Confirm reserves stock; Save as draft does not."] },
      { title: "Deliver an order", goal: "Pick, dispatch and invoice.", href: "/sales/orders", steps: ["Open an order and press Pick.", "Press Dispatch, choose the vehicle and driver. A challan and invoice are created.", "Mark delivered when the customer receives it."] },
      { title: "Approve a credit override", goal: "Let a blocked order through with a reason.", href: "/approvals", steps: ["Open Approvals and find the credit request.", "Check the customer's risk and overdue amount.", "Approve or reject."] },
      { title: "Work the leads", goal: "Move prospects to won.", href: "/sales/leads", steps: ["Open Sales, Leads and press New lead.", "Drag or use the stage menu to move it forward.", "A won lead can become a customer from the Customers page."] },
    ],
  },
  rep: {
    intro: "You book orders for your own customers from the road.",
    tasks: [
      { title: "Book an order", goal: "Take an order at the shop.", href: "/sales/orders/new", steps: ["Open Sales, Orders, New order. Only your customers are listed.", "Add products by carton. Free-goods schemes apply by themselves.", "Confirm if the credit check passes, otherwise save a draft and ask your manager."] },
      { title: "Send a quote", goal: "Offer prices before the order.", href: "/sales/quotes/new", steps: ["Open Quotations, New quote.", "Pick the customer and lines.", "Save and share. Convert to an order when accepted."] },
      { title: "Collect a payment", goal: "Record cash or a cheque from the customer.", href: "/sales/payments", steps: ["Open Payments and press Record payment.", "Enter the amount and method.", "Finance clears cheques later."] },
      { title: "Claim an expense", goal: "Get fuel and meals reimbursed.", href: "/expenses", steps: ["Open Expenses and press New expense.", "Enter category, merchant, amount, date and purpose.", "Submit. It goes to your manager."] },
    ],
  },
  warehouse: {
    intro: "You receive, pick, count and dispatch. The Warehouses screen works well on a phone.",
    tasks: [
      { title: "Receive goods", goal: "Book a delivery against its PO.", href: "/warehouses/receive", steps: ["Open Warehouses, Receive and choose the PO.", "Scan or type quantities. Enter rejected units separately.", "Post. Stock goes up and the PO moves to received."] },
      { title: "Pick an order", goal: "Collect confirmed orders.", href: "/warehouses/pick", steps: ["Open Warehouses, Pick.", "Open the order and tick each line as you pick it.", "Finish picking so it can be dispatched."] },
      { title: "Count stock", goal: "Fix differences between system and shelf.", href: "/warehouses/count", steps: ["Open Warehouses, Count.", "Enter the counted quantity for each product.", "Post the count. Large differences go to Finance for approval."] },
      { title: "Move stock between warehouses", goal: "Transfer without losing track.", href: "/inventory/stock", steps: ["Open Inventory, Stock position.", "Choose a product and press Transfer.", "Pick from and to warehouses and the quantity."] },
    ],
  },
  procurement: {
    intro: "You buy from principals, receive and match their bills.",
    tasks: [
      { title: "Buy what is running out", goal: "Turn a recommendation into a PO.", href: "/inventory/replenishment", steps: ["Open Inventory, Replenishment.", "Read why each item is at risk and the suggested quantity.", "Create PO. Orders above your limit go to the Owner."] },
      { title: "Create a PO by hand", goal: "Order anything not on the list.", href: "/purchasing/orders/new", steps: ["Open Purchasing, New purchase order.", "Pick the supplier and warehouse, then add lines.", "Submit. Over the limit it waits for approval."] },
      { title: "Enter a supplier bill", goal: "Three-way match bill, PO and receipt.", href: "/purchasing/bills/new", steps: ["Open Supplier bills, New bill. You can upload a photo and let AI read it.", "Check the extracted lines against the PO.", "Save. Differences are flagged for review."] },
      { title: "Chase a principal claim", goal: "Track scheme and damage claims.", href: "/purchasing/claims", steps: ["Open Purchasing, Claims.", "Update the status as it is submitted and settled."] },
    ],
  },
  employee: {
    intro: "You see your own record and can request leave and claim expenses.",
    tasks: [
      { title: "Request leave", goal: "Ask your manager for time off.", href: "/employees/leave", steps: ["Open Employees, Leave and press Request leave.", "Pick the type and dates and give a reason.", "Send. Your manager approves in Approvals."] },
      { title: "Claim an expense", goal: "Get a receipt reimbursed.", href: "/expenses", steps: ["Open Expenses, New expense.", "Fill the details and tick that you have the receipt.", "Submit and follow the status."] },
      { title: "Ask the assistant", goal: "Find your way around.", href: "/overview", steps: ["Press the Assistant button (Ctrl or Cmd plus /).", "Ask, for example, how do I request leave.", "Choose Take me there to open the screen."] },
    ],
  },
};
