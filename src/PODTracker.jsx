import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "–";

const qty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const uuid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `pod-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* -------------------------------------------------------
   INVOICE ITEM PARSER
   Handles:
   - normal arrays
   - JSON strings
   - objects containing items
   - product/name/description variations
------------------------------------------------------- */

const parseItems = (value) => {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    if (Array.isArray(value.items)) return value.items;

    return Object.entries(value).map(([name, v]) => ({
      product_name: name,
      quantity:
        typeof v === "object"
          ? v?.quantity ?? v?.qty ?? 0
          : Number(v) || 0,
    }));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) return parsed;

      if (parsed && Array.isArray(parsed.items)) {
        return parsed.items;
      }

      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed).map(([name, v]) => ({
          product_name: name,
          quantity:
            typeof v === "object"
              ? v?.quantity ?? v?.qty ?? 0
              : Number(v) || 0,
        }));
      }
    } catch {
      return [];
    }
  }

  return [];
};

const productName = (x) => {
  if (typeof x === "string") return x;

  if (x?.product && typeof x.product === "object") {
    return String(
      x.product.product_name ||
        x.product.name ||
        x.product.description ||
        "Item"
    ).trim();
  }

  return String(
    x?.product_name ??
      x?.productName ??
      x?.description ??
      x?.name ??
      x?.title ??
      x?.product ??
      "Item"
  ).trim();
};

const productQty = (x) =>
  qty(
    x?.quantity ??
      x?.qty ??
      x?.ordered_qty ??
      x?.order_qty ??
      x?.units ??
      0
  );

const normalizeProducts = (value) => {
  const source = parseItems(value);
  const map = new Map();

  source.forEach((item) => {
    const name = productName(item);
    const quantity = productQty(item);

    if (!name) return;

    map.set(name, (map.get(name) || 0) + quantity);
  });

  return Array.from(map.entries()).map(([product_name, quantity]) => ({
    product_name,
    quantity,
  }));
};

/* -------------------------------------------------------
   STYLES
------------------------------------------------------- */

const styles = {
  page: {
    background: "#f8fafc",
    minHeight: "100%",
    color: "#1f2937",
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    marginBottom: 16,
  },

  input: {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    boxSizing: "border-box",
    background: "#fff",
  },

  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    marginBottom: 5,
  },

  btn: {
    padding: "8px 13px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },

  primary: {
    background: "#2563eb",
    color: "#fff",
    borderColor: "#2563eb",
  },

  danger: {
    background: "#dc2626",
    color: "#fff",
    borderColor: "#dc2626",
  },
};

const Field = ({ label, children }) => (
  <div>
    <label style={styles.label}>{label}</label>
    {children}
  </div>
);

const Pill = ({ children, tone = "gray" }) => {
  const map = {
    gray: ["#f1f5f9", "#475569"],
    blue: ["#dbeafe", "#1d4ed8"],
    green: ["#dcfce7", "#166534"],
    amber: ["#fef3c7", "#92400e"],
    red: ["#fee2e2", "#991b1b"],
  };

  const [bg, color] = map[tone] || map.gray;

  return (
    <span
      style={{
        background: bg,
        color,
        padding: "3px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
};

/* -------------------------------------------------------
   EMPTY DELIVERY
------------------------------------------------------- */

const emptyDelivery = (products = []) => ({
  id: uuid(),
  delivery_sequence: 1,

  location_label: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  contact_name: "",
  contact_phone: "",

  delivery_arranged_by: "vendor",

  courier_name: "",
  awb_number: "",
  shipping_date: "",
  expected_delivery_date: "",
  delivery_date: "",
  delivery_status: "not_shipped",

  notes: "",

  podFile: null,
  has_pod: false,

  items: products.map((x) => ({
    product_name: x.product_name,
    quantity: 0,
  })),
});

/* -------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------- */

export default function PODTracker({
  supabase,
  mode = "admin",
  vendorId = null,
  vendors = [],
}) {
  const isAdmin = mode === "admin";

  const [invoices, setInvoices] = useState([]);
  const [pods, setPods] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [vendorRows, setVendorRows] = useState([]);

  const [savedAddresses, setSavedAddresses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [vendorEditing, setVendorEditing] = useState(null);
  const [vendorFile, setVendorFile] = useState(null);

  const [form, setForm] = useState({
    sales_date: today(),
    sales_order_number: "",
    sales_invoice_number: "",
    client_name: "",
    is_locked: false,
    deliveries: [],
  });

  /* -----------------------------------------------------
     VENDOR NAME
  ----------------------------------------------------- */

  const vendorName = (id) =>
    vendors.find((v) => String(v.id) === String(id))?.company_name ||
    vendors.find((v) => String(v.id) === String(id))?.name ||
    id ||
    "–";

  /* -----------------------------------------------------
     LOAD SAVED UNIVERSAL ADDRESSES
  ----------------------------------------------------- */

  const loadSavedAddresses = async () => {
    if (!supabase) return;

    const { data, error: addressError } = await supabase
      .from("saved_addresses")
      .select("*")
      .is("vendor_id", null)
      .eq("is_active", true)
      .order("label", { ascending: true });

    if (addressError) {
      console.warn(
        "Could not load universal saved addresses:",
        addressError.message
      );
      return;
    }

    setSavedAddresses(data || []);
  };

  /* -----------------------------------------------------
     LOAD DATA
  ----------------------------------------------------- */

  const load = async () => {
    if (!supabase) return;

    setLoading(true);
    setError("");

    try {
      if (isAdmin) {
        const [a, b, c, d] = await Promise.all([
          supabase
            .from("invoices")
            .select("*")
            .order("created_at", { ascending: false }),

          supabase
            .from("pod_trackers")
            .select("*")
            .order("created_at", { ascending: false }),

          supabase
            .from("pod_deliveries")
            .select("*")
            .order("delivery_sequence", { ascending: true }),

          supabase
            .from("pod_delivery_items")
            .select("*"),
        ]);

        if (a.error) throw a.error;
        if (b.error) throw b.error;
        if (c.error) throw c.error;
        if (d.error) throw d.error;

        setInvoices(a.data || []);
        setPods(b.data || []);
        setDeliveries(c.data || []);
        setDeliveryItems(d.data || []);

        await loadSavedAddresses();
      } else {
        const r = await supabase
          .from("pod_vendor_delivery")
          .select("*")
          .eq("vendor_id", String(vendorId))
          .order("created_at", { ascending: false });

        if (r.error) throw r.error;

        setVendorRows(r.data || []);
      }
    } catch (e) {
      setError(e.message || "Unable to load POD Tracker.");
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [mode, vendorId]);

  /* -----------------------------------------------------
     NORMALIZED INVOICE PRODUCTS
  ----------------------------------------------------- */

  const invoiceProducts = useMemo(() => {
    const inv = invoices.find(
      (i) => String(i.id) === String(selectedInvoice)
    );

    return normalizeProducts(inv?.items);
  }, [invoices, selectedInvoice]);

  /* -----------------------------------------------------
     ADMIN POD ROWS
  ----------------------------------------------------- */

  const rows = useMemo(() => {
    return pods.map((p) => {
      const inv = invoices.find(
        (i) => String(i.id) === String(p.vendor_invoice_id)
      );

      const ds = deliveries.filter(
        (d) => String(d.pod_id) === String(p.id)
      );

      return {
        ...p,
        invoice: inv,

        delivery_count: ds.length,

        delivered_count: ds.filter(
          (d) => d.delivery_status === "delivered"
        ).length,

        vendor_name: vendorName(p.vendor_id),

        deliveries: ds.map((d) => ({
          ...d,
          items: deliveryItems.filter(
            (x) => String(x.delivery_id) === String(d.id)
          ),
        })),
      };
    });
  }, [pods, deliveries, deliveryItems, invoices, vendors]);

  /* -----------------------------------------------------
     OVERALL STATUS BASED ON QUANTITY + ACTUAL DELIVERY
  ----------------------------------------------------- */

  const allocationFor = (p) => {
    const products = normalizeProducts(p.items);

    return products.map((x) => {
      const allocated = (p.deliveries || []).reduce(
        (sum, d) =>
          sum +
          qty(
            d.items?.find(
              (i) => i.product_name === x.product_name
            )?.quantity
          ),
        0
      );

      return {
        name: x.product_name,
        total: x.quantity,
        allocated,
        balance: x.quantity - allocated,
      };
    });
  };

  const statusForPod = (p) => {
    const ds = p.deliveries || [];
    const allocation = allocationFor(p);

    if (!allocation.length) return "not_started";

    const totalAllocated = allocation.reduce(
      (sum, x) => sum + x.allocated,
      0
    );

    if (totalAllocated <= 0) {
      return "not_started";
    }

    const fullyAllocated = allocation.every(
      (x) => x.balance <= 0
    );

    const allDelivered =
      ds.length > 0 &&
      ds.every(
        (d) => d.delivery_status === "delivered"
      );

    if (fullyAllocated && allDelivered) {
      return "fully_delivered";
    }

    if (fullyAllocated) {
      return "fully_allocated";
    }

    return "partially_allocated";
  };

  /* -----------------------------------------------------
     FILTERED ROWS
  ----------------------------------------------------- */

  const filtered = useMemo(() => {
    const source = isAdmin ? rows : vendorRows;

    const q = search.trim().toLowerCase();

    return source.filter((r) => {
      const text = [
        r.sales_invoice_number,
        r.sales_order_number,
        r.client_name,
        r.vendor_invoice_number,
        r.po_number,
        r.vendor_name,
        r.location_label,
        r.city,
        r.courier_name,
        r.awb_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !text.includes(q)) return false;

      if (!filterStatus || filterStatus === "all") {
        return true;
      }

      if (isAdmin) {
        return statusForPod(r) === filterStatus;
      }

      return (
        (r.delivery_status || "not_shipped") ===
        filterStatus
      );
    });
  }, [
    rows,
    vendorRows,
    search,
    filterStatus,
    isAdmin,
  ]);

  /* -----------------------------------------------------
     RESET / NEW TRACKER
  ----------------------------------------------------- */

  const reset = () => {
    setEditing(null);
    setSelectedInvoice("");

    setForm({
      sales_date: today(),
      sales_order_number: "",
      sales_invoice_number: "",
      client_name: "",
      is_locked: false,
      deliveries: [],
    });

    setError("");
    setMessage("");
  };

  /* -----------------------------------------------------
     SELECT INVOICE
  ----------------------------------------------------- */

  const selectInvoice = (id) => {
    setSelectedInvoice(id);
    setError("");

    const inv = invoices.find(
      (i) => String(i.id) === String(id)
    );

    if (!inv) {
      setForm((f) => ({
        ...f,
        deliveries: [],
      }));
      return;
    }

    const products = normalizeProducts(inv.items);

    setForm((f) => ({
      ...f,
      sales_date:
        f.sales_date ||
        inv.invoice_date ||
        today(),

      deliveries: [
        emptyDelivery(products),
      ],
    }));
  };

  /* -----------------------------------------------------
     QUANTITY ALLOCATION
  ----------------------------------------------------- */

  const allocation = useMemo(() => {
    return invoiceProducts.map((product, index) => {
      const allocated = form.deliveries.reduce(
        (sum, d) =>
          sum +
          qty(
            d.items?.find(
              (it) =>
                it.product_name ===
                product.product_name
            )?.quantity
          ),
        0
      );

      return {
        key: `${product.product_name}-${index}`,
        name: product.product_name,
        total: product.quantity,
        allocated,
        balance: product.quantity - allocated,
      };
    });
  }, [invoiceProducts, form.deliveries]);

  /* -----------------------------------------------------
     UPDATE DELIVERY
  ----------------------------------------------------- */

  const updateDelivery = (idx, patch) => {
    setForm((f) => ({
      ...f,
      deliveries: f.deliveries.map((d, i) =>
        i === idx
          ? {
              ...d,
              ...patch,
            }
          : d
      ),
    }));
  };

  /* -----------------------------------------------------
     APPLY SAVED ADDRESS
  ----------------------------------------------------- */

  const applySavedAddress = (idx, addressId) => {
    const a = savedAddresses.find(
      (x) => String(x.id) === String(addressId)
    );

    if (!a) return;

    updateDelivery(idx, {
      location_label: a.label || "",
      address: a.address || "",
      city: a.city || "",
      state: a.state || "Maharashtra",
      pincode: a.pincode || "",
      contact_name: a.contact_name || "",
      contact_phone: a.contact_phone || "",
    });
  };

  /* -----------------------------------------------------
     ADD DELIVERY
  ----------------------------------------------------- */

  const addDelivery = () => {
    if (!selectedInvoice) {
      setError("Select the vendor invoice first.");
      return;
    }

    setForm((f) => ({
      ...f,

      deliveries: [
        ...f.deliveries,

        {
          ...emptyDelivery(invoiceProducts),
          delivery_sequence:
            f.deliveries.length + 1,
        },
      ],
    }));
  };

  /* -----------------------------------------------------
     UPLOAD POD
  ----------------------------------------------------- */

  const uploadPOD = async (
    deliveryId,
    file,
    visibility
  ) => {
    if (!file) return null;

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const path = `${visibility}/${deliveryId}/${Date.now()}-${safeName}`;

    const upload = await supabase.storage
      .from("pod-documents")
      .upload(path, file, {
        upsert: false,
      });

    if (upload.error) {
      throw upload.error;
    }

    const doc = await supabase
      .from("pod_documents")
      .insert({
        delivery_id: deliveryId,
        visibility,
        file_path: path,
        file_name: file.name,
        document_type: "POD",
      })
      .select()
      .single();

    if (doc.error) {
      throw doc.error;
    }

    return doc.data;
  };

  /* -----------------------------------------------------
     REFRESH VENDOR MIRROR
  ----------------------------------------------------- */

  const refreshVendorMirror = async (podId) => {
    const ds = await supabase
      .from("pod_deliveries")
      .select("*")
      .eq("pod_id", podId)
      .eq("delivery_arranged_by", "vendor");

    if (ds.error) throw ds.error;

    await supabase
      .from("pod_vendor_delivery")
      .delete()
      .eq("pod_id", podId);

    const p = await supabase
      .from("pod_trackers")
      .select(
        "vendor_id,vendor_invoice_id,vendor_invoice_number,vendor_invoice_date,po_number"
      )
      .eq("id", podId)
      .single();

    if (p.error) throw p.error;

    for (const d of ds.data || []) {
      const items = await supabase
        .from("pod_delivery_items")
        .select("*")
        .eq("delivery_id", d.id);

      if (items.error) throw items.error;

      const r = await supabase
        .from("pod_vendor_delivery")
        .insert({
          delivery_id: d.id,
          pod_id: podId,

          vendor_id: String(
            p.data.vendor_id
          ),

          vendor_invoice_id: String(
            p.data.vendor_invoice_id
          ),

          vendor_invoice_number:
            p.data.vendor_invoice_number,

          vendor_invoice_date:
            p.data.vendor_invoice_date,

          po_number: p.data.po_number,

          items: items.data || [],

          location_label: d.location_label,
          address: d.address,
          city: d.city,
          state: d.state,
          pincode: d.pincode,

          contact_name: d.contact_name,
          contact_phone: d.contact_phone,

          courier_name: d.courier_name,
          awb_number: d.awb_number,

          shipping_date:
            d.shipping_date,

          expected_delivery_date:
            d.expected_delivery_date,

          delivery_date:
            d.delivery_date,

          delivery_status:
            d.delivery_status,

          notes: d.notes,

          is_locked: d.is_locked,
          has_pod: d.has_pod,
        });

      if (r.error) throw r.error;
    }
  };

  /* -----------------------------------------------------
     SAVE ADMIN TRACKER
  ----------------------------------------------------- */

  const saveAdmin = async () => {
    setError("");
    setMessage("");

    const inv = invoices.find(
      (i) => String(i.id) === String(selectedInvoice)
    );

    if (!inv) {
      setError(
        "Select the vendor invoice first."
      );
      return;
    }

    if (!form.sales_date) {
      setError("Sales Date is required.");
      return;
    }

    if (!form.client_name.trim()) {
      setError("Client Name is required.");
      return;
    }

    if (
      !form.sales_order_number.trim() &&
      !form.sales_invoice_number.trim()
    ) {
      setError(
        "Enter a Sales Order Number or Sales Invoice Number."
      );
      return;
    }

    if (!form.deliveries.length) {
      setError("Add at least one delivery.");
      return;
    }

    /* ---------------------------------------------
       Validate locations
    --------------------------------------------- */

    for (let i = 0; i < form.deliveries.length; i++) {
      const d = form.deliveries[i];

      if (!d.location_label.trim()) {
        setError(
          `Enter a Location / Label for Delivery #${
            i + 1
          }.`
        );
        return;
      }
    }

    /* ---------------------------------------------
       Validate quantity
    --------------------------------------------- */

    for (const a of allocation) {
      if (a.allocated > a.total) {
        setError(
          `${a.name}: delivery quantity (${a.allocated}) exceeds invoice quantity (${a.total}).`
        );
        return;
      }
    }

    /* ---------------------------------------------
       DUPLICATE CHECK
       Only applies when creating a NEW tracker.
    --------------------------------------------- */

    if (!editing) {
      const duplicate = pods.find(
        (p) =>
          String(p.vendor_invoice_id) ===
          String(inv.id)
      );

      if (duplicate) {
        setError(
          `Vendor Invoice ${
            inv.invoice_number || inv.id
          } already has a POD Tracker. Please edit the existing tracker instead.`
        );
        return;
      }

      /* Re-check directly from Supabase in case
         another tab created the tracker. */
      const existing = await supabase
        .from("pod_trackers")
        .select("id,vendor_invoice_number")
        .eq(
          "vendor_invoice_id",
          String(inv.id)
        )
        .limit(1);

      if (existing.error) {
        setError(existing.error.message);
        return;
      }

      if (existing.data?.length) {
        setError(
          `Vendor Invoice ${
            inv.invoice_number || inv.id
          } already has a POD Tracker.`
        );
        await load();
        return;
      }
    }

    setSaving(true);

    try {
      const normalizedItems =
        normalizeProducts(inv.items);

      const payload = {
        vendor_invoice_id: String(inv.id),

        po_id: inv.po_id || null,

        vendor_id:
          inv.vendor_id != null
            ? String(inv.vendor_id)
            : null,

        vendor_invoice_number:
          inv.invoice_number ||
          inv.id,

        vendor_invoice_date:
          inv.invoice_date || null,

        po_number:
          inv.po_number ||
          inv.po_number_ref ||
          null,

        items: normalizedItems,

        sales_date: form.sales_date,

        sales_order_number:
          form.sales_order_number.trim() ||
          null,

        sales_invoice_number:
          form.sales_invoice_number.trim() ||
          null,

        client_name:
          form.client_name.trim(),

        is_locked:
          !!form.is_locked,

        locked_at:
          form.is_locked
            ? new Date().toISOString()
            : null,
      };

      let pod;

      if (editing) {
        const result = await supabase
          .from("pod_trackers")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();

        if (result.error)
          throw result.error;

        pod = result.data;

        /* Remove existing delivery rows.
           Cascade removes their item rows. */
        const oldDocs = await supabase
          .from("pod_deliveries")
          .select("id")
          .eq("pod_id", pod.id);

        if (oldDocs.error)
          throw oldDocs.error;

        for (const oldDelivery of
          oldDocs.data || []) {
          await supabase
            .from("pod_documents")
            .delete()
            .eq(
              "delivery_id",
              oldDelivery.id
            );
        }

        const del = await supabase
          .from("pod_deliveries")
          .delete()
          .eq("pod_id", pod.id);

        if (del.error) throw del.error;
      } else {
        const result = await supabase
          .from("pod_trackers")
          .insert(payload)
          .select()
          .single();

        if (result.error)
          throw result.error;

        pod = result.data;
      }

      /* ---------------------------------------------
         SAVE EACH DELIVERY
      --------------------------------------------- */

      for (
        let i = 0;
        i < form.deliveries.length;
        i++
      ) {
        const d = form.deliveries[i];

        const deliveryPayload = {
          id: d.id,

          pod_id: pod.id,

          delivery_sequence: i + 1,

          location_label:
            d.location_label || null,

          address:
            d.address || null,

          city:
            d.city || null,

          state:
            d.state || null,

          pincode:
            d.pincode || null,

          contact_name:
            d.contact_name || null,

          contact_phone:
            d.contact_phone || null,

          delivery_arranged_by:
            d.delivery_arranged_by ||
            "vendor",

          /* IMPORTANT:
             Admin controls logistics for BOTH
             vendor-arranged and admin-arranged. */
          courier_name:
            d.courier_name || null,

          awb_number:
            d.awb_number || null,

          shipping_date:
            d.shipping_date || null,

          expected_delivery_date:
            d.expected_delivery_date ||
            null,

          delivery_date:
            d.delivery_date || null,

          delivery_status:
            d.delivery_status ||
            "not_shipped",

          notes:
            d.notes || null,

          has_pod:
            !!d.has_pod,

          is_locked:
            !!form.is_locked,
        };

        const dr = await supabase
          .from("pod_deliveries")
          .insert(deliveryPayload)
          .select()
          .single();

        if (dr.error)
          throw dr.error;

        const realDeliveryId =
          dr.data.id;

        /* -----------------------------------------
           DELIVERY ITEMS
        ----------------------------------------- */

        for (const item of d.items || []) {
          const quantity =
            qty(item.quantity);

          if (quantity <= 0) continue;

          const ir = await supabase
            .from("pod_delivery_items")
            .insert({
              delivery_id:
                realDeliveryId,

              product_name:
                item.product_name,

              quantity,
            });

          if (ir.error)
            throw ir.error;
        }

        /* -----------------------------------------
           POD FILE
           Vendor-arranged delivery:
             vendor can see POD.
           Admin-arranged delivery:
             vendor must not see POD.
        ----------------------------------------- */

        if (d.podFile) {
          const visibility =
            d.delivery_arranged_by ===
            "vendor"
              ? "vendor"
              : "admin";

          await uploadPOD(
            realDeliveryId,
            d.podFile,
            visibility
          );

          const hr = await supabase
            .from("pod_deliveries")
            .update({
              has_pod: true,
            })
            .eq(
              "id",
              realDeliveryId
            );

          if (hr.error)
            throw hr.error;
        }
      }

      /* ---------------------------------------------
         REFRESH VENDOR MIRROR
      --------------------------------------------- */

      await refreshVendorMirror(
        pod.id
      );

      setMessage(
        editing
          ? "POD tracker updated successfully."
          : "POD tracker created successfully."
      );

      reset();

      await load();
    } catch (e) {
      setError(
        e.message ||
          "Unable to save POD tracker."
      );
    }

    setSaving(false);
  };

  /* -----------------------------------------------------
     OPEN EXISTING ADMIN TRACKER
  ----------------------------------------------------- */

  const openAdmin = async (row) => {
    setError("");
    setMessage("");

    setEditing(row);

    setSelectedInvoice(
      String(row.vendor_invoice_id)
    );

    const inv = invoices.find(
      (i) =>
        String(i.id) ===
        String(row.vendor_invoice_id)
    );

    const products =
      normalizeProducts(inv?.items);

    const loaded = [];

    for (const d of row.deliveries || []) {
      const ir = await supabase
        .from("pod_delivery_items")
        .select("*")
        .eq("delivery_id", d.id);

      if (ir.error) {
        setError(ir.error.message);
        return;
      }

      const itemMap = new Map(
        (ir.data || []).map((x) => [
          x.product_name,
          qty(x.quantity),
        ])
      );

      loaded.push({
        ...d,

        podFile: null,

        items: products.map((p) => ({
          product_name:
            p.product_name,

          quantity:
            itemMap.get(
              p.product_name
            ) || 0,
        })),
      });
    }

    setForm({
      sales_date:
        row.sales_date ||
        inv?.invoice_date ||
        today(),

      sales_order_number:
        row.sales_order_number ||
        "",

      sales_invoice_number:
        row.sales_invoice_number ||
        "",

      client_name:
        row.client_name || "",

      is_locked:
        !!row.is_locked,

      deliveries: loaded,
    });
  };

  /* -----------------------------------------------------
     DELETE TRACKER
  ----------------------------------------------------- */

  const deleteTracker = async (row) => {
    if (!row?.id) return;

    const invoiceNumber =
      row.vendor_invoice_number ||
      row.vendor_invoice_id;

    const confirmed =
      window.confirm(
        `Delete POD Tracker for Vendor Invoice "${invoiceNumber}"?\n\nThis will delete the tracker, all delivery records, delivery quantities and POD document references.\n\nThis action cannot be undone.`
      );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      /* ---------------------------------------------
         Get deliveries
      --------------------------------------------- */

      const ds = await supabase
        .from("pod_deliveries")
        .select("id")
        .eq("pod_id", row.id);

      if (ds.error)
        throw ds.error;

      const deliveryIds =
        (ds.data || []).map(
          (d) => d.id
        );

      /* ---------------------------------------------
         Delete POD document DB records + storage
      --------------------------------------------- */

      for (const deliveryId of
        deliveryIds) {
        const docs =
          await supabase
            .from("pod_documents")
            .select(
              "id,file_path"
            )
            .eq(
              "delivery_id",
              deliveryId
            );

        if (!docs.error) {
          const paths =
            (docs.data || [])
              .map(
                (x) => x.file_path
              )
              .filter(Boolean);

          if (paths.length) {
            await supabase.storage
              .from("pod-documents")
              .remove(paths);
          }

          await supabase
            .from("pod_documents")
            .delete()
            .eq(
              "delivery_id",
              deliveryId
            );
        }
      }

      /* ---------------------------------------------
         Delete vendor mirror
      --------------------------------------------- */

      await supabase
        .from("pod_vendor_delivery")
        .delete()
        .eq(
          "pod_id",
          row.id
        );

      /* ---------------------------------------------
         Delete tracker
         Delivery/item tables should cascade if
         schema has ON DELETE CASCADE.
      --------------------------------------------- */

      const result = await supabase
        .from("pod_trackers")
        .delete()
        .eq("id", row.id)
        .select();

      if (result.error)
        throw result.error;

      reset();

      setMessage(
        `POD Tracker for ${invoiceNumber} was deleted.`
      );

      await load();
    } catch (e) {
      setError(
        e.message ||
          "Unable to delete POD tracker."
      );
    }

    setSaving(false);
  };

  /* -----------------------------------------------------
     VENDOR SAVE
  ----------------------------------------------------- */

  const saveVendor = async () => {
    if (
      !vendorEditing ||
      vendorEditing.is_locked
    ) {
      setError(
        "This delivery has been locked by Admin."
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const p = {
        courier_name:
          vendorEditing.courier_name ||
          null,

        awb_number:
          vendorEditing.awb_number ||
          null,

        shipping_date:
          vendorEditing.shipping_date ||
          null,

        expected_delivery_date:
          vendorEditing.expected_delivery_date ||
          null,

        delivery_date:
          vendorEditing.delivery_date ||
          null,

        delivery_status:
          vendorEditing.delivery_status ||
          "not_shipped",

        notes:
          vendorEditing.notes ||
          null,

        updated_at:
          new Date().toISOString(),
      };

      const r = await supabase
        .from("pod_deliveries")
        .update(p)
        .eq(
          "id",
          vendorEditing.delivery_id
        )
        .eq(
          "is_locked",
          false
        )
        .select()
        .single();

      if (r.error)
        throw r.error;

      if (vendorFile) {
        await uploadPOD(
          vendorEditing.delivery_id,
          vendorFile,
          "vendor"
        );

        await supabase
          .from("pod_deliveries")
          .update({
            has_pod: true,
          })
          .eq(
            "id",
            vendorEditing.delivery_id
          );
      }

      await refreshVendorMirror(
        vendorEditing.pod_id
      );

      setVendorEditing(null);
      setVendorFile(null);

      setMessage(
        "Delivery details updated."
      );

      await load();
    } catch (e) {
      setError(
        e.message ||
          "Unable to update delivery details."
      );
    }

    setSaving(false);
  };

  /* -----------------------------------------------------
     DOWNLOAD POD
  ----------------------------------------------------- */

  const downloadPOD = async (
    deliveryId
  ) => {
    const r = await supabase
      .from("pod_documents")
      .select("*")
      .eq(
        "delivery_id",
        deliveryId
      )
      .order("uploaded_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (r.error || !r.data) {
      setError(
        "No POD document found."
      );
      return;
    }

    const u =
      await supabase.storage
        .from("pod-documents")
        .createSignedUrl(
          r.data.file_path,
          300
        );

    if (u.error) {
      setError(u.error.message);
    } else {
      window.open(
        u.data.signedUrl,
        "_blank"
      );
    }
  };

  const viewPOD = async deliveryId => {
    setError("");
  
    const r = await supabase
      .from("pod_documents")
      .select("*")
      .eq("delivery_id", deliveryId)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  
    if (r.error) {
      setError(r.error.message);
      return;
    }
  
    if (!r.data) {
      setError("No POD document found.");
      return;
    }
  
    const u = await supabase.storage
      .from("pod-documents")
      .createSignedUrl(r.data.file_path, 600);
  
    if (u.error) {
      setError(u.error.message);
      return;
    }
  
    window.open(u.data.signedUrl, "_blank");
  };

  /* -----------------------------------------------------
     EXPORT EXCEL
  ----------------------------------------------------- */

  const exportExcel = () => {
    const out = [];

    rows.forEach((p) => {
      (p.deliveries || []).forEach(
        (d) => {
          (d.items || []).forEach(
            (it) => {
              out.push({
                Sales_Date:
                  p.sales_date || "",

                Sales_Order_Number:
                  p.sales_order_number ||
                  "",

                Sales_Invoice_Number:
                  p.sales_invoice_number ||
                  "",

                Client_Name:
                  p.client_name || "",

                Vendor:
                  p.vendor_name || "",

                Vendor_Invoice_Number:
                  p.vendor_invoice_number ||
                  "",

                Vendor_Invoice_Date:
                  p.vendor_invoice_date ||
                  "",

                Vendor_PO_Number:
                  p.po_number || "",

                Delivery_No:
                  d.delivery_sequence,

                Delivery_Location:
                  d.location_label || "",

                Address:
                  d.address || "",

                City:
                  d.city || "",

                State:
                  d.state || "",

                Pincode:
                  d.pincode || "",

                Contact_Name:
                  d.contact_name || "",

                Contact_Phone:
                  d.contact_phone || "",

                Product:
                  it.product_name,

                Quantity:
                  it.quantity,

                Delivery_Arranged_By:
                  d.delivery_arranged_by,

                Courier:
                  d.courier_name || "",

                AWB:
                  d.awb_number || "",

                Shipping_Date:
                  d.shipping_date || "",

                Expected_Delivery:
                  d.expected_delivery_date ||
                  "",

                Actual_Delivery:
                  d.delivery_date || "",

                Delivery_Status:
                  d.delivery_status || "",

                POD:
                  d.has_pod
                    ? "Yes"
                    : "No",
              });
            }
          );
        }
      );
    });

    const ws =
      XLSX.utils.json_to_sheet(out);

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "POD Tracker"
    );

    XLSX.writeFile(
      wb,
      `pod-tracker-${today()}.xlsx`
    );
  };

  const invoice = invoices.find(
    (i) =>
      String(i.id) ===
      String(selectedInvoice)
  );

  /* -----------------------------------------------------
     USED INVOICE IDS
  ----------------------------------------------------- */

  const usedInvoiceIds = useMemo(
    () =>
      new Set(
        pods.map((p) =>
          String(p.vendor_invoice_id)
        )
      ),
    [pods]
  );

  /* -----------------------------------------------------
     RENDER
  ----------------------------------------------------- */

  return (
    <div style={styles.page}>
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              margin: "0 0 4px",
              fontWeight: 800,
            }}
          >
            {isAdmin
              ? "POD Tracker"
              : "Delivery & POD"}
          </h1>

          <div
            style={{
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {isAdmin
              ? "Track one vendor invoice across multiple client deliveries, quantities, logistics and PODs."
              : "Update only vendor-arranged deliveries assigned to your company."}
          </div>
        </div>

        {isAdmin && (
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <button
              style={styles.btn}
              onClick={exportExcel}
            >
              ⬇ Export POD Tracker
            </button>

            <button
              style={{
                ...styles.btn,
                ...styles.primary,
              }}
              onClick={reset}
            >
              ＋ New Tracker
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES */}

      {message && (
        <div
          style={{
            padding: 10,
            background: "#dcfce7",
            color: "#166534",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 10,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* =================================================
          VENDOR VIEW
      ================================================= */}

      {!isAdmin && (
        <div style={styles.card}>
          <div
            style={{
              padding: 14,
              borderBottom:
                "1px solid #f1f5f9",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              style={{
                ...styles.input,
                maxWidth: 360,
              }}
              placeholder="Search vendor invoice, PO, location, AWB…"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

            <select
              style={{
                ...styles.input,
                maxWidth: 180,
              }}
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(
                  e.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              <option value="not_shipped">
                Not shipped
              </option>

              <option value="shipped">
                Shipped
              </option>

              <option value="in_transit">
                In transit
              </option>

              <option value="delivered">
                Delivered
              </option>
            </select>
          </div>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Vendor Invoice",
                    "PO",
                    "Delivery",
                    "Location",
                    "Qty / Products",
                    "Courier",
                    "AWB",
                    "Status",
                    "POD",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding:
                          "9px 12px",
                        textAlign:
                          "left",
                        background:
                          "#f8fafc",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={
                      r.delivery_id
                    }
                    style={{
                      borderBottom:
                        "1px solid #f1f5f9",
                    }}
                  >
                    <td
                      style={{
                        padding: 9,
                        fontWeight: 700,
                      }}
                    >
                      {
                        r.vendor_invoice_number
                      }
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {r.po_number || "–"}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      #
                      {
                        r.delivery_sequence
                      }
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {r.location_label ||
                        r.city ||
                        "–"}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {(r.items || [])
                        .map(
                          (x) =>
                            `${x.product_name} × ${x.quantity}`
                        )
                        .join(", ")}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {r.courier_name ||
                        "–"}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {r.awb_number ||
                        "–"}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      <Pill
                        tone={
                          r.delivery_status ===
                          "delivered"
                            ? "green"
                            : "amber"
                        }
                      >
                        {r.delivery_status ||
                          "not_shipped"}
                      </Pill>

                      {r.is_locked &&
                        " 🔒"}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      {r.has_pod ? (
                        <button
                          style={{
                            ...styles.btn,
                            padding:
                              "4px 8px",
                          }}
                          onClick={() =>
                            downloadPOD(
                              r.delivery_id
                            )
                          }
                        >
                          View
                        </button>
                      ) : (
                        "–"
                      )}
                    </td>

                    <td
                      style={{
                        padding: 9,
                      }}
                    >
                      <button
                        style={{
                          ...styles.btn,
                          padding:
                            "4px 9px",
                        }}
                        disabled={
                          r.is_locked
                        }
                        onClick={() => {
                          setVendorEditing(
                            {
                              ...r,
                            }
                          );
                          setVendorFile(
                            null
                          );
                        }}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filtered.length &&
              !loading && (
                <div
                  style={{
                    padding: 35,
                    textAlign:
                      "center",
                    color:
                      "#94a3b8",
                  }}
                >
                  No vendor-arranged
                  deliveries found.
                </div>
              )}
          </div>
        </div>
      )}

      {/* =================================================
          ADMIN LIST
      ================================================= */}

      {isAdmin && (
        <div style={styles.card}>
          <div
            style={{
              padding: 14,
              borderBottom:
                "1px solid #f1f5f9",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              style={{
                ...styles.input,
                maxWidth: 380,
              }}
              placeholder="Search sales order/invoice, client, vendor…"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

            <select
              style={{
                ...styles.input,
                maxWidth: 210,
              }}
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(
                  e.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              <option value="not_started">
                Not Delivered
              </option>

              <option value="partially_allocated">
                Partially Allocated
              </option>

              <option value="fully_allocated">
                Fully Allocated
              </option>

              <option value="fully_delivered">
                Fully Delivered
              </option>
            </select>
          </div>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Vendor Invoice",
                    "Sales Order",
                    "Sales Invoice",
                    "Client",
                    "Deliveries",
                    "Status",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding:
                          "9px 12px",
                        textAlign:
                          "left",
                        background:
                          "#f8fafc",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => {
                  const st =
                    statusForPod(r);

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom:
                          "1px solid #f1f5f9",
                      }}
                    >
                      <td
                        style={{
                          padding: 9,
                          fontWeight: 700,
                        }}
                      >
                        {
                          r.vendor_invoice_number
                        }
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        {r.sales_order_number ||
                          "–"}
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        {r.sales_invoice_number ||
                          "–"}
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        {r.client_name}
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        {r.delivery_count}
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        <Pill
                          tone={
                            st ===
                            "fully_delivered"
                              ? "green"
                              : st ===
                                "fully_allocated"
                              ? "blue"
                              : st ===
                                "partially_allocated"
                              ? "amber"
                              : "gray"
                          }
                        >
                          {st ===
                          "fully_delivered"
                            ? "Fully Delivered"
                            : st ===
                              "fully_allocated"
                            ? "Fully Allocated"
                            : st ===
                              "partially_allocated"
                            ? "Partially Allocated"
                            : "Not Delivered"}
                        </Pill>

                        {r.is_locked &&
                          " 🔒"}
                      </td>

                      <td
                        style={{
                          padding: 9,
                          display: "flex",
                          gap: 6,
                        }}
                      >
                        <button
                          style={{
                            ...styles.btn,
                            padding:
                              "4px 9px",
                          }}
                          onClick={() =>
                            openAdmin(r)
                          }
                        >
                          Edit
                        </button>

                        <button
                          style={{
                            ...styles.btn,
                            ...styles.danger,
                            padding:
                              "4px 9px",
                          }}
                          disabled={
                            saving
                          }
                          onClick={() =>
                            deleteTracker(
                              r
                            )
                          }
                        >
                          Delete
                        </button>

{/* ADD POD BUTTON HERE */}

{(r.deliveries || [])
  .filter(d => d.has_pod)
  .map((d, i) => (
    <button
      key={d.id || i}
      style={{
        ...styles.btn,
        padding: "4px 9px",
        background: "#ecfdf5",
        borderColor: "#86efac",
        color: "#166534",
      }}
      onClick={() =>
        viewPOD(d.id)
      }
    >
      📄 POD #{d.delivery_sequence || i + 1}
    </button>
  ))}

                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filtered.length &&
              !loading && (
                <div
                  style={{
                    padding: 35,
                    textAlign:
                      "center",
                    color:
                      "#94a3b8",
                  }}
                >
                  No POD trackers yet.
                </div>
              )}
          </div>
        </div>
      )}

      {/* =================================================
          ADMIN FORM
      ================================================= */}

      {isAdmin && (
        <div style={styles.card}>
          <div
            style={{
              padding:
                "12px 16px",
              borderBottom:
                "1px solid #f1f5f9",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
            }}
          >
            <b>
              {editing
                ? "Edit POD Tracker"
                : "New POD Tracker"}
            </b>

            <button
              style={styles.btn}
              onClick={reset}
            >
              Close
            </button>
          </div>

          <div
            style={{
              padding: 16,
            }}
          >
            {/* -----------------------------------------
                INVOICE SELECTION
            ----------------------------------------- */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3,1fr)",
                gap: 12,
              }}
            >
              <Field label="Vendor Invoice *">
                <select
                  style={styles.input}
                  value={
                    selectedInvoice
                  }
                  disabled={
                    !!editing
                  }
                  onChange={(e) =>
                    selectInvoice(
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select vendor invoice
                  </option>

                  {invoices.map((i) => {
                    const used =
                      usedInvoiceIds.has(
                        String(i.id)
                      );

                    const current =
                      editing &&
                      String(
                        editing.vendor_invoice_id
                      ) ===
                        String(i.id);

                    const label =
                      i.invoice_number ||
                      i.id;

                    return (
                      <option
                        key={i.id}
                        value={i.id}
                        disabled={
                          used &&
                          !current
                        }
                      >
                        {label} —{" "}
                        {vendorName(
                          i.vendor_id
                        )}
                        {used &&
                        !current
                          ? " — Already Tracked"
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="Vendor">
                <input
                  style={{
                    ...styles.input,
                    background:
                      "#f8fafc",
                  }}
                  readOnly
                  value={
                    invoice
                      ? vendorName(
                          invoice.vendor_id
                        )
                      : ""
                  }
                />
              </Field>

              <Field label="Vendor Invoice Date">
                <input
                  style={{
                    ...styles.input,
                    background:
                      "#f8fafc",
                  }}
                  readOnly
                  value={
                    invoice?.invoice_date ||
                    ""
                  }
                />
              </Field>
            </div>

            {/* -----------------------------------------
                INVOICE PRODUCTS
            ----------------------------------------- */}

            {invoice && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background:
                    "#f8fafc",
                  borderRadius: 9,
                }}
              >
                <b
                  style={{
                    fontSize: 13,
                  }}
                >
                  Vendor Invoice
                  Quantities
                </b>

                {!invoiceProducts.length ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      background:
                        "#fee2e2",
                      color:
                        "#991b1b",
                      borderRadius: 7,
                      fontSize: 12,
                    }}
                  >
                    No product
                    lines could be
                    read from this
                    invoice.
                  </div>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse:
                        "collapse",
                      fontSize: 12,
                      marginTop: 7,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign:
                              "left",
                            padding: 6,
                          }}
                        >
                          Product
                        </th>

                        <th
                          style={{
                            textAlign:
                              "right",
                            padding: 6,
                          }}
                        >
                          Invoice Qty
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {invoiceProducts.map(
                        (x, i) => (
                          <tr
                            key={`${x.product_name}-${i}`}
                          >
                            <td
                              style={{
                                padding: 6,
                              }}
                            >
                              {
                                x.product_name
                              }
                            </td>

                            <td
                              style={{
                                padding: 6,
                                textAlign:
                                  "right",
                                fontWeight:
                                  700,
                              }}
                            >
                              {x.quantity}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* -----------------------------------------
                SALES REFERENCE
            ----------------------------------------- */}

            <h3
              style={{
                fontSize: 14,
                margin:
                  "20px 0 10px",
              }}
            >
              Sales Reference —
              Admin Only
            </h3>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(4,1fr)",
                gap: 12,
              }}
            >
              <Field label="Sales Date *">
                <input
                  type="date"
                  style={styles.input}
                  value={
                    form.sales_date
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sales_date:
                        e.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Sales Order Number">
                <input
                  style={styles.input}
                  value={
                    form.sales_order_number
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sales_order_number:
                        e.target.value,
                    }))
                  }
                  placeholder="Client PO / Sales Order"
                />
              </Field>

              <Field label="Sales Invoice Number">
                <input
                  style={styles.input}
                  value={
                    form.sales_invoice_number
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sales_invoice_number:
                        e.target.value,
                    }))
                  }
                  placeholder="Can be added later"
                />
              </Field>

              <Field label="Client Name *">
                <input
                  style={styles.input}
                  value={
                    form.client_name
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      client_name:
                        e.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div
              style={{
                fontSize: 11,
                color: "#64748b",
                marginTop: 7,
              }}
            >
              Sales Invoice Number
              can be added later.
              Sales Order Number
              is sufficient to create
              the tracker.
            </div>

            {/* -----------------------------------------
                QUANTITY RECONCILIATION
            ----------------------------------------- */}

            <h3
              style={{
                fontSize: 14,
                margin:
                  "20px 0 10px",
              }}
            >
              Quantity
              Reconciliation
            </h3>

            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Product",
                    "Invoice Qty",
                    "Allocated",
                    "Balance",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign:
                          h ===
                          "Product"
                            ? "left"
                            : "right",
                        padding: 7,
                        background:
                          "#f8fafc",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {allocation.map(
                  (a) => (
                    <tr
                      key={a.key}
                    >
                      <td
                        style={{
                          padding: 7,
                        }}
                      >
                        {a.name}
                      </td>

                      <td
                        style={{
                          padding: 7,
                          textAlign:
                            "right",
                        }}
                      >
                        {a.total}
                      </td>

                      <td
                        style={{
                          padding: 7,
                          textAlign:
                            "right",
                        }}
                      >
                        {a.allocated}
                      </td>

                      <td
                        style={{
                          padding: 7,
                          textAlign:
                            "right",
                          fontWeight:
                            700,
                          color:
                            a.balance <
                            0
                              ? "#dc2626"
                              : a.balance ===
                                0
                              ? "#16a34a"
                              : "#d97706",
                        }}
                      >
                        {a.balance}
                      </td>

                      <td
                        style={{
                          padding: 7,
                          textAlign:
                            "right",
                        }}
                      >
                        {a.balance < 0 ? (
                          <Pill tone="red">
                            Exceeded
                          </Pill>
                        ) : a.balance ===
                          0 ? (
                          <Pill tone="green">
                            Fully Allocated
                          </Pill>
                        ) : a.allocated >
                          0 ? (
                          <Pill tone="amber">
                            Partial
                          </Pill>
                        ) : (
                          <Pill>
                            Not Allocated
                          </Pill>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {/* -----------------------------------------
                DELIVERIES
            ----------------------------------------- */}

            {form.deliveries.map(
              (d, idx) => (
                <div
                  key={d.id}
                  style={{
                    border:
                      "1px solid #dbeafe",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 12,
                    background:
                      "#fcfdff",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      marginBottom:
                        10,
                    }}
                  >
                    <b>
                      Delivery #
                      {idx + 1}
                    </b>

                    {form.deliveries
                      .length > 1 && (
                      <button
                        style={
                          styles.btn
                        }
                        onClick={() =>
                          setForm(
                            (f) => ({
                              ...f,
                              deliveries:
                                f.deliveries
                                  .filter(
                                    (
                                      _,
                                      i
                                    ) =>
                                      i !==
                                      idx
                                  )
                                  .map(
                                    (
                                      x,
                                      i
                                    ) => ({
                                      ...x,
                                      delivery_sequence:
                                        i +
                                        1,
                                    })
                                  ),
                            })
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* -----------------------------------
                      SAVED ADDRESS
                  ----------------------------------- */}

                  <div
                    style={{
                      marginBottom: 12,
                      padding: 10,
                      background:
                        "#eff6ff",
                      borderRadius: 8,
                    }}
                  >
                    <Field label="Use Saved Ship To Address">
                      <select
                        style={
                          styles.input
                        }
                        value=""
                        onChange={(e) =>
                          applySavedAddress(
                            idx,
                            e.target.value
                          )
                        }
                      >
                        <option value="">
                          Select a saved address…
                        </option>

                        {savedAddresses.map(
                          (a) => (
                            <option
                              key={a.id}
                              value={a.id}
                            >
                              {a.label}
                              {a.city
                                ? ` — ${a.city}`
                                : ""}
                            </option>
                          )
                        )}
                      </select>
                    </Field>

                    {!savedAddresses.length && (
                      <div
                        style={{
                          fontSize: 11,
                          color:
                            "#64748b",
                          marginTop: 6,
                        }}
                      >
                        No universal
                        saved Ship To
                        addresses found.
                        You can still
                        enter the
                        address manually.
                      </div>
                    )}
                  </div>

                  {/* -----------------------------------
                      ADDRESS
                  ----------------------------------- */}

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(3,1fr)",
                      gap: 10,
                    }}
                  >
                    <Field label="Location / Label *">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.location_label
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              location_label:
                                e.target
                                  .value,
                            }
                          )
                        }
                        placeholder="Mumbai Site / Client Office"
                      />
                    </Field>

                    <Field label="Address">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.address
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              address:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="City">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.city
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              city:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="State">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.state
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              state:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="Pincode">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.pincode
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              pincode:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="Contact Name">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.contact_name
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              contact_name:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="Contact Phone">
                      <input
                        style={
                          styles.input
                        }
                        value={
                          d.contact_phone
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              contact_phone:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </Field>

                    <Field label="Delivery Arranged By">
                      <select
                        style={
                          styles.input
                        }
                        value={
                          d.delivery_arranged_by
                        }
                        onChange={(e) =>
                          updateDelivery(
                            idx,
                            {
                              delivery_arranged_by:
                                e.target
                                  .value,
                            }
                          )
                        }
                      >
                        <option value="vendor">
                          Vendor
                        </option>

                        <option value="admin">
                          Admin
                        </option>
                      </select>
                    </Field>
                  </div>

                  {/* -----------------------------------
                      PRODUCTS
                  ----------------------------------- */}

                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      background:
                        "#f8fafc",
                      borderRadius: 8,
                    }}
                  >
                    <b
                      style={{
                        fontSize: 12,
                      }}
                    >
                      Products for
                      this Delivery
                    </b>

                    <div
                      style={{
                        fontSize: 11,
                        color:
                          "#64748b",
                        margin:
                          "5px 0 10px",
                      }}
                    >
                      Enter how many
                      units from the
                      vendor invoice
                      are being sent to
                      this destination.
                    </div>

                    {d.items.map(
                      (
                        item,
                        itemIndex
                      ) => {
                        const otherAllocated =
                          form.deliveries.reduce(
                            (
                              sum,
                              other,
                              otherIndex
                            ) =>
                              otherIndex ===
                              idx
                                ? sum
                                : sum +
                                  qty(
                                    other.items?.find(
                                      (
                                        x
                                      ) =>
                                        x.product_name ===
                                        item.product_name
                                    )
                                      ?.quantity
                                  ),
                            0
                          );

                        const total =
                          allocation.find(
                            (a) =>
                              a.name ===
                              item.product_name
                          )?.total ||
                          0;

                        const max =
                          Math.max(
                            0,
                            total -
                              otherAllocated
                          );

                        const afterThis =
                          otherAllocated +
                          qty(
                            item.quantity
                          );

                        const remaining =
                          total -
                          afterThis;

                        return (
                          <div
                            key={
                              item.product_name
                            }
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "2fr 1fr 1fr 1fr",
                              gap: 10,
                              alignItems:
                                "end",
                              marginBottom:
                                8,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight:
                                  600,
                              }}
                            >
                              {
                                item.product_name
                              }
                            </div>

                            <div>
                              <label
                                style={
                                  styles.label
                                }
                              >
                                Invoice Qty
                              </label>

                              <div
                                style={{
                                  padding:
                                    "9px 11px",
                                  background:
                                    "#fff",
                                  border:
                                    "1px solid #e5e7eb",
                                  borderRadius:
                                    8,
                                  fontSize: 13,
                                }}
                              >
                                {total}
                              </div>
                            </div>

                            <div>
                              <label
                                style={
                                  styles.label
                                }
                              >
                                This Delivery
                              </label>

                              <input
                                type="number"
                                min="0"
                                max={max}
                                style={
                                  styles.input
                                }
                                value={
                                  item.quantity
                                }
                                onChange={(
                                  e
                                ) => {
                                  let val =
                                    qty(
                                      e
                                        .target
                                        .value
                                    );

                                  val =
                                    Math.max(
                                      0,
                                      Math.min(
                                        max,
                                        val
                                      )
                                    );

                                  updateDelivery(
                                    idx,
                                    {
                                      items:
                                        d.items.map(
                                          (
                                            x,
                                            k
                                          ) =>
                                            k ===
                                            itemIndex
                                              ? {
                                                  ...x,
                                                  quantity:
                                                    val,
                                                }
                                              : x
                                        ),
                                    }
                                  );
                                }}
                              />
                            </div>

                            <div>
                              <label
                                style={
                                  styles.label
                                }
                              >
                                Remaining
                              </label>

                              <div
                                style={{
                                  padding:
                                    "9px 11px",
                                  background:
                                    remaining ===
                                    0
                                      ? "#dcfce7"
                                      : "#fff7ed",
                                  color:
                                    remaining ===
                                    0
                                      ? "#166534"
                                      : "#92400e",
                                  borderRadius:
                                    8,
                                  fontSize: 13,
                                  fontWeight:
                                    700,
                                }}
                              >
                                {Math.max(
                                  0,
                                  remaining
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>

                  {/* -----------------------------------
                      ADMIN LOGISTICS
                      ADMIN CAN MANAGE BOTH TYPES
                  ----------------------------------- */}

                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border:
                        "1px solid #e5e7eb",
                      borderRadius: 8,
                      background:
                        "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 9,
                      }}
                    >
                      Logistics & POD —
                      Admin Control
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color:
                          "#64748b",
                        marginBottom:
                          10,
                      }}
                    >
                      Admin can enter or
                      update courier,
                      AWB, shipping,
                      delivery status and
                      POD for both
                      Vendor-arranged and
                      Admin-arranged
                      deliveries.
                    </div>

                    <div
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "repeat(3,1fr)",
                        gap: 10,
                      }}
                    >
                      <Field label="Courier / Logistics">
                        <input
                          style={
                            styles.input
                          }
                          value={
                            d.courier_name
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                courier_name:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                          placeholder="Delhivery / Blue Dart / DTDC..."
                        />
                      </Field>

                      <Field label="AWB Number">
                        <input
                          style={
                            styles.input
                          }
                          value={
                            d.awb_number
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                awb_number:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Shipping Date">
                        <input
                          type="date"
                          style={
                            styles.input
                          }
                          value={
                            d.shipping_date
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                shipping_date:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Expected Delivery">
                        <input
                          type="date"
                          style={
                            styles.input
                          }
                          value={
                            d.expected_delivery_date
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                expected_delivery_date:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Actual Delivery">
                        <input
                          type="date"
                          style={
                            styles.input
                          }
                          value={
                            d.delivery_date
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                delivery_date:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Delivery Status">
                        <select
                          style={
                            styles.input
                          }
                          value={
                            d.delivery_status
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                delivery_status:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        >
                          <option value="not_shipped">
                            Not shipped
                          </option>

                          <option value="shipped">
                            Shipped
                          </option>

                          <option value="in_transit">
                            In transit
                          </option>

                          <option value="delivered">
                            Delivered
                          </option>
                        </select>
                      </Field>

                      <Field label="POD Document">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          style={
                            styles.input
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                podFile:
                                  e
                                    .target
                                    .files?.[0] ||
                                  null,
                              }
                            )
                          }
                        />

                        {d.has_pod && (
                          <div
                            style={{
                              fontSize: 11,
                              color:
                                "#166534",
                              marginTop: 5,
                            }}
                          >
                            ✓ POD already
                            uploaded
                          </div>
                        )}
                      </Field>

                      <Field label="Notes">
                        <textarea
                          style={{
                            ...styles.input,
                            minHeight: 65,
                          }}
                          value={
                            d.notes
                          }
                          onChange={(e) =>
                            updateDelivery(
                              idx,
                              {
                                notes:
                                  e
                                    .target
                                    .value,
                              }
                            )
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  {d.delivery_arranged_by ===
                    "vendor" && (
                    <div
                      style={{
                        marginTop: 9,
                        fontSize: 11,
                        color:
                          "#64748b",
                      }}
                    >
                      This delivery is
                      marked Vendor
                      Arranged. The vendor
                      will later be able to
                      update its courier,
                      AWB, dates, status and
                      POD. Admin can still
                      manage all of those
                      fields now.
                    </div>
                  )}
                </div>
              )
            )}

            {/* -----------------------------------------
                ADD DELIVERY
            ----------------------------------------- */}

            <button
              style={{
                ...styles.btn,
                marginTop: 2,
              }}
              onClick={addDelivery}
              disabled={!invoice}
            >
              ＋ Add Another Delivery
            </button>

            {/* -----------------------------------------
                SAVE / LOCK
            ----------------------------------------- */}

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                marginTop: 16,
                gap: 12,
                flexWrap:
                  "wrap",
              }}
            >
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    form.is_locked
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      is_locked:
                        e.target
                          .checked,
                    }))
                  }
                />{" "}
                Lock tracker and
                vendor deliveries
                after saving
              </label>

              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                }}
              >
                <button
                  style={
                    styles.btn
                  }
                  onClick={reset}
                >
                  Cancel
                </button>

                <button
                  style={{
                    ...styles.btn,
                    ...styles.primary,
                  }}
                  disabled={
                    saving
                  }
                  onClick={
                    saveAdmin
                  }
                >
                  {saving
                    ? "Saving…"
                    : editing
                    ? "Save Changes"
                    : "Create POD Tracker"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          VENDOR EDIT POPUP
      ================================================= */}

      {!isAdmin &&
        vendorEditing && (
          <div style={styles.card}>
            <div
              style={{
                padding: 12,
                borderBottom:
                  "1px solid #f1f5f9",
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <b>
                Update Delivery #
                {
                  vendorEditing.delivery_sequence
                }
              </b>

              <button
                style={styles.btn}
                onClick={() =>
                  setVendorEditing(
                    null
                  )
                }
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: 16,
              }}
            >
              <div
                style={{
                  padding: 12,
                  background:
                    "#f8fafc",
                  borderRadius: 8,
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                <b>
                  Vendor Invoice:
                </b>{" "}
                {
                  vendorEditing.vendor_invoice_number
                }

                {"  "}

                <b>PO:</b>{" "}
                {
                  vendorEditing.po_number ||
                  "–"
                }

                <div
                  style={{
                    marginTop: 7,
                  }}
                >
                  {(
                    vendorEditing.items ||
                    []
                  )
                    .map(
                      (x) =>
                        `${x.product_name} × ${x.quantity}`
                    )
                    .join(
                      ", "
                    )}
                </div>

                <div
                  style={{
                    marginTop: 7,
                  }}
                >
                  <b>
                    Delivery:
                  </b>{" "}
                  {vendorEditing.location_label ||
                    vendorEditing.city ||
                    "–"}{" "}
                  —{" "}
                  {
                    vendorEditing.address
                  }
                </div>
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(3,1fr)",
                  gap: 12,
                }}
              >
                <Field label="Courier / Logistics">
                  <input
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.courier_name ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          courier_name:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="AWB Number">
                  <input
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.awb_number ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          awb_number:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="Shipping Date">
                  <input
                    type="date"
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.shipping_date ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          shipping_date:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="Expected Delivery">
                  <input
                    type="date"
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.expected_delivery_date ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          expected_delivery_date:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="Actual Delivery">
                  <input
                    type="date"
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.delivery_date ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          delivery_date:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="Delivery Status">
                  <select
                    style={
                      styles.input
                    }
                    value={
                      vendorEditing.delivery_status ||
                      "not_shipped"
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          delivery_status:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="not_shipped">
                      Not shipped
                    </option>

                    <option value="shipped">
                      Shipped
                    </option>

                    <option value="in_transit">
                      In transit
                    </option>

                    <option value="delivered">
                      Delivered
                    </option>
                  </select>
                </Field>

                <Field label="POD Document">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={
                      styles.input
                    }
                    onChange={(e) =>
                      setVendorFile(
                        e.target
                          .files?.[0] ||
                          null
                      )
                    }
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    style={{
                      ...styles.input,
                      minHeight: 70,
                    }}
                    value={
                      vendorEditing.notes ||
                      ""
                    }
                    onChange={(e) =>
                      setVendorEditing(
                        (r) => ({
                          ...r,
                          notes:
                            e
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </Field>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <button
                  style={
                    styles.btn
                  }
                  onClick={() =>
                    setVendorEditing(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  style={{
                    ...styles.btn,
                    ...styles.primary,
                  }}
                  disabled={
                    saving
                  }
                  onClick={
                    saveVendor
                  }
                >
                  {saving
                    ? "Saving…"
                    : "Save Delivery / POD"}
                </button>
              </div>
            </div>
          </div>
        )}

      {isAdmin && (
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            padding:
              "4px 2px",
          }}
        >
          One Vendor Invoice can
          have one POD Tracker with
          multiple delivery
          destinations. Product
          quantities are reconciled
          across all deliveries.
        </div>
      )}
    </div>
  );
}