import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/*
  GDPL Vendor Portal
  Purchase Order Management
  Version 1 - Manual PO Management

  Props:
    supabase       - existing Supabase client
    vendors        - existing vendors array
    mode           - "admin" or "vendor"
    vendorId       - vendor ID when mode === "vendor"
    onCreateInvoice - optional callback when vendor clicks Create Invoice
*/

const emptyItem = () => ({
  description: "",
  hsn: "",
  unit: "Nos",
  qty: 1,
  rate: 0,
  gstPct: 18,
});

const emptyForm = () => ({
  po_number: "",
  vendor_id: "",
  po_date: new Date().toISOString().slice(0, 10),
  delivery_date: "",
  payment_terms: "Net 30",
  ship_to: "",
  notes: "",
  gst_type: "CGST_SGST",
  items: [emptyItem()],
});

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const number = (value) => Number(value || 0);

const calculateItem = (item) => {
  const qty = number(item.qty);
  const rate = number(item.rate);
  const gstPct = number(item.gstPct);

  const taxable = qty * rate;
  const gst = taxable * (gstPct / 100);
  const total = taxable + gst;

  return {
    ...item,
    qty,
    rate,
    gstPct,
    taxable,
    gst,
    total,
  };
};

const calculateTotals = (items) => {
  const calculated = items.map(calculateItem);

  const subTotal = calculated.reduce(
    (sum, item) => sum + item.taxable,
    0
  );

  const totalGst = calculated.reduce(
    (sum, item) => sum + item.gst,
    0
  );

  const grandTotal = subTotal + totalGst;

  return {
    items: calculated,
    subTotal,
    totalGst,
    grandTotal,
  };
};

const getVendorName = (vendors, vendorId) => {
  const vendor = vendors.find(
    (v) => String(v.id) === String(vendorId)
  );

  return (
    vendor?.company_name ||
    vendor?.name ||
    vendor?.vendor_name ||
    "Unknown Vendor"
  );
};

const statusLabel = (status) => {
  switch (status) {
    case "draft":
      return "Draft";
    case "confirmed":
      return "Confirmed";
    case "partially_invoiced":
      return "Partially Invoiced";
    case "fully_invoiced":
      return "Fully Invoiced";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "Draft";
  }
};

const statusClass = (status) => {
  switch (status) {
    case "draft":
      return "po-status po-draft";
    case "confirmed":
      return "po-status po-confirmed";
    case "partially_invoiced":
      return "po-status po-partial";
    case "fully_invoiced":
      return "po-status po-complete";
    case "cancelled":
      return "po-status po-cancelled";
    default:
      return "po-status";
  }
};

