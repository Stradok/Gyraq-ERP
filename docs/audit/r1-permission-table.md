# R1 permission table (proposal, needs your approval)

Covers all 50 commands in `frontend/src/lib/engine/commands.ts`. Default-deny: the API will refuse any command not listed here. Roles: owner, admin, finance, sales_manager, rep, warehouse, procurement, employee. **Owner and Admin can always do what a listed role can; "(same)" means the roles named in the row above.**

| Command | API check today | Proposed permission | Roles allowed | Scope |
|---|---|---|---|---|
| `CreateCustomer` | `master.create` | `master.create` | owner, admin, sales_manager, procurement, finance | all |
| `CreateSupplier` | `master.create` | `master.create` | (same) | all |
| `CreateProduct` | `master.create` | `master.create` | (same) | all |
| `CreateLead` | `master.create` | `lead.manage` | owner, admin, sales_manager, rep | rep: own |
| `MoveLead` | **none** | `lead.manage` | (same) | rep: own |
| `CreateQuote` | **none** | `order.create` | owner, admin, sales_manager, rep | rep: own customers |
| `SetQuoteStatus` | **none** | `order.create` | (same) | rep: own customers |
| `RequestCreditLimit` | **none** | `order.create` | (same) | rep: own customers |
| `RequestCreditHold` | **none** | `order.create` | (same) | rep: own customers |
| `ReleaseCreditHold` | **none** | `approve.credit` | owner, admin, sales_manager, finance | all |
| `CreateOrder` | `order.create` | `order.create` | owner, admin, sales_manager, rep | rep: own customers |
| `RequestCreditOverride` | **none** | `order.create` | (same) | rep: own customers |
| `ConfirmOrder` | **none** | `order.create` | (same) | rep: own customers |
| `CancelOrder` | **none** | `order.create` | (same) | rep: own customers |
| `PickOrder` | `warehouse.ops` | `warehouse.ops` | owner, admin, warehouse, sales_manager | all (no warehouse link on users yet) |
| `DispatchOrder` | `warehouse.ops` | `warehouse.ops` | (same) | all |
| `MarkDelivered` | **none** | `warehouse.ops` | (same) | all |
| `RecordPayment` | `payment.record` | `payment.record` | owner, admin, finance, sales_manager, rep | rep: own customers |
| `DepositCheque` | **none** | `cash.manage` | owner, admin, finance | all |
| `ClearCheque` | **none** | `cash.manage` | (same) | all |
| `BounceCheque` | **none** | `cash.manage` | (same) | all |
| `DepositCash` | **none** | `cash.manage` | (same) | all |
| `CreateReturn` | `return.create` | `return.create` | owner, admin, sales_manager, finance, warehouse | all |
| `SetClaimStatus` | **none** | `bill.create` | owner, admin, finance, procurement | all |
| `CreatePO` | `po.create` | `po.create` | owner, admin, procurement | all |
| `ReceiveGoods` | `po.receive` | `po.receive` | owner, admin, warehouse, procurement | all |
| `CreateBill` | `bill.create` | `bill.create` | owner, admin, finance, procurement | all |
| `ResolveBill` | **none** | `approve.finance` | owner, admin, finance | all |
| `PaySupplier` | `supplier.pay` | `supplier.pay` | owner, admin, finance | all |
| `TransferStock` | `warehouse.ops` | `warehouse.ops` | owner, admin, warehouse, sales_manager | all |
| `AdjustStock` | `stock.adjust` | `stock.adjust` | owner, admin, warehouse, finance | all |
| `PostCount` | `warehouse.ops` | `warehouse.ops` | (as above) | all |
| `PostManualJE` | **none** | `journal.post` | owner, finance | all |
| `UpdateSettings` | `period.close` | `settings.manage` | owner, admin | all |
| `ClosePeriod` | `period.close` | `period.close` | owner, finance | all |
| `ReopenPeriod` | `period.close` | `period.reopen` | owner only | all |
| `DecideApproval` | **none** | `(engine: by approval type)` | as today; employee and rep denied | own requests cannot be self-approved |
| `SubmitExpense` | **none** | `self.requests` | every role | own: employee = the signed-in user |
| `SubmitLeave` | **none** | `self.requests` | every role | own: employee = the signed-in user |
| `CreateEmployee` | `hr.manage` | `hr.manage` | owner, admin, finance | all |
| `UpdateEmployee` | `hr.manage` | `hr.manage` | (same) | all |
| `RunPayroll` | `hr.manage` | `hr.manage` | (same) | all |
| `SetupCompany` | **none** | `setup.manage` | owner, admin | all |
| `CreateWarehouse` | **none** | `setup.manage` | (same) | all |
| `PostOpeningStock` | **none** | `setup.manage` | (same) | all |
| `PostOpeningCash` | **none** | `setup.manage` | (same) | all |
| `ConfirmBankMatch` | **none** | `cash.manage` | (same) | all |
| `SetRule` | **none** | `setup.manage` | (same) | all |
| `QueueMessage` | **none** | `message.send` | owner, admin, finance, sales_manager | all |
| `CreateRule` | **none** | `setup.manage` | (same) | all |

## New permissions this adds
- `lead.manage`, `cash.manage` (cheques, cash deposits, bank matching), `journal.post` (manual journals), `period.reopen` (owner only), `settings.manage` (policy limits and tax rates), `message.send`, `self.requests` (own leave and expenses).
- Today `UpdateSettings` and `ReopenPeriod` ride on `period.close` (owner and finance). Proposed: settings owner and admin only; reopening a closed period owner only.

## Scope rules (new server-side enforcement)
1. **rep:** may act only on customers where `customer.repId` is their own employee record (orders, quotes, payments, leads, credit requests). Today only the UI filters this.
2. **employee / everyone:** `SubmitLeave` and `SubmitExpense` ignore the `employeeId` in the payload and use the signed-in user's employee record. HR roles may file for others.
3. **No self-approval:** `DecideApproval` refuses when the approver is the requester.
4. Warehouse-level scoping (a warehouse manager limited to their own warehouse) is **not** included: users have no warehouse link yet. Proposed for R4 with branches.

## What changes for existing behaviour
Commands newly restricted at the API (previously any signed-in user could call them): 28 listed as **none** above. Anyone currently relying on the demo personas keeps working because the personas map to the same roles; the public browser demo is unaffected (it has no server).

## Questions
1. Approve the table as written, or list changes (for example should `finance` also be allowed `MoveLead`, should `admin` post manual journals?).
2. Approve the scope rules, especially "rep only own customers" and "no self-approval".
