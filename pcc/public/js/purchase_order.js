frappe.ui.form.on('Purchase Order', {
    onload: function (frm) {
        if (frm.is_new() && frm.doc.custom_job_record) {
            frappe.db.get_doc('Job Record', frm.doc.custom_job_record)
                .then(job => {
                    frm.clear_table('items');
                    job.items.forEach(row => {
                        frm.add_child('items', {
                            item_code: row.item,
                            item_name: row.item_name,
                            qty: row.quantity,
                            uom: row.uom,
                            // rate: row.rate,
                            schedule_date: frappe.datetime.get_today(),
                            // warehouse: 'Stores - Company'
                        });
                    });
                    frm.refresh_field('items');
                })
                .catch(err => {
                    frappe.msgprint(__('Failed to fetch Job Record'));
                    console.error(err);
                });
        }
    }
});
