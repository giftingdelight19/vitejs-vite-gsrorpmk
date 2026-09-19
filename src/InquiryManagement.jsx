import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const STATUSES = [
  "New",
  "Contacted",
  "Quotation Sent",
  "Negotiation",
  "Won",
  "Lost",
  "On Hold",
];
const SOURCES = [
  "Website",
  "WhatsApp",
  "Email",
  "Phone",
  "Referral",
  "Existing Customer",
  "Other",
];
const product = () => ({
  product_name: "",
  description: "",
  quantity: "",
  unit: "pcs",
  budget_per_unit: "",
  total_budget: "",
  delivery_location: "",
});
const blank = () => ({
  customer_name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  requirement: "",
  expected_delivery_date: "",
  delivery_location: "",
  source: "Website",
  status: "New",
  notes: "",
  products: [product()],
});
const inp = {
  width: "100%",
  padding: "10px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 13,
  background: "#fff",
};
const btn = {
  border: 0,
  borderRadius: 8,
  padding: "9px 14px",
  fontWeight: 600,
  cursor: "pointer",
};

function Field({ label, required, children }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 5,
          fontSize: 12,
          fontWeight: 600,
          color: "#475569",
        }}
      >
        {label}
        {required && " *"}
      </label>
      {children}
    </div>
  );
}

