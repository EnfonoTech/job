// Copyright (c) 2025, siva@enfono.in and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Record", {
    refresh: function (frm) {
        frm.events.set_dashboard_indicators(frm);
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
    }
});


frappe.ui.form.on('Job Item Detail', {
    item: async function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.item) return;

        try {
            let r = await frappe.db.get_value('Item Price', {
                item_code: row.item,
                price_list: 'Standard Selling'
            }, 'price_list_rate');

            if (r && r.message) {
                frappe.model.set_value(cdt, cdn, 'rate', r.message.price_list_rate);
            } else {
                frappe.model.set_value(cdt, cdn, 'rate', 0);
                frappe.msgprint(__('No Standard Selling price found for item {0}', [row.item]));
            }
        } catch (err) {
            console.error('Error fetching price:', err);
            frappe.msgprint(__('Error fetching price for item {0}', [row.item]));
        }
    }
});

