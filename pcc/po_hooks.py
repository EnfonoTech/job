

import frappe
from pcc.api import update_percent_purchased

def update_job_record_percent(doc, method):
    if doc.get("custom_job_record"):
        update_percent_purchased(doc.custom_job_record)
