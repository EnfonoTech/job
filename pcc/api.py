import frappe
from frappe import _
from frappe import utils

"""
TODO

Permissions 
- Settings Checbox - Employee can create Expenses
- Add Employee User Permission
Report

More Features - v2
- Alert Approvers - manual - for pending / draft
- Tax Templates
- Separate Request Document
   - Add approved amount on expense entry - auto filled from requested amount but changeable
- Rename App. Expense Voucher vs Expense Entry
- Tests

- Fix
    - Prevent Making JE's before submission / non-approvers

- Add dependant fields
    - Workflow entries
    - JV type: Expense Entry
    - JV Account Reference Type: Expense Entry
    - Mode of Payment: Petty Cash


DONE
  - Issues Fixed
    - Wire Transfer requires reference date, and minor improvements
    - Approver field vanishing
  
  - Print Format improvements - (Not done: Add signatures)
  - Prevent duplicate entry - done
  - Workflow: Pending Approval, Approved (set-approved by)
  - Creation of JV
  - expense refs
  - Roles:
    - Expense Approver
  - Set authorising party

  Add sections to EE and EE Items
    Section: Accounting Dimensions
    - Project
    - Cost Center

  - Add settings fields to Accounts Settings
    Section: Expense Settings
    - Link: Default Payment Account (Link: Mode of Payment) 
      - Desc: Create a Mode of Payment for expenses and link it to your usual expenditure account like Petty Cash
    - Checkbox: Notify all Approvers
      - Desc: when a expense request is made
    - Checkbox: Create Journals Automatically

Add all the fixtures to the app so that it is fully portable
a. Workflows
b. Accounts Settings Fields
c. Fix minor issues
   - Cant set custom print format as default - without customisation

Enhancements
- Added Cost Center Filters
"""


def setup(expense_request, method):
    # add expenses up and set the total field
    # add default project and cost center to expense items

    total = 0
    count = 0
    expense_items = []

    
    for detail in expense_request.expenses:
        total += float(detail.amount)        
        count += 1
        
        if not detail.project and expense_request.default_project:
            detail.project = expense_request.default_project
        
        if not detail.cost_center and expense_request.default_cost_center:
            detail.cost_center = expense_request.default_cost_center

        expense_items.append(detail)

    expense_request.expenses = expense_items

    expense_request.total = total
    expense_request.quantity = count

    make_journal_entry(expense_request)

    


@frappe.whitelist()
def initialise_journal_entry(expense_request_name):
    # make JE from javascript form Make JE button

    make_journal_entry(
        frappe.get_doc('Expense Request', expense_request_name)
    )


def make_journal_entry(expense_request):

    if expense_request.status == "Approved":         

        # check for duplicates
        
        if frappe.db.exists({'doctype': 'Journal Entry', 'bill_no': expense_request.name}):
            frappe.throw(
                title="Error",
                msg="Journal Entry {} already exists.".format(expense_request.name)
            )


        # Preparing the JE: convert expense_request details into je account details

        accounts = []

        for detail in expense_request.expenses:            

            accounts.append({  
                'debit_in_account_currency': float(detail.amount),
                'user_remark': str(detail.description),
                'account': detail.expense_account,
                'project': detail.project,
                'cost_center': detail.cost_center
            })

        # finally add the payment account detail

        pay_account = ""

        if (expense_request.mode_of_payment != "Cash" and (not 
            expense_request.payment_reference or not expense_request.clearance_date)):
            frappe.throw(
                title="Enter Payment Reference",
                msg="Payment Reference and Date are Required for all non-cash payments."
            )
        else:
            expense_request.clearance_date = ""
            expense_request.payment_reference = ""


        pay_account = frappe.db.get_value('Mode of Payment Account', {'parent' : expense_request.mode_of_payment, 'company' : expense_request.company}, 'default_account')
        if not pay_account or pay_account == "":
            frappe.throw(
                title="Error",
                msg="The selected Mode of Payment has no linked account."
            )

        accounts.append({  
            'credit_in_account_currency': float(expense_request.total),
            'user_remark': str(detail.description),
            'account': pay_account,
            'cost_center': expense_request.default_cost_center
        })

        # create the journal entry
        je = frappe.get_doc({
            'title': expense_request.name,
            'doctype': 'Journal Entry',
            'voucher_type': 'Journal Entry',
            'posting_date': expense_request.posting_date,
            'company': expense_request.company,
            'custom_vehicle': expense_request.vehicle,
            'custom_apartment': expense_request.apartment,
            'accounts': accounts,
            'user_remark': expense_request.remarks,
            'mode_of_payment': expense_request.mode_of_payment,
            'cheque_date': expense_request.clearance_date,
            'reference_date': expense_request.clearance_date,
            'cheque_no': expense_request.payment_reference,
            'pay_to_recd_from': expense_request.payment_to,
            'bill_no': expense_request.name
        })

        user = frappe.get_doc("User", frappe.session.user)

        full_name = str(user.first_name) + ' ' + str(user.last_name)
        expense_request.db_set('approved_by', full_name)
        

        je.insert()
        je.submit()