export default function POManagement({
  supabase,
  vendors = [],
  mode = "admin",
  vendorId = null,
  onCreateInvoice,
}) {
  const isAdmin = mode === "admin";

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [selectedPO, setSelectedPO] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");

  const [form, setForm] = useState(emptyForm());

  const loadPOs = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let query = supabase
        .from("purchase_orders")
        .select("*")
        .order("po_date", { ascending: false });

      if (!isAdmin && vendorId) {
        query = query.eq("vendor_id", String(vendorId));
      }

      const { data, error } = await query;

      if (error) throw error;

      setPurchaseOrders(data || []);
    } catch (error) {
      console.error("Error loading purchase orders:", error);
      alert("Could not load purchase orders: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPOs();
  }, [supabase, vendorId, mode]);

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const vendorName = getVendorName(vendors, po.vendor_id);

      const text =
        `${po.po_number} ${vendorName} ${po.notes || ""}`.toLowerCase();

      const matchesSearch =
        !search || text.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || po.status === statusFilter;

      const matchesVendor =
        vendorFilter === "all" ||
        String(po.vendor_id) === String(vendorFilter);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesVendor
      );
    });
  }, [
    purchaseOrders,
    vendors,
    search,
    statusFilter,
    vendorFilter,
  ]);

  const totals = useMemo(() => {
    return {
      count: filteredPOs.length,
      value: filteredPOs.reduce(
        (sum, po) => sum + number(po.grand_total),
        0
      ),
      invoiced: filteredPOs.reduce(
        (sum, po) => sum + number(po.invoiced_amount),
        0
      ),
      balance: filteredPOs.reduce(
        (sum, po) => sum + number(po.balance_amount),
        0
      ),
    };
  }, [filteredPOs]);

  const generatePONumber = () => {
    const numbers = purchaseOrders
      .map((po) => {
        const match = String(po.po_number || "").match(
          /(\d+)$/
        );

        return match ? Number(match[1]) : 0;
      })
      .filter(Boolean);

    const next = Math.max(0, ...numbers) + 1;

    return `PO-${String(next).padStart(5, "0")}`;
  };

  const openNewPO = () => {
    setEditingId(null);

    setForm({
      ...emptyForm(),
      po_number: generatePONumber(),
    });

    setShowForm(true);
  };

  const openEditPO = (po) => {
    if (po.status !== "draft") {
      alert(
        "Only Draft purchase orders can be edited."
      );
      return;
    }

    const items =
      Array.isArray(po.items) && po.items.length
        ? po.items.map((item) => ({
            description: item.description || "",
            hsn: item.hsn || "",
            unit: item.unit || "Nos",
            qty: number(item.qty),
            rate: number(item.rate),
            gstPct: number(item.gstPct),
          }))
        : [emptyItem()];

    setEditingId(po.id);

    setForm({
      po_number: po.po_number || "",
      vendor_id: po.vendor_id || "",
      po_date: po.po_date || "",
      delivery_date: po.delivery_date || "",
      payment_terms: po.payment_terms || "Net 30",
      ship_to: po.ship_to || "",
      notes: po.notes || "",
      gst_type: po.gst_type || "CGST_SGST",
      items,
    });

    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }));
  };

  const addItem = () => {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        emptyItem(),
      ],
    }));
  };

  const removeItem = (index) => {
    if (form.items.length === 1) {
      return;
    }

    setForm((current) => ({
      ...current,
      items: current.items.filter(
        (_, i) => i !== index
      ),
    }));
  };

  const calculatedForm = useMemo(
    () => calculateTotals(form.items),
    [form.items]
  );

  const savePO = async (status = "draft") => {
    if (!supabase) {
      alert("Supabase client is not available.");
      return;
    }

    if (!form.po_number.trim()) {
      alert("Please enter a PO number.");
      return;
    }

    if (!form.vendor_id) {
      alert("Please select a vendor.");
      return;
    }

    if (!form.po_date) {
      alert("Please enter the PO date.");
      return;
    }

    if (!form.items.length) {
      alert("Add at least one PO item.");
      return;
    }

    for (const item of form.items) {
      if (!item.description.trim()) {
        alert("Every PO item needs a product/description.");
        return;
      }

      if (number(item.qty) <= 0) {
        alert("Quantity must be greater than zero.");
        return;
      }

      if (number(item.rate) < 0) {
        alert("Rate cannot be negative.");
        return;
      }
    }

    setSaving(true);

    try {
      const existingPO = editingId
        ? purchaseOrders.find(
            (po) => po.id === editingId
          )
        : null;

      const payload = {
        po_number: form.po_number.trim(),
        vendor_id: String(form.vendor_id),
        po_date: form.po_date,
        delivery_date:
          form.delivery_date || null,
        payment_terms:
          form.payment_terms || "Net 30",
        ship_to: form.ship_to || "",
        notes: form.notes || "",
        gst_type: form.gst_type || "CGST_SGST",

        items: calculatedForm.items.map(
          (item) => ({
            description: item.description,
            hsn: item.hsn,
            unit: item.unit,
            qty: item.qty,
            rate: item.rate,
            gstPct: item.gstPct,
            taxable: item.taxable,
            gst: item.gst,
            total: item.total,

            // Future invoice tracking
            invoicedQty:
              number(item.invoicedQty) || 0,
          })
        ),

        sub_total: calculatedForm.subTotal,
        total_gst: calculatedForm.totalGst,
        grand_total: calculatedForm.grandTotal,

        // Do not reset existing invoice amounts when editing.
        invoiced_amount:
          existingPO?.invoiced_amount || 0,

        balance_amount:
          Math.max(
            0,
            calculatedForm.grandTotal -
              number(
                existingPO?.invoiced_amount
              )
          ),

        status,
        updated_at: new Date().toISOString(),
      };

      let result;

      if (editingId) {
        result = await supabase
          .from("purchase_orders")
          .update(payload)
          .eq("id", editingId);
      } else {
        result = await supabase
          .from("purchase_orders")
          .insert(payload);
      }

      if (result.error) {
        throw result.error;
      }

      alert(
        status === "confirmed"
          ? "Purchase Order confirmed successfully."
          : "Purchase Order saved successfully."
      );

      closeForm();
      await loadPOs();
    } catch (error) {
      console.error("Error saving PO:", error);

      if (
        String(error.message || "").includes(
          "duplicate"
        )
      ) {
        alert(
          "This PO number already exists. Please use a different PO number."
        );
      } else {
        alert(
          "Could not save purchase order: " +
            error.message
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmPO = async (po) => {
    if (
      !window.confirm(
        `Confirm purchase order ${po.po_number}?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", po.id);

      if (error) throw error;

      await loadPOs();

      if (selectedPO?.id === po.id) {
        setSelectedPO({
          ...po,
          status: "confirmed",
        });
      }
    } catch (error) {
      alert(
        "Could not confirm PO: " +
          error.message
      );
    }
  };

  const deletePO = async (po) => {
    if (po.status !== "draft") {
      alert(
        "Only Draft purchase orders can be deleted."
      );
      return;
    }

    if (
      !window.confirm(
        `Delete ${po.po_number}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", po.id);

      if (error) throw error;

      setSelectedPO(null);
      await loadPOs();
    } catch (error) {
      alert(
        "Could not delete PO: " +
          error.message
      );
    }
  };

  const cancelPO = async (po) => {
    if (
      !window.confirm(
        `Cancel ${po.po_number}?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", po.id);

      if (error) throw error;

      await loadPOs();
    } catch (error) {
      alert(
        "Could not cancel PO: " +
          error.message
      );
    }
  };

  const exportPOs = () => {
    const rows = [];

    filteredPOs.forEach((po) => {
      const vendorName = getVendorName(
        vendors,
        po.vendor_id
      );

      const items = Array.isArray(po.items)
        ? po.items
        : [];

      if (!items.length) {
        rows.push({
          PO: po.po_number,
          Vendor: vendorName,
          PO_Date: po.po_date || "",
          Delivery_Date:
            po.delivery_date || "",
          Status: statusLabel(po.status),
          Product: "",
          HSN_SAC: "",
          Unit: "",
          PO_Qty: "",
          Rate: "",
          Taxable: "",
          GST_Percent: "",
          GST_Amount: "",
          Line_Total: "",
          Grand_Total: po.grand_total || 0,
          Invoiced_Amount:
            po.invoiced_amount || 0,
          Balance_Amount:
            po.balance_amount || 0,
        });

        return;
      }

      items.forEach((item) => {
        rows.push({
          PO: po.po_number,
          Vendor: vendorName,
          PO_Date: po.po_date || "",
          Delivery_Date:
            po.delivery_date || "",
          Status: statusLabel(po.status),
          Product: item.description || "",
          HSN_SAC: item.hsn || "",
          Unit: item.unit || "",
          PO_Qty: item.qty || 0,
          Rate: item.rate || 0,
          Taxable: item.taxable || 0,
          GST_Percent: item.gstPct || 0,
          GST_Amount: item.gst || 0,
          Line_Total: item.total || 0,

          // Full PO grand total repeated
          // on each product line
          Grand_Total: po.grand_total || 0,

          Invoiced_Amount:
            po.invoiced_amount || 0,
          Balance_Amount:
            po.balance_amount || 0,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Purchase Orders"
    );

    const today =
      new Date().toISOString().slice(0, 10);

    XLSX.writeFile(
      wb,
      `purchase-orders-${today}.xlsx`
    );
  };

  const renderForm = () => {
    return (
      <div className="po-overlay">
        <div className="po-modal">
          <div className="po-modal-header">
            <div>
              <h2>
                {editingId
                  ? "Edit Purchase Order"
                  : "New Purchase Order"}
              </h2>
              <div className="po-muted">
                PO rate is fixed once the PO is
                confirmed.
              </div>
            </div>

            <button
              className="po-icon-button"
              onClick={closeForm}
            >
              ×
            </button>
          </div>

          <div className="po-form-grid">
            <label>
              PO Number
              <input
                value={form.po_number}
                onChange={(e) =>
                  updateForm(
                    "po_number",
                    e.target.value
                  )
                }
                placeholder="PO-00570"
              />
            </label>

            <label>
              Vendor
              <select
                value={form.vendor_id}
                onChange={(e) =>
                  updateForm(
                    "vendor_id",
                    e.target.value
                  )
                }
              >
                <option value="">
                  Select Vendor
                </option>

                {vendors.map((vendor) => (
                  <option
                    key={vendor.id}
                    value={vendor.id}
                  >
                    {vendor.company_name ||
                      vendor.name ||
                      vendor.vendor_name ||
                      "Unnamed Vendor"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              PO Date
              <input
                type="date"
                value={form.po_date}
                onChange={(e) =>
                  updateForm(
                    "po_date",
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Delivery Date
              <input
                type="date"
                value={form.delivery_date}
                onChange={(e) =>
                  updateForm(
                    "delivery_date",
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Payment Terms
              <select
                value={form.payment_terms}
                onChange={(e) =>
                  updateForm(
                    "payment_terms",
                    e.target.value
                  )
                }
              >
                <option>Immediate</option>
                <option>Net 7</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 45</option>
                <option>Net 60</option>
              </select>
            </label>

            <label>
              GST Type
              <select
                value={form.gst_type}
                onChange={(e) =>
                  updateForm(
                    "gst_type",
                    e.target.value
                  )
                }
              >
                <option value="CGST_SGST">
                  CGST + SGST
                </option>
                <option value="IGST">
                  IGST
                </option>
              </select>
            </label>

            <label className="po-full">
              Ship To
              <input
                value={form.ship_to}
                onChange={(e) =>
                  updateForm(
                    "ship_to",
                    e.target.value
                  )
                }
                placeholder="Delivery address"
              />
            </label>

            <label className="po-full">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) =>
                  updateForm(
                    "notes",
                    e.target.value
                  )
                }
                rows={3}
                placeholder="Additional PO instructions..."
              />
            </label>
          </div>

          <div className="po-items-heading">
            <h3>PO Items</h3>

            <button
              type="button"
              className="po-secondary-button"
              onClick={addItem}
            >
              + Add Item
            </button>
          </div>

          <div className="po-table-wrap">
            <table className="po-table">
              <thead>
                <tr>
                  <th>Product / Description</th>
                  <th>HSN/SAC</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Rate ₹</th>
                  <th>GST %</th>
                  <th>Taxable ₹</th>
                  <th>Total ₹</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {form.items.map(
                  (item, index) => {
                    const calculated =
                      calculateItem(item);

                    return (
                      <tr key={index}>
                        <td>
                          <input
                            value={
                              item.description
                            }
                            onChange={(e) =>
                              updateItem(
                                index,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder="Product"
                          />
                        </td>

                        <td>
                          <input
                            value={item.hsn}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "hsn",
                                e.target.value
                              )
                            }
                            placeholder="HSN"
                          />
                        </td>

                        <td>
                          <input
                            value={item.unit}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "unit",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "qty",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "rate",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.gstPct}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "gstPct",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          ₹{" "}
                          {money(
                            calculated.taxable
                          )}
                        </td>

                        <td>
                          ₹{" "}
                          {money(
                            calculated.total
                          )}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="po-delete-item"
                            onClick={() =>
                              removeItem(index)
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          <div className="po-totals">
            <div>
              <span>Sub Total</span>
              <strong>
                ₹ {money(calculatedForm.subTotal)}
              </strong>
            </div>

            <div>
              <span>GST</span>
              <strong>
                ₹ {money(calculatedForm.totalGst)}
              </strong>
            </div>

            <div className="po-grand-total">
              <span>Grand Total</span>
              <strong>
                ₹ {money(calculatedForm.grandTotal)}
              </strong>
            </div>
          </div>

          <div className="po-modal-actions">
            <button
              className="po-secondary-button"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              className="po-secondary-button"
              onClick={() => savePO("draft")}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Draft"}
            </button>

            <button
              className="po-primary-button"
              onClick={() =>
                savePO("confirmed")
              }
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save & Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDetails = (po) => {
    const items = Array.isArray(po.items)
      ? po.items
      : [];

    return (
      <div className="po-overlay">
        <div className="po-modal po-details-modal">
          <div className="po-modal-header">
            <div>
              <h2>{po.po_number}</h2>
              <div className="po-muted">
                {getVendorName(
                  vendors,
                  po.vendor_id
                )}
              </div>
            </div>

            <button
              className="po-icon-button"
              onClick={() =>
                setSelectedPO(null)
              }
            >
              ×
            </button>
          </div>

          <div className="po-detail-grid">
            <div>
              <span>PO Date</span>
              <strong>
                {po.po_date || "-"}
              </strong>
            </div>

            <div>
              <span>Delivery Date</span>
              <strong>
                {po.delivery_date || "-"}
              </strong>
            </div>

            <div>
              <span>Payment Terms</span>
              <strong>
                {po.payment_terms || "-"}
              </strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                <span
                  className={statusClass(
                    po.status
                  )}
                >
                  {statusLabel(po.status)}
                </span>
              </strong>
            </div>

            <div className="po-detail-full">
              <span>Ship To</span>
              <strong>
                {po.ship_to || "-"}
              </strong>
            </div>
          </div>

          <div className="po-items-heading">
            <h3>Items</h3>
          </div>

          <div className="po-table-wrap">
            <table className="po-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>HSN/SAC</th>
                  <th>Unit</th>
                  <th>PO Qty</th>
                  <th>Rate</th>
                  <th>GST %</th>
                  <th>Taxable</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      {item.description}
                    </td>

                    <td>
                      {item.hsn || "-"}
                    </td>

                    <td>
                      {item.unit || "-"}
                    </td>

                    <td>
                      {item.qty}
                    </td>

                    <td>
                      ₹ {money(item.rate)}
                    </td>

                    <td>
                      {item.gstPct}%
                    </td>

                    <td>
                      ₹ {money(item.taxable)}
                    </td>

                    <td>
                      ₹ {money(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="po-totals">
            <div>
              <span>Sub Total</span>
              <strong>
                ₹ {money(po.sub_total)}
              </strong>
            </div>

            <div>
              <span>GST</span>
              <strong>
                ₹ {money(po.total_gst)}
              </strong>
            </div>

            <div>
              <span>Invoiced</span>
              <strong>
                ₹ {money(po.invoiced_amount)}
              </strong>
            </div>

            <div className="po-grand-total">
              <span>Balance</span>
              <strong>
                ₹ {money(po.balance_amount)}
              </strong>
            </div>
          </div>

          {po.notes && (
            <div className="po-notes">
              <strong>Notes</strong>
              <p>{po.notes}</p>
            </div>
          )}

          <div className="po-modal-actions">
            {isAdmin &&
              po.status === "draft" && (
                <>
                  <button
                    className="po-secondary-button"
                    onClick={() =>
                      openEditPO(po)
                    }
                  >
                    Edit
                  </button>

                  <button
                    className="po-danger-button"
                    onClick={() =>
                      deletePO(po)
                    }
                  >
                    Delete
                  </button>

                  <button
                    className="po-primary-button"
                    onClick={() =>
                      confirmPO(po)
                    }
                  >
                    Confirm PO
                  </button>
                </>
              )}

            {isAdmin &&
              po.status === "confirmed" && (
                <button
                  className="po-danger-button"
                  onClick={() =>
                    cancelPO(po)
                  }
                >
                  Cancel PO
                </button>
              )}

            {!isAdmin &&
              [
                "confirmed",
                "partially_invoiced",
              ].includes(po.status) && (
                <button
                  className="po-primary-button"
                  onClick={() => {
                    if (
                      onCreateInvoice
                    ) {
                      onCreateInvoice(po);
                    } else {
                      alert(
                        "Invoice creation will be connected to the existing invoice form next."
                      );
                    }
                  }}
                >
                  Create Invoice from PO
                </button>
              )}

            <button
              className="po-secondary-button"
              onClick={() =>
                setSelectedPO(null)
              }
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="po-page">
      <style>{`
        .po-page {
          padding: 20px;
          font-family: inherit;
        }

        .po-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }

        .po-header h1 {
          margin: 0 0 5px;
          font-size: 26px;
        }

        .po-muted {
          color: #6b7280;
          font-size: 13px;
        }

        .po-header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .po-primary-button,
        .po-secondary-button,
        .po-danger-button,
        .po-icon-button,
        .po-delete-item {
          border: 0;
          border-radius: 7px;
          padding: 9px 14px;
          cursor: pointer;
          font: inherit;
        }

        .po-primary-button {
          background: #111827;
          color: white;
        }

        .po-secondary-button {
          background: #f3f4f6;
          color: #111827;
        }

        .po-danger-button {
          background: #fee2e2;
          color: #991b1b;
        }

        .po-primary-button:disabled,
        .po-secondary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .po-icon-button {
          background: transparent;
          font-size: 25px;
          padding: 2px 8px;
        }

        .po-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .po-summary-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 16px;
        }

        .po-summary-card span {
          display: block;
          color: #6b7280;
          font-size: 12px;
          margin-bottom: 7px;
        }

        .po-summary-card strong {
          font-size: 20px;
        }

        .po-filters {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
          flex-wrap: wrap;
        }

        .po-filters input,
        .po-filters select,
        .po-form-grid input,
        .po-form-grid select,
        .po-form-grid textarea,
        .po-table input {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 8px 9px;
          font: inherit;
          width: 100%;
          box-sizing: border-box;
        }

        .po-filters input {
          min-width: 240px;
        }

        .po-table-wrap {
          overflow-x: auto;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }

        .po-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 850px;
          background: white;
        }

        .po-table th,
        .po-table td {
          border-bottom: 1px solid #e5e7eb;
          padding: 10px;
          text-align: left;
          vertical-align: middle;
        }

        .po-table th {
          background: #f9fafb;
          font-size: 12px;
          white-space: nowrap;
        }

        .po-table td {
          font-size: 13px;
        }

        .po-table input {
          min-width: 75px;
        }

        .po-po-number {
          font-weight: 700;
          color: #111827;
          cursor: pointer;
        }

        .po-status {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .po-draft {
          background: #f3f4f6;
          color: #374151;
        }

        .po-confirmed {
          background: #dcfce7;
          color: #166534;
        }

        .po-partial {
          background: #fef3c7;
          color: #92400e;
        }

        .po-complete {
          background: #dbeafe;
          color: #1e40af;
        }

        .po-cancelled {
          background: #fee2e2;
          color: #991b1b;
        }

        .po-action-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .po-small-button {
          border: 0;
          background: #f3f4f6;
          padding: 6px 9px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
        }

        .po-empty {
          padding: 50px 20px;
          text-align: center;
          color: #6b7280;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }

        .po-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          box-sizing: border-box;
        }

        .po-modal {
          background: white;
          border-radius: 12px;
          width: min(1200px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        }

        .po-details-modal {
          width: min(1100px, 100%);
        }

        .po-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .po-modal-header h2 {
          margin: 0 0 4px;
        }

        .po-form-grid {
          padding: 20px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }

        .po-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .po-full {
          grid-column: 1 / -1;
        }

        .po-items-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 20px 12px;
        }

        .po-items-heading h3 {
          margin: 0;
        }

        .po-totals {
          margin: 18px 20px;
          margin-left: auto;
          width: min(350px, calc(100% - 40px));
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .po-totals > div {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
        }

        .po-grand-total {
          border-top: 2px solid #111827;
          font-size: 17px;
          padding-top: 12px !important;
        }

        .po-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          padding: 18px 20px;
          border-top: 1px solid #e5e7eb;
        }

        .po-delete-item {
          background: #fee2e2;
          color: #991b1b;
          padding: 5px 9px;
        }

        .po-detail-grid {
          padding: 20px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
        }

        .po-detail-grid > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .po-detail-grid span {
          color: #6b7280;
          font-size: 12px;
        }

        .po-detail-grid strong {
          font-size: 14px;
        }

        .po-detail-full {
          grid-column: 1 / -1;
        }

        .po-notes {
          margin: 0 20px 20px;
          padding: 14px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .po-notes p {
          margin-bottom: 0;
        }

        @media (max-width: 900px) {
          .po-summary {
            grid-template-columns: repeat(2, 1fr);
          }

          .po-detail-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 650px) {
          .po-summary,
          .po-form-grid,
          .po-detail-grid {
            grid-template-columns: 1fr;
          }

          .po-full,
          .po-detail-full {
            grid-column: auto;
          }

          .po-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="po-header">
        <div>
          <h1>
            {isAdmin
              ? "Purchase Orders"
              : "My Purchase Orders"}
          </h1>

          <div className="po-muted">
            {isAdmin
              ? "Create and manage vendor purchase orders."
              : "View your confirmed purchase orders and create invoices against them."}
          </div>
        </div>

        <div className="po-header-actions">
          {isAdmin && (
            <button
              className="po-primary-button"
              onClick={openNewPO}
            >
              + New Purchase Order
            </button>
          )}

          <button
            className="po-secondary-button"
            onClick={exportPOs}
            disabled={!filteredPOs.length}
          >
            Export Excel
          </button>

          <button
            className="po-secondary-button"
            onClick={loadPOs}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="po-summary">
        <div className="po-summary-card">
          <span>Total POs</span>
          <strong>
            {totals.count}
          </strong>
        </div>

        <div className="po-summary-card">
          <span>PO Value</span>
          <strong>
            ₹ {money(totals.value)}
          </strong>
        </div>

        <div className="po-summary-card">
          <span>Invoiced</span>
          <strong>
            ₹ {money(totals.invoiced)}
          </strong>
        </div>

        <div className="po-summary-card">
          <span>Balance</span>
          <strong>
            ₹ {money(totals.balance)}
          </strong>
        </div>
      </div>

      <div className="po-filters">
        <input
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search PO number or vendor..."
        />

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
        >
          <option value="all">
            All Statuses
          </option>
          <option value="draft">
            Draft
          </option>
          <option value="confirmed">
            Confirmed
          </option>
          <option value="partially_invoiced">
            Partially Invoiced
          </option>
          <option value="fully_invoiced">
            Fully Invoiced
          </option>
          <option value="cancelled">
            Cancelled
          </option>
        </select>

        {isAdmin && (
          <select
            value={vendorFilter}
            onChange={(e) =>
              setVendorFilter(e.target.value)
            }
          >
            <option value="all">
              All Vendors
            </option>

            {vendors.map((vendor) => (
              <option
                key={vendor.id}
                value={vendor.id}
              >
                {vendor.company_name ||
                  vendor.name ||
                  vendor.vendor_name ||
                  "Unnamed Vendor"}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="po-empty">
          Loading purchase orders...
        </div>
      ) : filteredPOs.length === 0 ? (
        <div className="po-empty">
          <h3>
            No purchase orders found
          </h3>

          <p>
            {isAdmin
              ? "Click “New Purchase Order” to create your first PO."
              : "Confirmed purchase orders from your company will appear here."}
          </p>
        </div>
      ) : (
        <div className="po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th>PO Number</th>

                {isAdmin && (
                  <th>Vendor</th>
                )}

                <th>PO Date</th>
                <th>Delivery Date</th>
                <th>Status</th>
                <th>PO Value</th>
                <th>Invoiced</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredPOs.map((po) => (
                <tr key={po.id}>
                  <td>
                    <span
                      className="po-po-number"
                      onClick={() =>
                        setSelectedPO(po)
                      }
                    >
                      {po.po_number}
                    </span>
                  </td>

                  {isAdmin && (
                    <td>
                      {getVendorName(
                        vendors,
                        po.vendor_id
                      )}
                    </td>
                  )}

                  <td>
                    {po.po_date || "-"}
                  </td>

                  <td>
                    {po.delivery_date || "-"}
                  </td>

                  <td>
                    <span
                      className={statusClass(
                        po.status
                      )}
                    >
                      {statusLabel(
                        po.status
                      )}
                    </span>
                  </td>

                  <td>
                    ₹ {money(po.grand_total)}
                  </td>

                  <td>
                    ₹{" "}
                    {money(
                      po.invoiced_amount
                    )}
                  </td>

                  <td>
                    ₹{" "}
                    {money(
                      po.balance_amount
                    )}
                  </td>

                  <td>
                    <div className="po-action-row">
                      <button
                        className="po-small-button"
                        onClick={() =>
                          setSelectedPO(po)
                        }
                      >
                        View
                      </button>

                      {isAdmin &&
                        po.status ===
                          "draft" && (
                          <>
                            <button
                              className="po-small-button"
                              onClick={() =>
                                openEditPO(po)
                              }
                            >
                              Edit
                            </button>

                            <button
                              className="po-small-button"
                              onClick={() =>
                                confirmPO(po)
                              }
                            >
                              Confirm
                            </button>
                          </>
                        )}

                      {!isAdmin &&
                        [
                          "confirmed",
                          "partially_invoiced",
                        ].includes(
                          po.status
                        ) && (
                          <button
                            className="po-small-button"
                            onClick={() => {
                              if (
                                onCreateInvoice
                              ) {
                                onCreateInvoice(
                                  po
                                );
                              }
                            }}
                          >
                            Invoice
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && renderForm()}

      {selectedPO &&
        renderDetails(selectedPO)}
    </div>
  );
}