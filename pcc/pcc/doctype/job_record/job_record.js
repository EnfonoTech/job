// Copyright (c) 2025, siva@enfono.in and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Record", {
    onload: function (frm) {
        if (frm.is_new() && frm.doc.quotation) {
            frappe.db.get_doc("Quotation", frm.doc.quotation)
                .then(quotation => {
                    if (quotation.quotation_to === "Customer") {
                        frm.set_value("customer", quotation.party_name);
                    }
                    frm.clear_table("items");
                    (quotation.items || []).forEach(q_item => {
                        let item_row = frm.add_child("items");
                        item_row.item = q_item.item_code;
                        item_row.item_name = q_item.item_name;
                        item_row.uom = q_item.uom;
                        item_row.quantity = q_item.qty;
                        item_row.rate = q_item.rate;
                        item_row.amount = q_item.amount;

                    });
                    frm.refresh_field("items");
                    frm.events.update_totals(frm);
                });
        }
    },
    refresh: function (frm) {
        frm.events.set_dashboard_indicators(frm);

        if (!frm.is_new()) {
            // First check if "Expense Entry" doctype exists
            frappe.model.with_doctype("Expense Entry", function() {
                // Doctype exists, proceed with API call
                frappe.call({
                    method: "pcc.api.get_expense_entries_for_job",
                    args: {
                        job_record_id: frm.doc.name
                    },
                    callback: function(r) {
                        if (r.message) {
                            let total_expenses = 0;
                            frm.clear_table("expenses");
                            r.message.forEach(function(row) {
                                let child = frm.add_child("expenses");
                                child.reference_doctype = row.reference_doctype;
                                child.reference_record = row.reference_record;
                                child.amount = row.amount;
                                total_expenses += row.amount;
                            });
                            frm.refresh_field("expenses");
                            frm.set_value("total_expense", total_expenses)

                            setTimeout(function() {
                                frm.doc.__unsaved = 0;
                                frm.page.clear_indicator();
                            }, 100);
                        }
                    }
                });
            }, function() {
                // Doctype does not exist
                frappe.msgprint(__('Expense Entry is not available on this site.'));
            });
        }
    },

    set_dashboard_indicators: function (frm) {
        function process_invoices(invoices, includeOutstanding = false) {
            var totals = { grandTotal: 0, outstandingTotal: 0 };
            if (invoices && invoices.length > 0) {
                invoices.forEach(function (invoice) {
                    totals.grandTotal += invoice.base_grand_total;
                    if (includeOutstanding) {
                        totals.outstandingTotal += invoice.outstanding_amount;
                    }
                });
            }
            return totals;
        }

        function process_journal_entries(entries) {
            var totalDebit = 0;
            if (entries && entries.length > 0) {
                entries.forEach(function (entry) {
                    totalDebit += entry.total_debit;
                });
            }
            return totalDebit;
        }

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: {
                    custom_job_record: frm.doc.name,
                    docstatus: 1
                },
                fields: ['base_grand_total', 'outstanding_amount']
            },
            callback: function (response) {
                var salesInvoiceTotals = process_invoices(response.message, true);

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Purchase Invoice',
                        filters: {
                            custom_job_record: frm.doc.name,
                            docstatus: 1
                        },
                        fields: ['base_grand_total', 'outstanding_amount']
                    },
                    callback: function (response) {
                        var purchaseInvoiceTotals = process_invoices(response.message, true);

                        frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'Journal Entry',
                                filters: {
                                    custom_job_record: frm.doc.name,
                                    docstatus: 1
                                },
                                fields: ['total_debit']
                            },
                            callback: function (response) {
                                var journalEntryTotalDebit = process_journal_entries(response.message);

                                var totalExpenses = purchaseInvoiceTotals.grandTotal + journalEntryTotalDebit;
                                var profitAndLoss = salesInvoiceTotals.grandTotal - totalExpenses;

                                frm.dashboard.add_indicator(
                                    __('Total Sales Invoice: {0}', [format_currency(salesInvoiceTotals.grandTotal, frm.doc.currency)]),
                                    'blue'
                                );
                                frm.dashboard.add_indicator(
                                    __('Total Purchase Invoice: {0}', [format_currency(purchaseInvoiceTotals.grandTotal, frm.doc.currency)]),
                                    'orange'
                                );
                                frm.dashboard.add_indicator(
                                    __('Total Journal Entries: {0}', [format_currency(journalEntryTotalDebit, frm.doc.currency)]),
                                    'purple'
                                );
                                frm.dashboard.add_indicator(
                                    __('P&L: {0}', [format_currency(profitAndLoss, frm.doc.currency)]),
                                    profitAndLoss >= 0 ? 'green' : 'red'
                                );
                            }
                        });
                    }
                });
            }
        });
    },

    update_totals: function (frm) {
        let total_qty = 0;
        let total_amt = 0;

        frm.doc.items.forEach(row => {
            total_qty += flt(row.quantity);
            total_amt += flt(row.amount);
        });

        frm.set_value('total_quantity', total_qty);
        frm.set_value('total_amount', total_amt);
    },
});


frappe.ui.form.on('Job Item Detail', {
    item: async function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.item) return;
        frappe.model.set_value(cdt, cdn, 'quantity', 1);

        try {
            let r = await frappe.db.get_value('Item Price', {
                item_code: row.item,
                price_list: 'Standard Selling'
            }, 'price_list_rate');

            if (r && r.message) {
                frappe.model.set_value(cdt, cdn, 'rate', r.message.price_list_rate);
                frappe.model.set_value(cdt, cdn, 'amount', r.message.price_list_rate * row.quantity);
            } else {
                frappe.model.set_value(cdt, cdn, 'rate', 0);
                frappe.msgprint(__('No Standard Selling price found for item {0}', [row.item]));
            }
        } catch (err) {
            console.error('Error fetching price:', err);
            frappe.msgprint(__('Error fetching price for item {0}', [row.item]));
        }

        frm.events.update_totals(frm);
    },

    quantity: function (frm, cdt, cdn) {
        row = locals[cdt][cdn];

        if (row.quantity && row.rate) {
            frappe.model.set_value(cdt, cdn, "amount", row.quantity * row.rate)
        }

        frm.events.update_totals(frm);
        
    },

    rate: function (frm, cdt, cdn) {
        row = locals[cdt][cdn];

        if (row.quantity && row.rate) {
            frappe.model.set_value(cdt, cdn, "amount", row.quantity * row.rate)
        }

        frm.events.update_totals(frm);
        
    },

    items_remove: function (frm) {
        frm.events.update_totals(frm);
    }
});

