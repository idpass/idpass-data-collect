---
id: import-openspp-fields
title: Import OpenSPP Fields
sidebar_position: 4
---

# Import OpenSPP Fields

Before you can map form fields to OpenSPP fields, the Admin UI needs to know which fields your OpenSPP instance exposes. It fetches that list directly from the instance — there is one button to press, and which flow you get depends on the adapter you selected.

## Where this happens

Field fetching lives on the **Field Mapping** step of the program wizard, which appears only when the program's **Integration Type** is OpenSPP V1 or OpenSPP v2. The connection details are entered one step earlier, on **Integration**; the Field Mapping step reuses them and does not ask again.

So the order is always:

1. **Integration** step — choose the adapter, enter the API URL and credentials.
2. **Entity Forms** step — design the forms whose fields you want to map.
3. **Field Mapping** step — fetch the OpenSPP field list, then map field to field.

## OpenSPP V1

The Field Mapping step shows an **OpenSPP V1 Fields** section with a **Fetch Fields** button and a read-only summary of what it will connect to (URL, database, username).

It needs all four of these from the Integration step: **API URL**, **Database Name**, **Username**, and **Password**. Until they are all present the button stays disabled and the step tells you to complete the connection settings first.

Click **Fetch Fields** and the loaded field count is reported back to you.

## OpenSPP v2

For V2 the section is **OpenSPP V2 Fields**, with **Fetch Fields** — which becomes **Refresh Fields** once a list is loaded, alongside **Clear** to discard it.

It needs the **API URL** plus the **OAuth Client ID** and **OAuth Client Secret** from the Integration step. Those same credentials power the Integration step's **Test Connection** button, which is worth using first: it confirms the credentials independently of field fetching.

Once fetched, the fields are summarised as counts — total, core, Studio, individual, and group — with the time of the last refresh, and listed in two expandable tables, **Individual Fields** and **Group Fields**, showing each field's name, label, type, and source.

## Mapping fields

With the field list loaded, build the mapping table with **Add Mapping**. Each row pairs one form field with one OpenSPP field and applies a transformer:

| Transformer | What it does | Options |
|-------------|--------------|---------|
| **Text** | Pass-through or string conversion (the default) | — |
| **Date** | Converts between date formats | **Input Format**, **Output Format** |
| **ID** | Extracts the ID from an OpenSPP relation value shaped like `{"id": 0, "display_name": ""}` | — |
| **Multi-select** | Joins and splits array values | **Delimiter** |
| **Boolean** | Normalises checkbox values | **Truthy Value**, **Falsy Value** |

Counters above the table show how many form fields, OpenSPP fields, and mappings you currently have. Mappings are saved with the rest of the program configuration when you finish the wizard.

## Troubleshooting

**The Fetch Fields button is disabled.** A required connection setting is missing. Go back to the **Integration** step and complete it — URL, database, username, and password for V1; URL, client ID, and client secret for V2.

**Fetching fails.** Confirm the server can reach the OpenSPP URL, and that the credentials are valid. For V2, use **Test Connection** on the Integration step to separate an authentication problem from a field-fetching one. For V1, check that the account may call Odoo's field-introspection API.

**The Field Mapping step isn't in the wizard.** It only appears for OpenSPP adapters. Other adapters do not use field mappings, and the step is skipped entirely.

**No form fields to map.** The form-field side of the mapping is read from your designed forms, so complete the **Entity Forms** step first.

## Related Documentation

- [Admin UI Dashboard](./admin-ui-dashboard.md)
- [OpenSPP Adapter](/adapters/openspp-adapter)
- [External Sync Configuration](/configuration/external-sync)