function InquiryForm({
  supabase,
  publicMode = false,
  initialValue,
  onSaved,
  onCancel,
}) {
  const [form, setForm] = useState(initialValue || blank());
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [rawInquiry, setRawInquiry] = useState(
    initialValue?.original_inquiry || "",
  );
  const [imageFile, setImageFile] = useState(null);
  const recognitionRef = useRef(null);
  const speechBaseRef = useRef("");
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setProduct = (index, key, value) =>
    setForm((f) => ({
      ...f,
      products: f.products.map((p, i) =>
        i === index ? { ...p, [key]: value } : p,
      ),
    }));
  const lineTotal = (p) =>
    p.total_budget !== "" && p.total_budget != null
      ? Number(p.total_budget) || 0
      : (Number(p.quantity) || 0) * (Number(p.budget_per_unit) || 0);
  const grandTotal = form.products.reduce((sum, p) => sum + lineTotal(p), 0);

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  async function extractWithGemini() {
    setMessage("");
    if (!rawInquiry.trim() && !imageFile) {
      setMessage("Type, speak, or upload an inquiry before using AI Extract.");
      return;
    }
    setExtracting(true);
    try {
      const body = { text: rawInquiry.trim() };
      if (imageFile) {
        body.imageBase64 = await fileToBase64(imageFile);
        body.imageMimeType = imageFile.type;
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 55000);
      let response;
      try {
        response = await fetch("/api/extract-inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          responseText.trimStart().startsWith("<")
            ? "The AI endpoint returned a webpage instead of JSON. Confirm that the Cloudflare Pages Function is deployed."
            : responseText.slice(0, 300) ||
                `Server returned HTTP ${response.status}.`,
        );
      }
      if (!response.ok)
        throw new Error(result.error || "AI extraction failed.");
      const data = result.data || {};
      setForm((current) => ({
        ...current,
        customer_name: data.customer_name || current.customer_name,
        contact_name: data.contact_name || current.contact_name,
        contact_phone: data.contact_phone || current.contact_phone,
        contact_email: data.contact_email || current.contact_email,
        requirement:
          data.requirement || current.requirement || rawInquiry.trim(),
        expected_delivery_date:
          data.expected_delivery_date || current.expected_delivery_date,
        delivery_location: data.delivery_location || current.delivery_location,
        source: publicMode ? "Website" : data.source || current.source,
        status: publicMode ? "New" : data.status || current.status,
        notes: data.notes || current.notes,
        products:
          Array.isArray(data.products) && data.products.length
            ? data.products.map((p) => ({
                ...product(),
                ...p,
                quantity: p.quantity ?? "",
                budget_per_unit: p.budget_per_unit ?? "",
                total_budget: p.total_budget ?? "",
                delivery_location:
                  p.delivery_location || data.delivery_location || "",
              }))
            : current.products,
      }));
      setMessage(
        "AI extraction completed. Please review the information before saving.",
      );
    } catch (error) {
      setMessage(
        `AI extraction error: ${
          error?.name === "AbortError"
            ? "The request timed out. Please try again."
            : error.message
        }`,
      );
    }
    setExtracting(false);
  }

  function toggleSpeech() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage(
        "Speech input is not supported in this browser. Please use Google Chrome.",
      );
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    speechBaseRef.current = rawInquiry.trim();
    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++)
        transcript += e.results[i][0].transcript + " ";
      setRawInquiry((speechBaseRef.current + " " + transcript).trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      setListening(false);
      setMessage(`Microphone error: ${e.error}`);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function pasteImage(event) {
    const item = [...(event.clipboardData?.items || [])].find((value) =>
      value.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      event.preventDefault();
      setImageFile(file);
      setMessage("Pasted image attached. Click Extract with Gemini AI.");
    }
  }

  async function save(e) {
    e.preventDefault();
    setMessage("");
    if (
      !form.contact_name.trim() ||
      !form.contact_phone.trim() ||
      !form.requirement.trim()
    ) {
      setMessage("Please enter your name, phone number and requirement.");
      return;
    }
    setSaving(true);
    const products = form.products
      .filter((p) => p.product_name.trim())
      .map((p) => ({
        ...p,
        quantity: p.quantity === "" ? null : Number(p.quantity),
        budget_per_unit:
          p.budget_per_unit === "" ? null : Number(p.budget_per_unit),
        total_budget: p.total_budget === "" ? null : Number(p.total_budget),
      }));
    const payload = {
      customer_name: form.customer_name.trim() || null,
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim(),
      contact_email: form.contact_email.trim() || null,
      requirement: form.requirement.trim(),
      expected_delivery_date: form.expected_delivery_date || null,
      delivery_location: form.delivery_location.trim() || null,
      source: publicMode ? "Website" : form.source,
      status: publicMode ? "New" : form.status,
      notes: form.notes.trim() || null,
      products: products.map((p) => ({ ...p, line_total: lineTotal(p) })),
      total_amount: grandTotal,
      original_inquiry: rawInquiry.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const result = form.id
      ? await supabase.from("inquiries").update(payload).eq("id", form.id)
      : await supabase
          .from("inquiries")
          .insert([
            { ...payload, inquiry_date: new Date().toISOString().slice(0, 10) },
          ]);
    setSaving(false);
    if (result.error) {
      setMessage(`Unable to save inquiry: ${result.error.message}`);
      return;
    }
    if (publicMode) {
      setForm(blank());
      setMessage(
        "Thank you. Your inquiry has been submitted successfully. Our team will contact you shortly.",
      );
    } else onSaved?.();
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 15 }}>
      <div
        style={{
          padding: 14,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
        }}
      >
        <Field label="Paste or speak the original customer inquiry">
          <textarea
            rows={4}
            style={{ ...inp, resize: "vertical" }}
            value={rawInquiry}
            onChange={(e) => setRawInquiry(e.target.value)}
            onPaste={pasteImage}
            placeholder="Paste a WhatsApp message, email, or screenshot here—or use the microphone…"
          />
        </Field>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 9,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={toggleSpeech}
            style={{
              ...btn,
              background: listening ? "#fee2e2" : "#e8effd",
              color: listening ? "#b91c1c" : "#1e56d9",
            }}
          >
            {listening ? "■ Stop listening" : "🎤 Speak inquiry"}
          </button>
          <label
            style={{
              ...btn,
              background: "#fff",
              border: "1px solid #cbd5e1",
              color: "#334155",
            }}
          >
            📎 Upload image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
          </label>
          {imageFile && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {imageFile.name}
            </span>
          )}
          <button
            type="button"
            disabled={extracting}
            onClick={extractWithGemini}
            style={{
              ...btn,
              background: "#7c3aed",
              color: "#fff",
              opacity: extracting ? 0.6 : 1,
            }}
          >
            {extracting ? "Extracting…" : "✨ Extract with Gemini AI"}
          </button>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        <Field label="Company / customer name">
          <input
            style={inp}
            value={form.customer_name}
            onChange={(e) => set("customer_name", e.target.value)}
          />
        </Field>
        <Field label="Contact person" required>
          <input
            style={inp}
            value={form.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
          />
        </Field>
        <Field label="Phone / mobile" required>
          <input
            style={inp}
            value={form.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            style={inp}
            value={form.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </Field>
        <Field label="Expected delivery date">
          <input
            type="date"
            style={inp}
            value={form.expected_delivery_date || ""}
            onChange={(e) => set("expected_delivery_date", e.target.value)}
          />
        </Field>
        <Field label="Delivery location">
          <input
            style={inp}
            value={form.delivery_location || ""}
            onChange={(e) => set("delivery_location", e.target.value)}
            placeholder="City, address or delivery site"
          />
        </Field>
        {!publicMode && (
          <Field label="Source">
            <select
              style={inp}
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
            >
              {SOURCES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        )}
        {!publicMode && (
          <Field label="Status">
            <select
              style={inp}
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Requirement" required>
        <textarea
          rows={4}
          style={{ ...inp, resize: "vertical" }}
          value={form.requirement}
          onChange={(e) => set("requirement", e.target.value)}
          placeholder="Tell us what you need, quantity, branding, budget and delivery location."
        />
      </Field>
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            marginBottom: 8,
          }}
        >
          Products
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7,minmax(100px,1fr)) 110px 38px",
            gap: 7,
            fontSize: 11,
            color: "#64748b",
            marginBottom: 5,
          }}
        >
          <span>Product</span>
          <span>Specifications</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Budget/unit</span>
          <span>Entered total</span>
          <span>Delivery location</span>
          <span>Calculated total</span>
          <span />
        </div>
        {form.products.map((p, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,minmax(100px,1fr)) 110px 38px",
              gap: 7,
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <input
              style={inp}
              placeholder="Product"
              value={p.product_name}
              onChange={(e) =>
                setProduct(index, "product_name", e.target.value)
              }
            />
            <input
              style={inp}
              placeholder="Specifications"
              value={p.description}
              onChange={(e) => setProduct(index, "description", e.target.value)}
            />
            <input
              type="number"
              min="0"
              style={inp}
              placeholder="Qty"
              value={p.quantity}
              onChange={(e) => setProduct(index, "quantity", e.target.value)}
            />
            <input
              style={inp}
              placeholder="Unit"
              value={p.unit}
              onChange={(e) => setProduct(index, "unit", e.target.value)}
            />
            <input
              type="number"
              min="0"
              style={inp}
              placeholder="Budget/unit"
              value={p.budget_per_unit}
              onChange={(e) =>
                setProduct(index, "budget_per_unit", e.target.value)
              }
            />
            <input
              type="number"
              min="0"
              style={inp}
              placeholder="Total budget"
              value={p.total_budget}
              onChange={(e) =>
                setProduct(index, "total_budget", e.target.value)
              }
            />
            <input
              style={inp}
              placeholder="Delivery location"
              value={p.delivery_location || ""}
              onChange={(e) =>
                setProduct(index, "delivery_location", e.target.value)
              }
            />
            <strong style={{ textAlign: "right", color: "#0f1f3d" }}>
              ₹
              {lineTotal(p).toLocaleString("en-IN", {
                maximumFractionDigits: 2,
              })}
            </strong>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  products:
                    f.products.length === 1
                      ? [product()]
                      : f.products.filter((_, i) => i !== index),
                }))
              }
              style={{ ...btn, color: "#dc2626", background: "#fee2e2" }}
            >
              ×
            </button>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({ ...f, products: [...f.products, product()] }))
            }
            style={{ ...btn, color: "#1e56d9", background: "#e8effd" }}
          >
            + Add product
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0f1f3d" }}>
            Grand total: ₹
            {grandTotal.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>
      <Field label="Additional notes">
        <textarea
          rows={2}
          style={{ ...inp, resize: "vertical" }}
          value={form.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      {message && (
        <div
          style={{
            padding: 11,
            borderRadius: 8,
            background:
              message.startsWith("Thank") ||
              message.startsWith("AI extraction completed")
                ? "#dcfce7"
                : "#fee2e2",
            color:
              message.startsWith("Thank") ||
              message.startsWith("AI extraction completed")
                ? "#166534"
                : "#b91c1c",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{ ...btn, background: "#f1f5f9", color: "#334155" }}
          >
            Cancel
          </button>
        )}
        <button
          disabled={saving}
          style={{
            ...btn,
            background: "#1e56d9",
            color: "#fff",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : publicMode ? "Submit inquiry" : "Save inquiry"}
        </button>
      </div>
    </form>
  );
}

export function PublicInquiryPage({ supabase, onBackToLogin }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <div style={{ maxWidth: 1050, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f1f3d" }}>
              GDPL
            </div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Gifting Delight Private Limited
            </div>
          </div>
          <button
            onClick={onBackToLogin}
            style={{
              ...btn,
              background: "#fff",
              border: "1px solid #cbd5e1",
              color: "#334155",
            }}
          >
            Portal login
          </button>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 8px 28px rgba(15,31,61,.06)",
          }}
        >
          <h1 style={{ margin: 0, color: "#0f1f3d", fontSize: 24 }}>
            Send us your inquiry
          </h1>
          <p style={{ color: "#64748b", margin: "6px 0 22px" }}>
            No login is required. Share your requirement and our team will
            contact you.
          </p>
          <InquiryForm supabase={supabase} publicMode />
        </div>
      </div>
    </div>
  );
}

export default function InquiryManagement({ supabase }) {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [search, setSearch] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false });
    if (e) setError(e.message);
    else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );
  async function updateStatus(id, status) {
    const { error: e } = await supabase
      .from("inquiries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) setError(e.message);
    else
      setRows((current) =>
        current.map((r) => (r.id === id ? { ...r, status } : r)),
      );
  }
  function exportExcel() {
    const report = [];
    filtered.forEach((inquiry) => {
      const products =
        Array.isArray(inquiry.products) && inquiry.products.length
          ? inquiry.products
          : [{}];
      products.forEach((p, index) =>
        report.push({
          Inquiry_Date:
            inquiry.inquiry_date || inquiry.created_at?.slice(0, 10) || "",
          Customer: inquiry.customer_name || "",
          Contact_Name: inquiry.contact_name || "",
          Phone: inquiry.contact_phone || "",
          Email: inquiry.contact_email || "",
          Requirement: inquiry.requirement || "",
          Delivery_Date: inquiry.expected_delivery_date || "",
          Delivery_Location:
            p.delivery_location || inquiry.delivery_location || "",
          Source: inquiry.source || "",
          Status: inquiry.status || "New",
          Product_Line: index + 1,
          Product: p.product_name || "",
          Specifications: p.description || "",
          Quantity: p.quantity ?? "",
          Unit: p.unit || "",
          Budget_Per_Unit: p.budget_per_unit ?? "",
          Product_Total:
            p.line_total ??
            p.total_budget ??
            (Number(p.quantity) || 0) * (Number(p.budget_per_unit) || 0),
          Inquiry_Grand_Total: inquiry.total_amount || 0,
          Notes: inquiry.notes || "",
        }),
      );
    });
    const worksheet = XLSX.utils.json_to_sheet(report);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inquiries");
    XLSX.writeFile(
      workbook,
      `inquiries-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }
  if (editing)
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>
          {editing.id ? "Edit inquiry" : "Add inquiry"}
        </h1>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <InquiryForm
            supabase={supabase}
            initialValue={{
              ...blank(),
              ...editing,
              products:
                Array.isArray(editing.products) && editing.products.length
                  ? editing.products
                  : [product()],
            }}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </div>
      </div>
    );
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Leads & Inquiries</h1>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            Review public inquiries, complete missing information and update
            action status.
          </div>
        </div>
        <button
          onClick={exportExcel}
          style={{ ...btn, background: "#16a34a", color: "#fff" }}
        >
          ⬇ Download Excel
        </button>
        <button
          onClick={() => setEditing(blank())}
          style={{ ...btn, background: "#1e56d9", color: "#fff" }}
        >
          + Add inquiry
        </button>
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}>
          <input
            style={{ ...inp, maxWidth: 380 }}
            placeholder="Search customer, phone, product or requirement"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {error && (
          <div style={{ padding: 18, color: "#b91c1c" }}>
            Unable to load inquiries: {error}
          </div>
        )}
        {loading ? (
          <div style={{ padding: 35, textAlign: "center", color: "#64748b" }}>
            Loading inquiries…
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    "Date",
                    "Customer",
                    "Contact",
                    "Requirement",
                    "Products",
                    "Total",
                    "Delivery",
                    "Location",
                    "Source",
                    "Status",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        color: "#475569",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan="11"
                      style={{
                        padding: 35,
                        textAlign: "center",
                        color: "#94a3b8",
                      }}
                    >
                      No inquiries found
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                        {r.inquiry_date || r.created_at?.slice(0, 10)}
                      </td>
                      <td style={{ padding: 10, fontWeight: 600 }}>
                        {r.customer_name || "–"}
                      </td>
                      <td style={{ padding: 10 }}>
                        {r.contact_name}
                        <br />
                        <span style={{ color: "#64748b" }}>
                          {r.contact_phone}
                        </span>
                      </td>
                      <td style={{ padding: 10, minWidth: 220 }}>
                        {r.requirement}
                      </td>
                      <td style={{ padding: 10 }}>
                        {Array.isArray(r.products)
                          ? r.products
                              .filter((p) => p.product_name)
                              .map((p, i) => (
                                <div key={i}>
                                  {i + 1}. {p.product_name}
                                  {p.delivery_location || r.delivery_location
                                    ? ` — ${p.delivery_location || r.delivery_location}`
                                    : ""}
                                </div>
                              ))
                          : "–"}
                      </td>
                      <td style={{ padding: 10, fontWeight: 700 }}>
                        ₹
                        {Number(r.total_amount || 0).toLocaleString("en-IN", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ padding: 10 }}>
                        {r.expected_delivery_date || "–"}
                      </td>
                      <td style={{ padding: 10 }}>
                        {r.delivery_location || "–"}
                      </td>
                      <td style={{ padding: 10 }}>{r.source || "–"}</td>
                      <td style={{ padding: 10 }}>
                        <select
                          value={r.status || "New"}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          style={{ ...inp, minWidth: 125, padding: 6 }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 10 }}>
                        <button
                          onClick={() => setEditing(r)}
                          style={{
                            ...btn,
                            padding: "6px 10px",
                            background: "#f1f5f9",
                            color: "#334155",
                          }}
                        >
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
