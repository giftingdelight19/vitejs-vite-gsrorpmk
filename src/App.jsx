import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import POManagement from "./POManagement";

import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPA_URL = "https://xzcvevmjmymsdjbvtzbs.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6Y3Zldm1qbXltc2RqYnZ0emJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NzUyODgsImV4cCI6MjEwNDI1MTI4OH0.VKdhxOYwtF2loiFEctFHY-tIRKJ2ziIVi0XJwWnf2AI";
const sb = createClient(SUPA_URL, SUPA_KEY);

// ─── Constants ────────────────────────────────────────────────────────────────
const GDPL_GSTIN = "27AAICG0606R1Z9";
const GDPL_NAME  = "Gifting Delight Private Limited";
const GDPL_STATE = "Maharashtra";
const STATE_CODES = {"01":"J&K","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh","05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh","10":"Bihar","18":"Assam","19":"West Bengal","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh","24":"Gujarat","27":"Maharashtra","29":"Karnataka","30":"Goa","32":"Kerala","33":"Tamil Nadu","34":"Puducherry","36":"Telangana","37":"Andhra Pradesh"};
const getGSTType = (gstin) => {
  if (!gstin || gstin.length < 2) return { type:"none", label:"No GST" };
  const code = gstin.substring(0,2);
  if (code === "27") return { type:"cgst_sgst", label:"CGST + SGST (Intra-state · Maharashtra)" };
  return { type:"igst", label:"IGST (Inter-state · "+(STATE_CODES[code]||"Other state")+")" };
};
const GSTTag = ({ gstin }) => {
  if (!gstin || gstin.length < 2) return null;
  const { type, label } = getGSTType(gstin);
  const bg = type==="cgst_sgst"?"#dcfce7":type==="igst"?"#e8effd":"#f3f4f6";
  const col = type==="cgst_sgst"?"#16a34a":type==="igst"?"#1e56d9":"#94a3b8";
  return <span style={{background:bg,color:col,padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600}}>{label}</span>;
};

const T = {
  navy:"#0f1f3d", navyMid:"#1a3260", blue:"#1e56d9", blueMid:"#1648c0",
  blueLight:"#e8effd", amber:"#f59e0b", amberLight:"#fef3c7",
  green:"#16a34a", greenLight:"#dcfce7", red:"#dc2626", redLight:"#fee2e2",
  orange:"#ea580c", orangeLight:"#ffedd5", purple:"#7c3aed", purpleLight:"#f3e8ff",
  gray50:"#f8fafc", gray100:"#f1f5f9", gray200:"#e2e8f0", gray300:"#cbd5e1",
  gray400:"#94a3b8", gray500:"#64748b", gray600:"#475569", gray700:"#334155",
  gray800:"#1e293b", white:"#ffffff",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: ${T.gray50}; color: ${T.gray800}; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  input, select, textarea, button { font-family: inherit; font-size: 14px; }
  button { cursor: pointer; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-thumb { background: ${T.gray300}; border-radius: 3px; }
`;

const STATUS_META = {
  pending:    { label:"Pending review",  bg:"#fef3c7", color:"#92400e" },
  approved:   { label:"Approved",        bg:"#dcfce7", color:"#14532d" },
  paid:       { label:"Paid",            bg:"#dbeafe", color:"#1e3a8a" },
  on_hold:    { label:"On hold",         bg:"#fee2e2", color:"#7f1d1d" },
  rejected:   { label:"Rejected",        bg:"#ffedd5", color:"#7c2d12" },
  processing: { label:"Processing",      bg:"#f3e8ff", color:"#4c1d95" },
  partial:    { label:"Partial payment", bg:"#fef9c3", color:"#713f12" },
};

const VENDOR_STATUS_META = {
  pending:  { label:"Pending",  bg:"#fef3c7", color:"#92400e" },
  approved: { label:"Approved", bg:"#dcfce7", color:"#14532d" },
  rejected: { label:"Rejected", bg:"#ffedd5", color:"#7c2d12" },
};

const DOC_TYPES = ["Tax Invoice","Proforma Invoice (PI)","Credit Note","Debit Note","Payment Request"];
const GST_RATES = ["0","5","12","18","28"];
const UNITS     = ["Nos","Pcs","Kg","Grams","Meters","Liters","Box","Carton","Set","Pair","Hours","Days"];
const STATES    = ["Maharashtra","Delhi","Karnataka","Tamil Nadu","Gujarat","Rajasthan","Uttar Pradesh","Telangana","West Bengal","Haryana","Punjab","Madhya Pradesh","Andhra Pradesh","Kerala","Bihar","Odisha","Assam","Jharkhand","Chhattisgarh","Uttarakhand","Himachal Pradesh","Jammu & Kashmir","Goa","Tripura","Meghalaya","Manipur","Nagaland","Arunachal Pradesh","Mizoram","Sikkim","Chandigarh","Puducherry"];
const CATEGORIES = ["Corporate Gifting","Electronics & Components","Industrial Supplies","Packaging & Logistics","IT Services","Facility Management","Printing & Stationery","Raw Materials","Trading","Services","Other"];
const PAYMENT_MODES = ["NEFT","RTGS","IMPS","Cheque","UPI","Cash","DD"];

const today = () => new Date().toISOString().split("T")[0];
const fmtCurrency = n => n ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "–";
const fmtDate = d => { if (!d) return "–"; try { return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); } catch { return d; } };
const genInvId = () => `INV-${Date.now().toString().slice(-8)}`;

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const Pill = ({ status, map = STATUS_META }) => {
  const m = map[status] || { label: status, bg: T.gray100, color: T.gray600 };
  return <span style={{ background:m.bg, color:m.color, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{m.label}</span>;
};

const Btn = ({ children, onClick, variant="secondary", size="md", disabled, style:sx, type="button" }) => {
  const base = { display:"inline-flex", alignItems:"center", gap:6, padding:size==="sm"?"5px 12px":"8px 16px", borderRadius:8, fontWeight:500, fontSize:size==="sm"?12:13, border:"1px solid", cursor:disabled?"not-allowed":"pointer", transition:"opacity 0.15s", opacity:disabled?0.5:1, whiteSpace:"nowrap", ...sx };
  const variants = { primary:{ background:T.blue, color:T.white, borderColor:T.blue }, secondary:{ background:T.white, color:T.gray700, borderColor:T.gray200 }, danger:{ background:T.white, color:T.red, borderColor:"#fca5a5" }, success:{ background:T.green, color:T.white, borderColor:T.green }, ghost:{ background:"transparent", color:T.gray600, borderColor:"transparent" }, warning:{ background:T.amber, color:T.white, borderColor:T.amber } };
  return <button type={type} style={{ ...base, ...variants[variant] }} onClick={disabled?undefined:onClick}>{children}</button>;
};

const Fg = ({ label, error, children, full, half }) => (
  <div style={{ gridColumn:full?"1 / -1":half?"span 1":undefined }}>
    {label && <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.gray600, marginBottom:5 }}>{label}</label>}
    {children}
    {error && <p style={{ fontSize:11, color:T.red, marginTop:3 }}>{error}</p>}
  </div>
);

const Inp = ({ label, error, full, ...props }) => (
  <Fg label={label} error={error} full={full}>
    <input {...props} style={{ width:"100%", padding:"9px 11px", border:`1px solid ${error?T.red:T.gray200}`, borderRadius:8, fontSize:13, color:T.gray800, background:T.white, outline:"none" }} />
  </Fg>
);

const Sel = ({ label, error, full, children, ...props }) => (
  <Fg label={label} error={error} full={full}>
    <select {...props} style={{ width:"100%", padding:"9px 11px", border:`1px solid ${T.gray200}`, borderRadius:8, fontSize:13, color:T.gray800, background:T.white, appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", paddingRight:28 }}>{children}</select>
  </Fg>
);

const Card = ({ children, style:sx }) => <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.gray200}`, ...sx }}>{children}</div>;
const CardH = ({ title, right }) => (
  <div style={{ padding:"14px 18px", borderBottom:`1px solid ${T.gray100}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
    <span style={{ fontWeight:600, fontSize:14, color:T.gray800 }}>{title}</span>
    {right}
  </div>
);

const StatCard = ({ label, value, color, sub }) => (
  <div style={{ background:T.white, borderRadius:10, border:`1px solid ${T.gray200}`, padding:"14px 16px" }}>
    <div style={{ fontSize:22, fontWeight:700, color:color||T.gray800 }}>{value}</div>
    <div style={{ fontSize:11, color:T.gray400, marginTop:3, textTransform:"uppercase", letterSpacing:"0.4px" }}>{label}</div>
    {sub && <div style={{ fontSize:11, color:T.gray500, marginTop:2 }}>{sub}</div>}
  </div>
);

const Toast = ({ msg, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, []);
  const colors = { success:[T.green,"#dcfce7"], error:[T.red,"#fee2e2"], info:[T.blue,T.blueLight] };
  const [fg,bg] = colors[type]||colors.info;
  return <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:bg, border:`1px solid ${fg}`, color:fg, borderRadius:10, padding:"12px 18px", fontSize:13, fontWeight:500, maxWidth:380, boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>{msg}</div>;
};

const Modal = ({ title, onClose, children, footer, width=580 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
    <div style={{ background:T.white, borderRadius:14, width:"100%", maxWidth:width, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"18px 22px", borderBottom:`1px solid ${T.gray200}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontWeight:700, fontSize:15, color:T.gray800 }}>{title}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, color:T.gray400, cursor:"pointer", lineHeight:1 }}>×</button>
      </div>
      <div style={{ padding:"20px 22px", overflowY:"auto", flex:1 }}>{children}</div>
      {footer && <div style={{ padding:"14px 22px", borderTop:`1px solid ${T.gray200}`, display:"flex", justifyContent:"flex-end", gap:8, flexShrink:0 }}>{footer}</div>}
    </div>
  </div>
);

const Tbl = ({ cols, rows, emptyMsg="No records found" }) => (
  <div style={{ overflowX:"auto" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
      <thead><tr>{cols.map(c => <th key={c.label} style={{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:T.gray500, background:T.gray50, borderBottom:`1px solid ${T.gray200}`, whiteSpace:"nowrap" }}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.length===0 && <tr><td colSpan={cols.length} style={{ textAlign:"center", padding:40, color:T.gray400 }}>{emptyMsg}</td></tr>}
        {rows.map((row,i) => (
          <tr key={i} style={{ borderBottom:`1px solid ${T.gray100}` }}>
            {cols.map(c => <td key={c.label} style={{ padding:"10px 14px", color:T.gray700, whiteSpace:c.wrap?"normal":"nowrap" }}>{c.render?c.render(row):row[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const InfoBox = ({ children, type="info" }) => {
  const colors = { info:["#1e40af","#eff6ff","#bfdbfe"], warn:["#92400e","#fffbea","#fde68a"], success:["#14532d","#f0fdf4","#bbf7d0"] };
  const [c,bg,border] = colors[type]||colors.info;
  return <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:8, padding:"10px 14px", fontSize:13, color:c, marginBottom:14 }}>{children}</div>;
};

// ─── Line Item Row ────────────────────────────────────────────────────────────
function LineItemRow({ item, index, onChange, onRemove, gstApplicable }) {
  const taxable = (+item.qty||0) * (+item.rate||0);
  const gstAmt  = gstApplicable ? taxable * ((+item.gstPct||0)/100) : 0;
  const total   = taxable + gstAmt;

  useEffect(() => {
    onChange(index, { ...item, taxableAmt: taxable, gstAmt, lineTotal: total });
  }, [item.qty, item.rate, item.gstPct]);

  const inp = (key, placeholder, width=80) => (
    <input value={item[key]||""} onChange={e => onChange(index, { ...item, [key]: e.target.value })} placeholder={placeholder}
      style={{ width, padding:"6px 8px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12, color:T.gray800 }} />
  );

  return (
    <tr style={{ borderBottom:`1px solid ${T.gray100}` }}>
      <td style={{ padding:"6px 8px" }}>{inp("description","Description",180)}</td>
      <td style={{ padding:"6px 8px" }}>{inp("hsn","HSN/SAC",80)}</td>
      <td style={{ padding:"6px 8px" }}>
        <select value={item.unit||"Nos"} onChange={e => onChange(index, { ...item, unit: e.target.value })}
          style={{ width:70, padding:"6px 6px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12 }}>
          {UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding:"6px 8px" }}>{inp("qty","0",60)}</td>
      <td style={{ padding:"6px 8px" }}>{inp("rate","0.00",80)}</td>
      <td style={{ padding:"6px 8px", textAlign:"right", fontSize:12 }}>{fmtCurrency(taxable)}</td>
      {gstApplicable && <>
        <td style={{ padding:"6px 8px" }}>
          <select value={item.gstPct||"18"} onChange={e => onChange(index, { ...item, gstPct: e.target.value })}
            style={{ width:60, padding:"6px 6px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12 }}>
            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </td>
        <td style={{ padding:"6px 8px", textAlign:"right", fontSize:12 }}>{fmtCurrency(gstAmt)}</td>
      </>}
      <td style={{ padding:"6px 8px", textAlign:"right", fontSize:12, fontWeight:600 }}>{fmtCurrency(total)}</td>
      <td style={{ padding:"6px 8px" }}>
        <button onClick={() => onRemove(index)} style={{ background:"none", border:"none", color:T.red, fontSize:16, cursor:"pointer" }}>×</button>
      </td>
    </tr>
  );
}

// ─── Invoice Submit Modal ─────────────────────────────────────────────────────
function InvoiceModal({ vendor, advancePayments=[], po=null, onClose, onSubmit }) {
  const [docType, setDocType]         = useState("Tax Invoice");
  const [gstApplicable, setGstApp]    = useState(true);
  const [noGstReason, setNoGstReason] = useState("");
  const [form, setForm] = useState({
    invoiceNumber: "",
    invoiceDate: today(),
    poNumber: po?.po_number || "",
    shipTo: "",
    vendorGstin: vendor?.gstin || "", paymentTerms: "Net 30", notes: "",
    supplyState: "Maharashtra",
    linkedAdvanceIds: [],
  });
  const [items, setItems] = useState([{ description:"", hsn:"", unit:"Nos", qty:"", rate:"", gstPct:"18", taxableAmt:0, gstAmt:0, lineTotal:0 }]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isPI    = docType === "Proforma Invoice (PI)" || docType === "Payment Request";
  const isSameState = form.supplyState === "Maharashtra";

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const updateItem = (i, updated) => setItems(its => its.map((it, idx) => idx===i ? updated : it));
  const removeItem = i => setItems(its => its.filter((_,idx) => idx!==i));
  const addItem    = () => setItems(its => [...its, { description:"", hsn:"", unit:"Nos", qty:"", rate:"", gstPct:"18", taxableAmt:0, gstAmt:0, lineTotal:0 }]);

  const subTotal  = items.reduce((s,i) => s + (i.taxableAmt||0), 0);
  const totalGst  = gstApplicable ? items.reduce((s,i) => s + (i.gstAmt||0), 0) : 0;
  const cgst      = isSameState ? totalGst/2 : 0;
  const sgst      = isSameState ? totalGst/2 : 0;
  const igst      = !isSameState ? totalGst : 0;
  const grandTotal = subTotal + totalGst;

  const linkedAdv = advancePayments.filter(a => form.linkedAdvanceIds.includes(a.id));
  const advTotal  = linkedAdv.reduce((s,a) => s + (+a.amount||0), 0);
  const netPayable = grandTotal - advTotal;

  const toggleAdvance = id => {
    setForm(f => ({
      ...f,
      linkedAdvanceIds: f.linkedAdvanceIds.includes(id)
        ? f.linkedAdvanceIds.filter(x => x !== id)
        : [...f.linkedAdvanceIds, id]
    }));
  };

  const validate = () => {
    const e = {};
    if (!form.invoiceNumber) e.invoiceNumber = "Required";
    if (!form.invoiceDate)   e.invoiceDate   = "Required";
    if (!form.poNumber)      e.poNumber      = "Required";
    if (!uploadedFile)       e.file          = "Please upload invoice document";
    if (gstApplicable && !isPI) {
      items.forEach((it, i) => {
        if (!it.description) e[`desc${i}`] = "Required";
        if (!it.hsn)         e[`hsn${i}`]  = "Required";
        if (!it.qty || +it.qty <= 0) e[`qty${i}`] = "Required";
        if (!it.rate || +it.rate <= 0) e[`rate${i}`] = "Required";
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFileUpload = e => {
    const f = e.target.files[0];
    if (f) setUploadedFile(f);
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let fileUrl = null;
      if (uploadedFile) {
        const path = `invoices/${vendor.id}/${Date.now()}_${uploadedFile.name}`;
        const { error: upErr } = await sb.storage.from("vendor-docs").upload(path, uploadedFile);
        if (!upErr) {
          const { data: urlData } = sb.storage.from("vendor-docs").getPublicUrl(path);
          fileUrl = urlData?.publicUrl;
        }
      }
      const invId = genInvId();
      const payload = {
        id: invId,
        vendor_id: vendor.id,
        doc_type: docType,
        invoice_number: form.invoiceNumber,
        invoice_date: form.invoiceDate,
        po_number: form.poNumber,
        ship_to: form.shipTo,
        vendor_gstin: form.vendorGstin,
        supply_state: form.supplyState,
        gst_applicable: gstApplicable,
        no_gst_reason: noGstReason,
        items: JSON.stringify(items),
        sub_total: subTotal,
        total_gst: totalGst,
        cgst, sgst, igst,
        grand_total: grandTotal,
        advance_adjusted: advTotal,
        net_payable: netPayable,
        linked_advance_ids: form.linkedAdvanceIds,
        payment_terms: form.paymentTerms,
        notes: form.notes,
        file_url: fileUrl,
        submitted_by: vendor.contact_person,
        status: "pending",
        submit_date: today(),
      };
      const { error } = await sb.from("invoices").insert([payload]);
      if (error) throw error;
      if (form.linkedAdvanceIds.length > 0) {
        await sb.from("advance_payments").update({ status:"adjusted", adjusted_invoice_id: invId }).in("id", form.linkedAdvanceIds);
      }
      onSubmit(invId);
    } catch(err) {
      alert("Error submitting: " + err.message);
    }
    setSaving(false);
  };

  return (
    <Modal title={`Submit ${docType}`} onClose={onClose} width={860}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={submit} disabled={saving}>{saving?"Submitting…":"Submit invoice"}</Btn></>}>

      {/* Document type */}
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, fontWeight:600, color:T.gray600, marginBottom:6, display:"block" }}>Document type</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {DOC_TYPES.map(d => (
            <button key={d} onClick={() => setDocType(d)}
              style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:500, border:"1px solid", cursor:"pointer", background:docType===d?T.blue:T.white, color:docType===d?T.white:T.gray600, borderColor:docType===d?T.blue:T.gray200 }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* GST toggle */}
      {!isPI && (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:T.gray50, borderRadius:8, marginBottom:14 }}>
          <input type="checkbox" id="gst-toggle" checked={gstApplicable} onChange={e => setGstApp(e.target.checked)} style={{ width:16, height:16 }} />
          <label htmlFor="gst-toggle" style={{ fontSize:13, fontWeight:500, cursor:"pointer" }}>GST applicable on this invoice</label>
          {!gstApplicable && (
            <select value={noGstReason} onChange={e => setNoGstReason(e.target.value)}
              style={{ padding:"5px 10px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12 }}>
              <option value="">Select reason…</option>
              <option>Composition dealer</option>
              <option>Exempt supply</option>
              <option>Unregistered dealer</option>
              <option>Export / Zero rated</option>
            </select>
          )}
        </div>
      )}

      {/* Header fields */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
        <Inp label="Invoice / document number *" value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="INV-2025-001" error={errors.invoiceNumber} />
        <Inp label="Invoice date *" type="date" value={form.invoiceDate} onChange={set("invoiceDate")} error={errors.invoiceDate} />
        <Inp label="Your PO number *" value={form.poNumber} onChange={set("poNumber")} placeholder="PO-GDPL-XXXX" error={errors.poNumber} />
        {gstApplicable && <>
          <Inp label={`Your GSTIN${vendor?.gstin?"":" (optional)"}`} value={form.vendorGstin} onChange={set("vendorGstin")} placeholder="27XXXXX" />
          <Sel label="Supply from state" value={form.supplyState} onChange={set("supplyState")}>
            {STATES.map(s => <option key={s}>{s}</option>)}
          </Sel>
          <Sel label="Payment terms" value={form.paymentTerms} onChange={set("paymentTerms")}>
            {["Immediate","Net 15","Net 30","Net 45","Net 60","Against advance"].map(p => <option key={p}>{p}</option>)}
          </Sel>
        </>}
        <Inp label="Ship to address" value={form.shipTo} onChange={set("shipTo")} placeholder="Delivery address" full />
      </div>

      {/* GDPL details (read only) */}
      <div style={{ background:T.blueLight, borderRadius:8, padding:"10px 14px", fontSize:12, color:"#1e40af", marginBottom:14 }}>
      <strong>Bill to:</strong> {GDPL_NAME} &nbsp;|&nbsp; GSTIN: {GDPL_GSTIN} &nbsp;|&nbsp; State: {GDPL_STATE}
{form.vendorGstin?.length===15 && <span style={{marginLeft:12,fontWeight:600}}>→ Tax type: <GSTTag gstin={form.vendorGstin}/></span>}
      </div>

      {/* Line items */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, color:T.gray700, marginBottom:8 }}>
          {isPI ? "Product / service details" : "Line items *"}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:T.gray50 }}>
                <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}`, minWidth:180 }}>Description</th>
                <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>HSN/SAC</th>
                <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>Unit</th>
                <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>Qty</th>
                <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>Rate (₹)</th>
                <th style={{ padding:"7px 8px", textAlign:"right", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>Taxable</th>
                {gstApplicable && <>
                  <th style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>GST%</th>
                  <th style={{ padding:"7px 8px", textAlign:"right", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>GST Amt</th>
                </>}
                <th style={{ padding:"7px 8px", textAlign:"right", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>Total</th>
                <th style={{ padding:"7px 8px", borderBottom:`1px solid ${T.gray200}` }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <LineItemRow key={i} item={item} index={i} onChange={updateItem} onRemove={removeItem} gstApplicable={gstApplicable} />
              ))}
            </tbody>
          </table>
        </div>
        <Btn variant="ghost" onClick={addItem} style={{ marginTop:8, fontSize:12, color:T.blue }}>+ Add line item</Btn>
      </div>

      {/* Totals */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <div style={{ width:320, background:T.gray50, borderRadius:10, padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6, color:T.gray600 }}><span>Sub-total (taxable)</span><span>{fmtCurrency(subTotal)}</span></div>
          {gstApplicable && isSameState && <>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4, color:T.gray600 }}><span>CGST</span><span>{fmtCurrency(cgst)}</span></div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4, color:T.gray600 }}><span>SGST</span><span>{fmtCurrency(sgst)}</span></div>
          </>}
          {gstApplicable && !isSameState && <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4, color:T.gray600 }}><span>IGST</span><span>{fmtCurrency(igst)}</span></div>}
          <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:15, borderTop:`1px solid ${T.gray200}`, paddingTop:8, marginTop:4, color:T.gray800 }}><span>Grand total</span><span style={{ color:T.blue }}>{fmtCurrency(grandTotal)}</span></div>
          {advTotal > 0 && <>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginTop:6, color:T.orange }}><span>Less: Advance adjusted</span><span>- {fmtCurrency(advTotal)}</span></div>
            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:15, borderTop:`1px solid ${T.gray200}`, paddingTop:8, marginTop:4, color:T.green }}><span>Net payable</span><span>{fmtCurrency(netPayable)}</span></div>
          </>}
        </div>
      </div>

      {/* Link advance payments */}
      {advancePayments.filter(a => a.status==="approved" && !a.adjusted_invoice_id).length > 0 && (
        <div style={{ marginBottom:14, padding:14, border:`1px solid ${T.gray200}`, borderRadius:8 }}>
          <div style={{ fontSize:13, fontWeight:600, color:T.gray700, marginBottom:10 }}>Link advance payments to this invoice</div>
          {advancePayments.filter(a => a.status==="approved" && !a.adjusted_invoice_id).map(a => (
            <label key={a.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={form.linkedAdvanceIds.includes(a.id)} onChange={() => toggleAdvance(a.id)} style={{ width:15, height:15 }} />
              <span>Advance of <strong>{fmtCurrency(a.amount)}</strong> paid on {fmtDate(a.payment_date)} — Ref: {a.reference_number||"–"}</span>
            </label>
          ))}
        </div>
      )}

      {/* File upload */}
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.gray600, marginBottom:6 }}>Upload invoice document * (PDF/JPG/PNG, max 5MB)</label>
        <div onClick={() => document.getElementById("inv-file-upload").click()}
          style={{ border:`2px dashed ${errors.file?T.red:T.gray300}`, borderRadius:8, padding:"20px", textAlign:"center", cursor:"pointer", background:uploadedFile?T.greenLight:T.gray50 }}>
          {uploadedFile
            ? <div style={{ color:T.green, fontSize:13, fontWeight:500 }}>✓ {uploadedFile.name} — ready to upload</div>
            : <div><div style={{ fontSize:20, marginBottom:6 }}>📎</div><div style={{ fontSize:13, color:T.gray500 }}>Click to attach your invoice PDF or image</div></div>
          }
        </div>
        <input id="inv-file-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={handleFileUpload} />
        {errors.file && <p style={{ fontSize:11, color:T.red, marginTop:3 }}>{errors.file}</p>}
      </div>

      {/* Notes */}
      <Fg label="Notes / remarks (optional)" full>
        <textarea value={form.notes} onChange={set("notes")} rows={2}
          style={{ width:"100%", padding:"9px 11px", border:`1px solid ${T.gray200}`, borderRadius:8, fontSize:13, color:T.gray800, resize:"vertical" }} />
      </Fg>
    </Modal>
  );
}

// ─── Advance Payment Request Modal ────────────────────────────────────────────
function AdvanceModal({ vendor, onClose, onSubmit }) {
  const [form, setForm] = useState({
    requestDate: today(), poNumber: "", description: "", shipTo: "",
    amount: "", notes: "",
  });
  const [items, setItems] = useState([{ description:"", hsn:"", unit:"Nos", qty:"", rate:"", taxableAmt:0 }]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const updateItem = (i, updated) => setItems(its => its.map((it,idx) => idx===i?updated:it));
  const removeItem = i => setItems(its => its.filter((_,idx) => idx!==i));
  const addItem    = () => setItems(its => [...its, { description:"", hsn:"", unit:"Nos", qty:"", rate:"", taxableAmt:0 }]);

  const totalAmt = items.reduce((s,i) => s + ((+i.qty||0)*(+i.rate||0)), 0);

  const validate = () => {
    const e = {};
    if (!form.poNumber)    e.poNumber    = "Required";
    if (!form.description) e.description = "Required";
    if (!form.amount || +form.amount <= 0) e.amount = "Enter advance amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let fileUrl = null;
      if (uploadedFile) {
        const path = `advances/${vendor.id}/${Date.now()}_${uploadedFile.name}`;
        const { error: upErr } = await sb.storage.from("vendor-docs").upload(path, uploadedFile);
        if (!upErr) {
          const { data: urlData } = sb.storage.from("vendor-docs").getPublicUrl(path);
          fileUrl = urlData?.publicUrl;
        }
      }
      const payload = {
        vendor_id: vendor.id,
        request_date: form.requestDate,
        po_number: form.poNumber,
        description: form.description,
        ship_to: form.shipTo,
        items: JSON.stringify(items),
        total_order_value: totalAmt,
        advance_requested: +form.amount,
        amount: +form.amount,
        notes: form.notes,
        file_url: fileUrl,
        status: "pending",
        submitted_by: vendor.contact_person,
      };
      const { error } = await sb.from("advance_payments").insert([payload]);
      if (error) throw error;
      onSubmit();
    } catch(err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <Modal title="Advance Payment Request" onClose={onClose} width={760}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={submit} disabled={saving}>{saving?"Submitting…":"Submit request"}</Btn></>}>

      <InfoBox>Request advance payment against a Purchase Order. Once approved by GDPL, payment will be processed. You can link this advance when submitting your final invoice.</InfoBox>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
        <Inp label="Request date" type="date" value={form.requestDate} onChange={set("requestDate")} />
        <Inp label="GDPL PO number *" value={form.poNumber} onChange={set("poNumber")} placeholder="PO-GDPL-XXXX" error={errors.poNumber} />
        <Inp label="Advance amount requested (₹) *" type="number" value={form.amount} onChange={set("amount")} placeholder="0" error={errors.amount} />
        <Inp label="Brief description *" value={form.description} onChange={set("description")} placeholder="What is this advance for?" error={errors.description} full />
        <Inp label="Ship to address" value={form.shipTo} onChange={set("shipTo")} placeholder="Delivery address" full />
      </div>

      {/* Product details */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, color:T.gray700, marginBottom:8 }}>Product / service details</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:T.gray50 }}>
                {["Description","HSN/SAC","Unit","Qty","Rate (₹)","Amount",""].map(h => (
                  <th key={h} style={{ padding:"7px 8px", textAlign:"left", fontWeight:600, color:T.gray500, borderBottom:`1px solid ${T.gray200}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item,i) => {
                const amt = (+item.qty||0)*(+item.rate||0);
                const inp = (key, ph, w=80) => (
                  <input value={item[key]||""} onChange={e => updateItem(i, { ...item, [key]:e.target.value, taxableAmt: key==="qty"||key==="rate" ? (+e.target.value||0)*(+(key==="qty"?item.rate:item.qty)||0) : item.taxableAmt })}
                    placeholder={ph} style={{ width:w, padding:"6px 8px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12 }} />
                );
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${T.gray100}` }}>
                    <td style={{ padding:"6px 8px" }}>{inp("description","Description",180)}</td>
                    <td style={{ padding:"6px 8px" }}>{inp("hsn","HSN",80)}</td>
                    <td style={{ padding:"6px 8px" }}>
                      <select value={item.unit||"Nos"} onChange={e => updateItem(i, { ...item, unit:e.target.value })}
                        style={{ width:70, padding:"6px", border:`1px solid ${T.gray200}`, borderRadius:6, fontSize:12 }}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:"6px 8px" }}>{inp("qty","0",60)}</td>
                    <td style={{ padding:"6px 8px" }}>{inp("rate","0.00",80)}</td>
                    <td style={{ padding:"6px 8px", fontSize:12, textAlign:"right" }}>{fmtCurrency(amt)}</td>
                    <td style={{ padding:"6px 8px" }}><button onClick={() => removeItem(i)} style={{ background:"none", border:"none", color:T.red, fontSize:16, cursor:"pointer" }}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Btn variant="ghost" onClick={addItem} style={{ marginTop:8, fontSize:12, color:T.blue }}>+ Add item</Btn>
        {totalAmt > 0 && (
          <div style={{ textAlign:"right", marginTop:8, fontSize:13, color:T.gray700 }}>
            Total order value: <strong style={{ color:T.blue }}>{fmtCurrency(totalAmt)}</strong>
          </div>
        )}
      </div>

      {/* File upload */}
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.gray600, marginBottom:6 }}>Attach Proforma Invoice / quotation (optional)</label>
        <div onClick={() => document.getElementById("adv-file").click()}
          style={{ border:`2px dashed ${T.gray300}`, borderRadius:8, padding:"16px", textAlign:"center", cursor:"pointer", background:uploadedFile?T.greenLight:T.gray50 }}>
          {uploadedFile
            ? <div style={{ color:T.green, fontSize:13 }}>✓ {uploadedFile.name}</div>
            : <div style={{ fontSize:13, color:T.gray500 }}>📎 Click to attach PI or quotation (PDF/image)</div>
          }
        </div>
        <input id="adv-file" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => setUploadedFile(e.target.files[0])} />
      </div>

      <Fg label="Notes" full>
        <textarea value={form.notes} onChange={set("notes")} rows={2}
          style={{ width:"100%", padding:"9px 11px", border:`1px solid ${T.gray200}`, borderRadius:8, fontSize:13, resize:"vertical" }} />
      </Fg>
    </Modal>
  );
}

// ─── Payment Recording Modal (Admin) ─────────────────────────────────────────
function PaymentModal({ invoice, onClose, onConfirm }) {
  const [form, setForm] = useState({ paymentDate: today(), amount: invoice?.net_payable||invoice?.grand_total||invoice?.totalAmount||"", mode:"NEFT", reference:"", ourBank:"SBI - Current A/c", remarks:"", tdsApplicable:false, tdsSection:"194C - Contractor (1%)", tdsRate:"1", tdsAmount:"", netAfterTds:"" });
  const [errors, setErrors] = useState({});
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  useEffect(()=>{
    if(form.tdsApplicable && form.amount){
      const tds = (+form.amount*(+form.tdsRate||0)/100).toFixed(2);
      setForm(f=>({...f, tdsAmount:tds, netAfterTds:(+form.amount-+tds).toFixed(2)}));
    } else if (!form.tdsApplicable) {
      setForm(f=>({...f, tdsAmount:"", netAfterTds:""}));
    }
  },[form.tdsRate, form.amount, form.tdsApplicable]);
  const validate = () => {
    const e = {};
    if (!form.paymentDate) e.paymentDate = "Required";
    if (!form.amount || +form.amount<=0) e.amount = "Required";
    if (!form.mode) e.mode = "Required";
    if (!form.reference) e.reference = "UTR / reference number required";
    setErrors(e); return Object.keys(e).length===0;
  };
  return (
    <Modal title={`Record payment — ${invoice?.invoice_number||invoice?.id}`} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={()=>{ if(validate()) onConfirm(form); }}>Confirm payment</Btn></>}>
      <div style={{ background:T.gray50, borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
        Amount: <strong style={{ color:T.blue, fontSize:16 }}>{fmtCurrency(invoice?.grand_total||invoice?.totalAmount)}</strong>
        {invoice?.advance_adjusted>0 && <span style={{ color:"#ea580c", marginLeft:12 }}>Less advance: {fmtCurrency(invoice.advance_adjusted)} → Net: <strong>{fmtCurrency(invoice.net_payable)}</strong></span>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        <Inp label="Payment date *" type="date" value={form.paymentDate} onChange={set("paymentDate")} error={errors.paymentDate}/>
        <Inp label="Amount paid (₹) *" type="number" value={form.amount} onChange={set("amount")} error={errors.amount}/>
        <Sel label="Payment mode" value={form.mode} onChange={set("mode")}>
          {["NEFT","RTGS","IMPS","Cheque","UPI","Cash","DD","Credit Card"].map(m=><option key={m}>{m}</option>)}
        </Sel>
        <Inp label="UTR / reference / cheque no. *" value={form.reference} onChange={set("reference")} error={errors.reference}/>
        <Sel label="Paid from (our bank)" value={form.ourBank} onChange={set("ourBank")}>
          {["SBI - Current A/c","ICICI - Current A/c","Credit Card - HDFC","Credit Card - ICICI"].map(b=><option key={b}>{b}</option>)}
        </Sel>
        <Inp label="Remarks (optional)" value={form.remarks} onChange={set("remarks")}/>
      </div>
      <div style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:form.tdsApplicable?14:0 }}>
          <input type="checkbox" id="tds-chk" checked={form.tdsApplicable} onChange={e=>setForm(f=>({...f,tdsApplicable:e.target.checked}))} style={{ width:16, height:16 }}/>
          <label htmlFor="tds-chk" style={{ fontSize:13, fontWeight:600, cursor:"pointer" }}>TDS applicable on this payment</label>
        </div>
        {form.tdsApplicable && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:12 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>TDS section</label>
              <select value={form.tdsSection} onChange={set("tdsSection")} style={{ width:"100%", padding:"9px 11px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13 }}>
                {["194C - Contractor (1%)","194C - Contractor (2%)","194J - Professional (10%)","194J - Technical (2%)","194H - Commission (5%)","194I - Rent (10%)","194Q - Purchase (0.1%)"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <Inp label="TDS rate (%)" type="number" value={form.tdsRate} onChange={set("tdsRate")}/>
            <Inp label="TDS amount (₹)" value={form.tdsAmount} readOnly/>
            <Inp label="Net after TDS (₹)" value={form.netAfterTds} readOnly/>
            <div style={{ gridColumn:"1/-1", background:"#fef3c7", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#92400e" }}>
              ⚠️ TDS of ₹{form.tdsAmount} will be deducted. Vendor receives ₹{form.netAfterTds}. Issue Form 16A quarterly.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Registration ─────────────────────────────────────────────────────────────
const REG_STEPS = ["Company details","Contact & login","MSME & compliance","Bank details","Review & submit"];

function RegistrationPage({ onSuccess, onLoginClick }) {
  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState({ company_name:"", pan:"", gstin:"", category:"", contact_person:"", mobile:"", email:"", password:"", confirmPassword:"", city:"", state:"Maharashtra", pincode:"", msme_type:"Not Applicable", msme_udyam:"", tds_category:"Not Applicable", credit_period:"30 days", bank_name:"", account_number:"", ifsc:"", account_type:"Current" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone]   = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (step===0) {
      if (!form.company_name) e.company_name = "Required";
      if (!form.pan || form.pan.length!==10) e.pan = "Enter valid 10-char PAN";
      if (form.gstin && form.gstin.length!==15) e.gstin = "GSTIN must be 15 characters";
      if (!form.category) e.category = "Required";
    }
    if (step===1) {
      if (!form.contact_person) e.contact_person = "Required";
      if (!form.mobile || form.mobile.length!==10) e.mobile = "Enter 10-digit mobile";
      if (!form.email || !form.email.includes("@")) e.email = "Valid email required";
      if (!form.password || form.password.length<6) e.password = "Min 6 characters";
      if (form.password!==form.confirmPassword) e.confirmPassword = "Passwords do not match";
      if (!form.city) e.city = "Required";
    }
    if (step===2) {
      if (form.msme_type && form.msme_type!=="Not Applicable" && !form.msme_udyam) e.msme_udyam = "Udyam number required for MSME vendors";
    }
    if (step===3) {
      if (!form.bank_name) e.bank_name = "Required";
      if (!form.account_number) e.account_number = "Required";
      if (form.ifsc && form.ifsc.length !== 11) e.ifsc = "IFSC must be 11 characters";
    }
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const { error } = await sb.from("vendors").insert([{
        email: form.email, password: form.password,
        company_name: form.company_name, gstin: form.gstin||null, pan: form.pan,
        contact_person: form.contact_person, mobile: form.mobile,
        city: form.city, state: form.state, pincode: form.pincode,
        category: form.category, msme_type: form.msme_type, msme_udyam: form.msme_udyam||null,
        tds_category: form.tds_category, credit_period: form.credit_period,
        bank_name: form.bank_name, account_number: form.account_number, ifsc: form.ifsc, account_type: form.account_type,
        status: "pending",
      }]);
      if (error) throw error;
      setDone(true);
    } catch(err) {
      if (err.message?.includes("unique")) alert("This email is already registered. Please login.");
      else alert("Registration error: " + err.message);
    }
    setSaving(false);
  };

  if (done) return (
    <div style={{ minHeight:"100vh", background:T.gray50, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:T.white, borderRadius:16, padding:48, maxWidth:480, width:"100%", textAlign:"center", border:`1px solid ${T.gray200}` }}>
        <div style={{ width:64, height:64, background:T.greenLight, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:28 }}>✓</div>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:T.gray800, marginBottom:10 }}>Registration submitted!</h2>
        <p style={{ color:T.gray500, fontSize:14, lineHeight:1.7, marginBottom:28 }}>
          Your vendor account for <strong>{form.company_name}</strong> is pending review. Our team will verify your details and activate your account within 1–2 business days. You'll be notified at <strong>{form.email}</strong>.
        </p>
        <div style={{ background:T.gray50, borderRadius:10, padding:"14px 18px", fontSize:13, color:T.gray600, marginBottom:24, textAlign:"left" }}>
          <div style={{ marginBottom:6 }}><strong>What happens next:</strong></div>
          <div style={{ display:"flex", gap:8, marginBottom:4 }}><span style={{ color:T.blue }}>1.</span> GDPL admin reviews your KYC & bank details</div>
          <div style={{ display:"flex", gap:8, marginBottom:4 }}><span style={{ color:T.blue }}>2.</span> Account activated within 1–2 business days</div>
          <div style={{ display:"flex", gap:8 }}><span style={{ color:T.blue }}>3.</span> Login with your email and password</div>
        </div>
        <Btn variant="primary" onClick={onLoginClick} style={{ width:"100%", justifyContent:"center" }}>Go to login</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:T.gray50, display:"flex", flexDirection:"column" }}>
      <div style={{ background:T.navy, padding:"14px 32px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:800, color:T.amber }}>GDPL</div>
        <div style={{ width:1, height:18, background:T.gray600 }} />
        <div style={{ fontSize:13, color:"#94a3b8" }}>Vendor Portal</div>
        <div style={{ flex:1 }} />
        <Btn variant="secondary" size="sm" onClick={onLoginClick}>Sign in</Btn>
      </div>
      <div style={{ flex:1, padding:"40px 24px", display:"flex", flexDirection:"column", alignItems:"center" }}>
        <div style={{ maxWidth:640, width:"100%" }}>
          <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:26, fontWeight:800, color:T.gray800, marginBottom:6 }}>Vendor registration</h1>
          <p style={{ color:T.gray500, fontSize:14, marginBottom:32 }}>Register to submit invoices and receive payments from GDPL.</p>
          {/* Steps */}
          <div style={{ display:"flex", alignItems:"center", marginBottom:32 }}>
            {REG_STEPS.map((s,i) => (
              <div key={s} style={{ display:"flex", alignItems:"center", flex:i<REG_STEPS.length-1?1:0 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:i<step?T.green:i===step?T.blue:T.gray200, color:i<=step?T.white:T.gray400, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>{i<step?"✓":i+1}</div>
                  <div style={{ fontSize:10, color:i===step?T.blue:T.gray400, marginTop:4, whiteSpace:"nowrap", fontWeight:i===step?600:400 }}>{s}</div>
                </div>
                {i<REG_STEPS.length-1 && <div style={{ flex:1, height:1, background:i<step?T.green:T.gray200, margin:"0 8px", marginBottom:18 }} />}
              </div>
            ))}
          </div>
          <Card>
            <div style={{ padding:"24px 26px" }}>
              {step===0 && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <Inp label="Company / business name *" value={form.company_name} onChange={set("company_name")} placeholder="e.g. ABC Pvt Ltd" error={errors.company_name} full />
                  <Inp label="PAN *" value={form.pan} onChange={set("pan")} placeholder="AADCG1234F" maxLength={10} error={errors.pan} />
                  <Inp label="GSTIN (optional — if GST registered)" value={form.gstin} onChange={set("gstin")} placeholder="27AADCG1234F1ZX" maxLength={15} error={errors.gstin} />
                  <Sel label="Vendor category *" value={form.category} onChange={set("category")} error={errors.category}>
                    <option value="">Select category…</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </Sel>
                </div>
              )}
              {step===1 && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <Inp label="Contact person *" value={form.contact_person} onChange={set("contact_person")} placeholder="Full name" error={errors.contact_person} />
                  <Inp label="Mobile *" value={form.mobile} onChange={set("mobile")} placeholder="10-digit" maxLength={10} error={errors.mobile} />
                  <Inp label="Email *" type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" error={errors.email} />
                  <Inp label="City *" value={form.city} onChange={set("city")} placeholder="Mumbai" error={errors.city} />
                  <Sel label="State" value={form.state} onChange={set("state")}>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </Sel>
                  <Inp label="Pincode" value={form.pincode} onChange={set("pincode")} maxLength={6} />
                  <Inp label="Password *" type="password" value={form.password} onChange={set("password")} placeholder="Min 6 characters" error={errors.password} />
                  <Inp label="Confirm password *" type="password" value={form.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />
                </div>
              )}
              {step===2 && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div style={{ gridColumn:"1/-1", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#1e40af" }}>
                    MSME and TDS details help GDPL comply with legal requirements. All fields are optional unless you are MSME registered.
                  </div>
                  <div style={{ gridColumn:"1/-1" }}>
                    <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>MSME registration type</label>
                    <select value={form.msme_type||"Not Applicable"} onChange={set("msme_type")} style={{ width:"100%", padding:"9px 11px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
                      {["Not Applicable","Micro Enterprise","Small Enterprise","Medium Enterprise"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  {form.msme_type && form.msme_type!=="Not Applicable" && (
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Udyam Registration Number *</label>
                      <input value={form.msme_udyam||""} onChange={set("msme_udyam")} placeholder="UDYAM-MH-27-0000000" style={{ width:"100%", padding:"9px 11px", border:`1px solid ${errors.msme_udyam?T.red:"#e2e8f0"}`, borderRadius:8, fontSize:13 }}/>
                      {errors.msme_udyam && <p style={{ fontSize:11, color:T.red, marginTop:3 }}>{errors.msme_udyam}</p>}
                    </div>
                  )}
                  <Sel label="TDS category" value={form.tds_category||"Not Applicable"} onChange={set("tds_category")}>
                    {["Not Applicable","Individual / HUF","Company","Partnership Firm","LLP","Trust"].map(t=><option key={t}>{t}</option>)}
                  </Sel>
                  <Sel label="Credit period (optional)" value={form.credit_period||"30 days"} onChange={set("credit_period")}>
                    {["Immediate","7 days","15 days","30 days","45 days","60 days","90 days"].map(c=><option key={c}>{c}</option>)}
                  </Sel>
                </div>
              )}
              {step===3 && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <InfoBox>Bank details must match the company name. Used for payment processing.</InfoBox>
                  <Inp label="Bank name *" value={form.bank_name} onChange={set("bank_name")} placeholder="State Bank of India" error={errors.bank_name} />
                  <Sel label="Account type" value={form.account_type} onChange={set("account_type")}>
                    <option>Current</option><option>Savings</option>
                  </Sel>
                  <Inp label="Account number *" value={form.account_number} onChange={set("account_number")} error={errors.account_number} />
                  <Inp label="IFSC code" value={form.ifsc} onChange={set("ifsc")} placeholder="SBIN0001234" maxLength={11} error={errors.ifsc} />
                </div>
              )}
              {step===4 && (
                <div>
                  {[["Company",[[" Name",form.company_name],["PAN",form.pan],["GSTIN",form.gstin||"Not registered"],["Category",form.category]]],
                    ["Contact",[[" Person",form.contact_person],["Mobile",form.mobile],["Email",form.email],["City",`${form.city}, ${form.state}`]]],
                    ["MSME & compliance",[["MSME type",form.msme_type], ["Udyam number",form.msme_udyam||"Not applicable"], ["TDS category",form.tds_category], ["Credit period",form.credit_period]]],
                    ["Bank",[["Bank",form.bank_name],["Account",form.account_number],["IFSC",form.ifsc]]]
                  ].map(([section, fields]) => (
                    <div key={section} style={{ background:T.gray50, borderRadius:10, padding:16, marginBottom:12 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:T.gray700, marginBottom:10 }}>{section} details</div>
                      {fields.map(([l,v]) => (
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${T.gray200}`, fontSize:13 }}>
                          <span style={{ color:T.gray500 }}>{l}</span>
                          <span style={{ fontWeight:500 }}>{v||"–"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding:"16px 26px", borderTop:`1px solid ${T.gray100}`, display:"flex", justifyContent:"space-between" }}>
              <Btn variant="secondary" onClick={step===0?onLoginClick:()=>setStep(s=>s-1)}>{step===0?"Back to login":"← Back"}</Btn>
              {step<REG_STEPS.length-1
                ? <Btn variant="primary" onClick={() => { if(validate()) setStep(s=>s+1); }}>Continue →</Btn>
                : <Btn variant="success" onClick={submit} disabled={saving}>{saving?"Submitting…":"Submit registration"}</Btn>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin, onRegisterClick }) {
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [mode, setMode]       = useState("vendor");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowP]  = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      if (mode==="admin") {
        const { data, error:err } = await sb.from("admin_users").select("*").eq("email",email).eq("password",password).single();
        if (err||!data) { setError("Invalid admin credentials."); setLoading(false); return; }
        onLogin({ role:"admin", name:data.name });
      } else {
        const { data, error:err } = await sb.from("vendors").select("*").eq("email",email).eq("password",password).single();
        if (err||!data) { setError("Email or password is incorrect."); setLoading(false); return; }
        if (data.status==="pending")  { setError("Your account is pending admin approval. You'll be notified once activated."); setLoading(false); return; }
        if (data.status==="rejected") { setError("Your account has been rejected. Contact support@giftingdelight.co.in"); setLoading(false); return; }
        onLogin({ role:"vendor", vendor:data });
      }
    } catch(e) { setError("Login error: "+e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", background:T.gray50 }}>
      <div style={{ width:400, background:T.navy, display:"flex", flexDirection:"column", padding:"40px 40px", flexShrink:0 }}>
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:T.amber, marginBottom:4 }}>GDPL</div>
        <div style={{ fontSize:12, color:"#64748b", marginBottom:48 }}>Gifting Delight Private Limited</div>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:26, fontWeight:800, color:T.white, lineHeight:1.3, marginBottom:16 }}>Vendor<br />Payment Portal</h2>
        <p style={{ fontSize:13, color:"#94a3b8", lineHeight:1.7, marginBottom:40 }}>Submit invoices, track payment status, and manage your account — all in one place.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[["📄","Submit GST-compliant invoices"],["💳","Track payment status in real time"],["🔄","Manage advance payments & adjustments"],["🏦","Secure bank details management"]].map(([icon,text]) => (
            <div key={text} style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ width:32, height:32, background:T.navyMid, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{icon}</div>
              <span style={{ fontSize:13, color:"#cbd5e1" }}>{text}</span>
            </div>
          ))}
        </div>
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:"#475569" }}>© 2025 GDPL. Vendor Portal v2.</div>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ display:"flex", background:T.gray100, borderRadius:10, padding:4, marginBottom:28 }}>
            {["vendor","admin"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", fontWeight:600, fontSize:13, cursor:"pointer", background:mode===m?T.white:"transparent", color:mode===m?T.gray800:T.gray400, boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.1)":"none" }}>
                {m==="admin"?"Admin login":"Vendor login"}
              </button>
            ))}
          </div>
          <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:T.gray800, marginBottom:4 }}>{mode==="admin"?"Admin sign in":"Sign in to your account"}</h2>
          <p style={{ fontSize:13, color:T.gray400, marginBottom:24 }}>{mode==="admin"?"Internal GDPL admin access":"Access your vendor dashboard"}</p>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Inp label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode==="admin"?"admin@giftingdelight.co.in":"you@company.com"} />
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.gray600, marginBottom:5 }}>Password</label>
              <div style={{ position:"relative" }}>
                <input type={showPass?"text":"password"} value={password} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Enter password"
                  style={{ width:"100%", padding:"9px 40px 9px 11px", border:`1px solid ${T.gray200}`, borderRadius:8, fontSize:13, color:T.gray800 }} />
                <button onClick={()=>setShowP(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:T.gray400, fontSize:16, cursor:"pointer" }}>{showPass?"🙈":"👁"}</button>
              </div>
            </div>
            {error && <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", color:T.red, borderRadius:8, padding:"10px 14px", fontSize:13 }}>{error}</div>}
            <Btn variant="primary" onClick={submit} disabled={loading} style={{ width:"100%", justifyContent:"center", padding:"11px 0", fontSize:14 }}>{loading?"Signing in…":"Sign in"}</Btn>
          </div>
          {mode==="vendor" && (
            <div style={{ marginTop:20, paddingTop:20, borderTop:`1px solid ${T.gray200}` }}>
              <p style={{ fontSize:12, color:T.gray400, marginBottom:10 }}>Not registered yet?</p>
              <Btn variant="secondary" onClick={onRegisterClick} style={{ width:"100%", justifyContent:"center" }}>Register as a vendor →</Btn>
            </div>
          )}
         <div style={{ marginTop:24, padding:14, background:T.blueLight, borderRadius:10, fontSize:12 }}>
            <div style={{ fontWeight:600, color:"#1e40af", marginBottom:4 }}>Need help?</div>
            <div style={{ color:"#1e40af" }}>Contact: support@giftingdelight.co.in</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vendor Portal ────────────────────────────────────────────────────────────
function VendorPortal({ vendor, onLogout }) {
  const [page, setPage]           = useState("dashboard");
  const [invoices, setInvoices]   = useState([]);
  const [advances, setAdvances]   = useState([]);
  const [toast, setToast]         = useState(null);
  const [showInvModal, setShowInv] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [showAdvModal, setShowAdv] = useState(false);
  const [loading, setLoading]     = useState(true);

  const toast$ = (msg, type="success") => setToast({ msg, type });

  const loadData = async () => {
    setLoading(true);
    const [{ data:invs }, { data:advs }] = await Promise.all([
      sb.from("invoices").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending:false }),
      sb.from("advance_payments").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending:false }),
    ]);
    setInvoices(invs||[]);
    setAdvances(advs||[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const stats = {
    pending:  invoices.filter(i=>i.status==="pending").length,
    approved: invoices.filter(i=>["approved","processing"].includes(i.status)).length,
    paid:     invoices.filter(i=>i.status==="paid").length,
    onHold:   invoices.filter(i=>i.status==="on_hold").length,
    totalReceivable: invoices.filter(i=>i.status!=="paid").reduce((s,i)=>s+(i.net_payable||i.grand_total||0),0),
    totalPaid: invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+(i.paid_amount||0),0),
    pendingAdv: advances.filter(a=>a.status==="pending").length,
    approvedAdv: advances.filter(a=>a.status==="approved" && !a.adjusted_invoice_id).reduce((s,a)=>s+(+a.amount||0),0),
  };

  const navItems = [
    { id:"dashboard",       label:"Dashboard",        icon:"⊞" },
    { id:"invoices",        label:"My invoices",      icon:"📄" },
    { id:"purchase-orders", label:"Purchase Orders",  icon:"📋" },
    { id:"advances",        label:"Advance payments", icon:"💰" },
    { id:"payments",        label:"Payment history",  icon:"💳" },
    { id:"profile",         label:"My profile",       icon:"👤" },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <div style={{ background:T.navy, height:52, display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0 }}>
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:800, color:T.amber }}>GDPL</div>
        <div style={{ width:1, height:16, background:T.gray600 }} />
        <span style={{ fontSize:12, color:"#94a3b8" }}>Vendor Portal</span>
        <div style={{ flex:1 }} />
        <div style={{ width:28, height:28, borderRadius:"50%", background:T.blue, color:T.white, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>
          {vendor.contact_person?.split(" ").map(w=>w[0]).slice(0,2).join("")}
        </div>
        <span style={{ fontSize:12, color:"#cbd5e1" }}>{vendor.contact_person}</span>
        <Btn size="sm" variant="ghost" onClick={onLogout} style={{ color:"#94a3b8", fontSize:12 }}>Sign out</Btn>
      </div>
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <div style={{ width:210, background:T.white, borderRight:`1px solid ${T.gray200}`, padding:"12px 0", flexShrink:0 }}>
          <div style={{ padding:"8px 16px 16px", borderBottom:`1px solid ${T.gray100}`, marginBottom:8 }}>
            <div style={{ fontSize:11, color:T.gray400, marginBottom:2 }}>Logged in as</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.gray700, lineHeight:1.3, marginBottom:4 }}>{vendor.company_name}</div>
            <Pill status={vendor.status} map={VENDOR_STATUS_META} />
          </div>
          {navItems.map(n => (
            <div key={n.id} onClick={()=>setPage(n.id)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 16px", cursor:"pointer", background:page===n.id?T.blueLight:"transparent", color:page===n.id?T.blue:T.gray600, fontSize:13, fontWeight:page===n.id?600:400, borderLeft:`3px solid ${page===n.id?T.blue:"transparent"}` }}>
              <span style={{ fontSize:15 }}>{n.icon}</span>{n.label}
            </div>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:22, background:T.gray50 }}>
          {loading && <div style={{ textAlign:"center", padding:60, color:T.gray400 }}>Loading…</div>}

          {/* Dashboard */}
          {!loading && page==="dashboard" && (
            <div>
              <div style={{ marginBottom:20 }}>
                <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:20, fontWeight:700, color:T.gray800 }}>Welcome back, {vendor.contact_person?.split(" ")[0]}</h1>
                <p style={{ color:T.gray400, fontSize:13 }}>{vendor.company_name} · {vendor.category}</p>
              </div>
              {stats.onHold>0 && <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:T.red, display:"flex", gap:10, alignItems:"center" }}>
                <span>⚠️</span><span>{stats.onHold} invoice{stats.onHold>1?"s are":" is"} on hold — action needed.</span>
                <Btn size="sm" variant="danger" onClick={()=>setPage("invoices")}>View</Btn>
              </div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
                <StatCard label="Pending review" value={stats.pending} color={T.amber} />
                <StatCard label="Approved" value={stats.approved} color={T.blue} />
                <StatCard label="Paid" value={stats.paid} color={T.green} />
                <StatCard label="On hold" value={stats.onHold} color={T.red} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
                <StatCard label="Receivable outstanding" value={fmtCurrency(stats.totalReceivable)} color={T.orange} />
                <StatCard label="Total received" value={fmtCurrency(stats.totalPaid)} color={T.green} />
                <StatCard label="Advance approved (unadjusted)" value={fmtCurrency(stats.approvedAdv)} color={T.purple} />
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <Btn variant="primary" onClick={()=>setShowInv(true)}>+ Submit invoice</Btn>
                <Btn variant="warning" onClick={()=>setShowAdv(true)}>💰 Request advance</Btn>
              </div>
              <Card>
                <CardH title="Recent invoices" />
                <Tbl
                  cols={[
                    { label:"Invoice #",   render:r=><span style={{ color:T.blue, fontWeight:600 }}>{r.invoice_number||r.id}</span> },
                    { label:"Type",        render:r=><span style={{ fontSize:11 }}>{r.doc_type}</span> },
                    { label:"Date",        render:r=>fmtDate(r.invoice_date) },
                    { label:"PO #",        key:"po_number" },
                    { label:"Grand total", render:r=>fmtCurrency(r.grand_total) },
                    { label:"Net payable", render:r=>fmtCurrency(r.net_payable||r.grand_total) },
                    { label:"Status",      render:r=><Pill status={r.status} /> },
                  ]}
                  rows={invoices.slice(0,6)}
                  emptyMsg="No invoices yet. Submit your first invoice."
                />
              </Card>
            </div>
          )}

          {/* Purchase Orders */}
{!loading && page==="purchase-orders" && (
  <POManagement
    supabase={sb}
    vendors={[vendor]}
    mode="vendor"
    vendorId={vendor?.id}
    onCreateInvoice={(po) => {
      setSelectedPO(po);
      setShowInv(true);
    }}
  />
)}

          {/* Invoices */}
          {!loading && page==="invoices" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800 }}>My invoices</h1>
                <Btn variant="primary" onClick={()=>setShowInv(true)}>+ Submit invoice</Btn>
              </div>
              <Card>
                <Tbl
                  cols={[
                    { label:"Invoice #",    render:r=><span style={{ color:T.blue, fontWeight:600 }}>{r.invoice_number||r.id}</span> },
                    { label:"Type",         render:r=><span style={{ fontSize:11 }}>{r.doc_type}</span> },
                    { label:"Invoice date", render:r=>fmtDate(r.invoice_date) },
                    { label:"PO #",         key:"po_number" },
                    { label:"Taxable",      render:r=>fmtCurrency(r.sub_total) },
                    { label:"GST",          render:r=>r.gst_applicable?fmtCurrency(r.total_gst):"Nil" },
                    { label:"Grand total",  render:r=><strong>{fmtCurrency(r.grand_total)}</strong> },
                    { label:"Advance adj.", render:r=>r.advance_adjusted>0?<span style={{ color:T.orange }}>-{fmtCurrency(r.advance_adjusted)}</span>:"–" },
                    { label:"Net payable",  render:r=><strong style={{ color:T.blue }}>{fmtCurrency(r.net_payable||r.grand_total)}</strong> },
                    { label:"Status",       render:r=><Pill status={r.status} /> },
                    { label:"Hold reason",  render:r=>r.hold_reason?<span style={{ color:T.red, fontSize:11 }}>{r.hold_reason.slice(0,40)}…</span>:"–", wrap:true },
                  ]}
                  rows={invoices}
                  emptyMsg="No invoices submitted yet."
                />
              </Card>
            </div>
          )}

          {/* Reports & Excel */}
          {!loading && page==="reports" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:6 }}>Reports & Excel</h1>
              <p style={{ color:T.gray500, fontSize:13, marginBottom:16 }}>Download operational data as Excel workbooks for reconciliation and reporting.</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:18 }}>
                <Card><CardH title="Vendor master" /><p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>All registered vendors, GST classification, MSME and TDS details.</p><Btn variant="primary" onClick={exportVendors}>⬇ Export vendors</Btn></Card>
                <Card><CardH title="Invoice register" /><p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>Invoice amounts, GST, advances, TDS, payment and status data.</p><Btn variant="primary" onClick={exportInvoices}>⬇ Export invoices</Btn></Card>
                <Card><CardH title="Payment register" /><p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>Recorded payments with UTR, bank, TDS deductions and net paid amounts.</p><Btn variant="primary" onClick={exportPayments}>⬇ Export payments</Btn></Card>
              </div>
              <Card>
                <CardH title="Quick summary" />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  <StatCard label="Vendors" value={vendors.length} color={T.blue} />
                  <StatCard label="Invoices" value={invoices.length} color={T.purple} />
                  <StatCard label="Paid" value={fmtCurrency(stats.totalPaid)} color={T.green} />
                  <StatCard label="Outstanding" value={fmtCurrency(stats.outstanding)} color={T.orange} />
                </div>
              </Card>
            </div>
          )}

          {/* Advances */}
          {!loading && page==="advances" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800 }}>Advance payment requests</h1>
                <Btn variant="warning" onClick={()=>setShowAdv(true)}>💰 New advance request</Btn>
              </div>
              <InfoBox>Advance payments approved here can be linked to your final invoice to adjust the amount payable.</InfoBox>
              <Card>
                <Tbl
                  cols={[
                    { label:"Request date",  render:r=>fmtDate(r.request_date) },
                    { label:"PO #",          key:"po_number" },
                    { label:"Description",   key:"description", wrap:true },
                    { label:"Advance amt",   render:r=><strong>{fmtCurrency(r.amount)}</strong> },
                    { label:"Status",        render:r=><Pill status={r.status} /> },
                    { label:"Payment date",  render:r=>fmtDate(r.payment_date) },
                    { label:"Payment ref",   render:r=>r.payment_ref||"–" },
                    { label:"Adjusted in",   render:r=>r.adjusted_invoice_id?<span style={{ color:T.green, fontSize:11 }}>{r.adjusted_invoice_id}</span>:"–" },
                  ]}
                  rows={advances}
                  emptyMsg="No advance requests yet."
                />
              </Card>
            </div>
          )}

          {/* Payments */}
          {!loading && page==="payments" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>Payment history</h1>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
                <StatCard label="Total received" value={fmtCurrency(stats.totalPaid)} color={T.green} />
                <StatCard label="Outstanding" value={fmtCurrency(stats.totalReceivable)} color={T.amber} />
                <StatCard label="Advance (unadjusted)" value={fmtCurrency(stats.approvedAdv)} color={T.purple} />
              </div>
              <Card>
                <Tbl
                  cols={[
                    { label:"Invoice #",     render:r=><span style={{ color:T.blue, fontWeight:600 }}>{r.invoice_number||r.id}</span> },
                    { label:"Invoice date",  render:r=>fmtDate(r.invoice_date) },
                    { label:"Grand total",   render:r=>fmtCurrency(r.grand_total) },
                    { label:"Amount paid",   render:r=>r.paid_amount?<span style={{ color:T.green, fontWeight:600 }}>{fmtCurrency(r.paid_amount)}</span>:"–" },
                    { label:"Payment date",  render:r=>fmtDate(r.payment_date) },
                    { label:"Mode",          render:r=>r.payment_mode||"–" },
                    { label:"UTR / Ref",     render:r=>r.payment_ref||"–" },
                    { label:"Status",        render:r=><Pill status={r.status} /> },
                  ]}
                  rows={invoices}
                  emptyMsg="No payment history yet."
                />
              </Card>
            </div>
          )}

          {/* Profile */}
          {!loading && page==="profile" && (
            <div style={{ maxWidth:600 }}>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>My profile</h1>
              {[
                ["Company information", [["Company name",vendor.company_name],["GSTIN",vendor.gstin||"Not registered"],["PAN",vendor.pan],["Category",vendor.category]]],
                ["Bank details", [["Bank",vendor.bank_name],["Account",`XXXX${vendor.account_number?.slice(-4)}`],["IFSC",vendor.ifsc],["Type",vendor.account_type]]],
                ["Contact", [["Contact person",vendor.contact_person],["Mobile",vendor.mobile],["Email",vendor.email],["City",`${vendor.city}, ${vendor.state}`]]],
              ].map(([title, fields]) => (
                <Card key={title} style={{ marginBottom:14 }}>
                  <CardH title={title} />
                  <div style={{ padding:"14px 18px" }}>
                    {fields.map(([l,v]) => (
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.gray100}`, fontSize:13 }}>
                        <span style={{ color:T.gray500 }}>{l}</span><span style={{ fontWeight:500 }}>{v||"–"}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {showInvModal && (
  <InvoiceModal
    vendor={vendor}
    advancePayments={advances}
    po={selectedPO}
    onClose={() => {
      setShowInv(false);
      setSelectedPO(null);
    }}
    onSubmit={(id) => {
      setShowInv(false);
      setSelectedPO(null);
      toast$(`Invoice ${id} submitted successfully!`);
      loadData();
    }}
  />
)}
      {showAdvModal && <AdvanceModal vendor={vendor} onClose={()=>setShowAdv(false)} onSubmit={()=>{ setShowAdv(false); toast$("Advance payment request submitted!"); loadData(); }} />}
      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ onLogout }) {
  const [page, setPage]       = useState("dashboard");
  const [vendors, setVendors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [toast, setToast]     = useState(null);
  const [detailVendor, setDV] = useState(null);
  const [detailInv, setDI]    = useState(null);
  const [detailAdv, setDA]    = useState(null);
  const [payModal, setPM]     = useState(null);
  const [holdReason, setHR]   = useState("");
  const [showHold, setSH]     = useState(false);
  const [loading, setLoading] = useState(true);

  const toast$ = (msg, type="success") => setToast({ msg, type });

  const loadAll = async () => {
    setLoading(true);
    const [{ data:vs },{ data:is },{ data:as }] = await Promise.all([
      sb.from("vendors").select("*").order("created_at",{ ascending:false }),
      sb.from("invoices").select("*").order("created_at",{ ascending:false }),
      sb.from("advance_payments").select("*").order("created_at",{ ascending:false }),
    ]);
    setVendors(vs||[]); setInvoices(is||[]); setAdvances(as||[]);
    setLoading(false);
  };

  useEffect(()=>{ loadAll(); },[]);

  const approveVendor = async v => {
    await sb.from("vendors").update({ status:"approved", approved_on: today() }).eq("id",v.id);
    toast$(`${v.company_name} approved!`); setDV(null); loadAll();
  };
  const rejectVendor = async v => {
    await sb.from("vendors").update({ status:"rejected" }).eq("id",v.id);
    toast$(`${v.company_name} rejected.`,"error"); setDV(null); loadAll();
  };
  const approveInv = async inv => {
    await sb.from("invoices").update({ status:"approved" }).eq("id",inv.id);
    toast$(`Invoice ${inv.invoice_number||inv.id} approved!`); setDI(null); setSH(false); loadAll();
  };
  const holdInv = async inv => {
    if (!holdReason) { alert("Enter a hold reason."); return; }
    await sb.from("invoices").update({ status:"on_hold", hold_reason: holdReason }).eq("id",inv.id);
    toast$(`Invoice placed on hold.`,"error"); setDI(null); setSH(false); setHR(""); loadAll();
  };
  const rejectInv = async inv => {
    await sb.from("invoices").update({ status:"rejected" }).eq("id",inv.id);
    toast$(`Invoice rejected.`,"error"); setDI(null); loadAll();
  };
  const markPaid = async (inv, form) => {
    await sb.from("invoices").update({ status:"paid", payment_date:form.paymentDate, payment_mode:form.mode, payment_ref:form.reference, paid_amount:+form.amount, payment_bank:form.ourBank||form.bank||null, payment_remarks:form.remarks, tds_applicable:!!form.tdsApplicable, tds_section:form.tdsApplicable?form.tdsSection:null, tds_rate:form.tdsApplicable?(+form.tdsRate||0):0, tds_amount:form.tdsApplicable?(+form.tdsAmount||0):0 }).eq("id",inv.id);
    toast$(`Payment recorded for ${inv.invoice_number||inv.id}!`); setPM(null); setDI(null); loadAll();
  };
  const approveAdv = async adv => {
    await sb.from("advance_payments").update({ status:"approved" }).eq("id",adv.id);
    toast$(`Advance request approved!`); setDA(null); loadAll();
  };
  const markAdvPaid = async (adv, form) => {
    await sb.from("advance_payments").update({ status:"paid", payment_date:form.paymentDate, payment_ref:form.reference, payment_mode:form.mode, amount:+form.amount }).eq("id",adv.id);
    toast$(`Advance payment recorded!`); setDA(null); loadAll();
  };

  const stats = {
    pendingVendors:  vendors.filter(v=>v.status==="pending").length,
    approvedVendors: vendors.filter(v=>v.status==="approved").length,
    pendingInvoices: invoices.filter(i=>i.status==="pending").length,
    onHold:          invoices.filter(i=>i.status==="on_hold").length,
    totalPaid:       invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+(i.paid_amount||0),0),
    outstanding:     invoices.filter(i=>!["paid","rejected"].includes(i.status)).reduce((s,i)=>s+(i.net_payable||i.grand_total||0),0),
    pendingAdv:      advances.filter(a=>a.status==="pending").length,
  };

  const getVendor = id => vendors.find(v=>v.id===id);

  const downloadExcel = (rows, filename, sheetName = "Report") => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
  
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
  };

    const exportVendors = () => downloadExcel(vendors.map(v=>({
      ID:v.id, Company:v.company_name, GSTIN:v.gstin||"", GST_Type:getGSTType(v.gstin).label, PAN:v.pan||"", Category:v.category||"", MSME_Type:v.msme_type||"Not Applicable", Udyam:v.msme_udyam||"", TDS_Category:v.tds_category||"Not Applicable", Credit_Period:v.credit_period||"", Contact:v.contact_person||"", Mobile:v.mobile||"", Email:v.email||"", City:v.city||"", State:v.state||"", Status:v.status||""
    })), `vendors-${today()}.xlsx`, "Vendors");
    const exportInvoices = () => {
      const rows = [];
    
      invoices.forEach(i => {
        const vendor = getVendor(i.vendor_id);
    
        const items =
          i.items ||
          i.invoice_items ||
          i.products ||
          i.line_items ||
          [];
    
        if (Array.isArray(items) && items.length > 0) {
          items.forEach(item => {
            rows.push({
              Invoice: i.invoice_number || i.id,
              Vendor: vendor?.company_name || "",
              GSTIN: vendor?.gstin || "",
              GST_Type: i.gst_type || getGSTType(vendor?.gstin).type,
              Invoice_Date: i.invoice_date || "",
              PO: i.po_number || "",
    
              // Product / item details
              Description: item.description || "",
              HSN_SAC: item.hsn_sac || item.hsn || item.sac || "",
              Unit: item.unit || "",
              Qty: item.qty || item.quantity || 0,
              Rate: item.rate || 0,
              Taxable: item.taxable || item.taxable_amount || 0,
              GST_Percent: item.gst_percent || item.gst_rate || 0,
              GST_Amount: item.gst_amt || item.gst_amount || 0,
              Item_Total: item.total || item.total_amount || 0,
    
              // Invoice-level GST
              CGST: i.cgst || 0,
              SGST: i.sgst || 0,
              IGST: i.igst || 0,
    
              // IMPORTANT:
              // Full invoice total repeated on EVERY product line
              Grand_Total: i.grand_total || 0,
    
              Advance_Adjusted: i.advance_adjusted || 0,
              Net_Payable: i.net_payable || i.grand_total || 0,
    
              TDS_Applicable: i.tds_applicable ? "Yes" : "No",
              TDS_Section: i.tds_section || "",
              TDS_Rate: i.tds_rate || 0,
              TDS_Amount: i.tds_amount || 0,
    
              Paid_Amount: i.paid_amount || 0,
              Payment_Date: i.payment_date || "",
              Payment_Mode: i.payment_mode || "",
              Payment_Ref: i.payment_ref || "",
              Payment_Bank: i.payment_bank || "",
    
              Status: i.status || ""
            });
          });
        } else {
          // Invoice without item details
          rows.push({
            Invoice: i.invoice_number || i.id,
            Vendor: vendor?.company_name || "",
            GSTIN: vendor?.gstin || "",
            GST_Type: i.gst_type || getGSTType(vendor?.gstin).type,
            Invoice_Date: i.invoice_date || "",
            PO: i.po_number || "",
    
            Description: "",
            HSN_SAC: "",
            Unit: "",
            Qty: 0,
            Rate: 0,
            Taxable: i.sub_total || 0,
            GST_Percent: 0,
            GST_Amount: 0,
            Item_Total: i.grand_total || 0,
    
            CGST: i.cgst || 0,
            SGST: i.sgst || 0,
            IGST: i.igst || 0,
    
            Grand_Total: i.grand_total || 0,
    
            Advance_Adjusted: i.advance_adjusted || 0,
            Net_Payable: i.net_payable || i.grand_total || 0,
    
            TDS_Applicable: i.tds_applicable ? "Yes" : "No",
            TDS_Section: i.tds_section || "",
            TDS_Rate: i.tds_rate || 0,
            TDS_Amount: i.tds_amount || 0,
    
            Paid_Amount: i.paid_amount || 0,
            Payment_Date: i.payment_date || "",
            Payment_Mode: i.payment_mode || "",
            Payment_Ref: i.payment_ref || "",
            Payment_Bank: i.payment_bank || "",
    
            Status: i.status || ""
          });
        }
      });
    
      downloadExcel(
        rows,
        `invoices-${today()}.xlsx`,
        "Invoices"
      );
    };
    const exportPayments = () => downloadExcel(invoices.map(i=>({
      Invoice:i.invoice_number||i.id, Vendor:getVendor(i.vendor_id)?.company_name||"", Amount_Paid:i.paid_amount||0, Payment_Date:i.payment_date||"", Payment_Mode:i.payment_mode||"", UTR_Reference:i.payment_ref||"", Bank:i.payment_bank||"", TDS_Amount:i.tds_amount||0, Net_After_TDS:((+i.paid_amount||0)-(+i.tds_amount||0)), Remarks:i.payment_remarks||""
    })), `payments-${today()}.xlsx`, "Payments");

    const navItems = [
      { id:"dashboard", label:"Dashboard",    icon:"⊞" },
      { id:"vendors",   label:"Vendors",      icon:"🏢", badge:stats.pendingVendors },
      { id:"purchase-orders", label:"Purchase Orders",  icon:"📋" },
      { id:"invoices",  label:"Invoices",     icon:"📄", badge:stats.pendingInvoices },
      { id:"advances",  label:"Advances",     icon:"💰", badge:stats.pendingAdv },
      { id:"payments",  label:"Payments",     icon:"💳" },
      { id:"reports",   label:"Reports & Excel", icon:"📊" },
    ];

    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
        <div style={{ background:T.navy, height:52, display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0 }}>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:800, color:T.amber }}>GDPL</div>
          <div style={{ width:1, height:16, background:T.gray600 }} />
          <span style={{ fontSize:12, color:"#94a3b8" }}>Admin — Vendor Management</span>
          <div style={{ flex:1 }} />
          <div style={{ width:28, height:28, borderRadius:"50%", background:T.orange, color:T.white, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>AD</div>
          <span style={{ fontSize:12, color:"#cbd5e1" }}>GDPL Admin</span>
          <Btn size="sm" variant="ghost" onClick={onLogout} style={{ color:"#94a3b8", fontSize:12 }}>Sign out</Btn>
        </div>

        <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
          <div style={{ width:210, background:T.white, borderRight:`1px solid ${T.gray200}`, padding:"12px 0", flexShrink:0 }}>
            {navItems.map(n => (
              <div key={n.id} onClick={()=>setPage(n.id)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 16px", cursor:"pointer", background:page===n.id?T.blueLight:"transparent", color:page===n.id?T.blue:T.gray600, fontSize:13, fontWeight:page===n.id?600:400, borderLeft:`3px solid ${page===n.id?T.blue:"transparent"}` }}>
                <span style={{ fontSize:15 }}>{n.icon}</span>
                <span style={{ flex:1 }}>{n.label}</span>
                {n.badge>0 && <span style={{ background:T.red, color:T.white, borderRadius:10, fontSize:10, fontWeight:700, padding:"1px 6px" }}>{n.badge}</span>}
              </div>
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:22, background:T.gray50 }}>
            {loading && <div style={{ textAlign:"center", padding:60, color:T.gray400 }}>Loading…</div>}

          {/* Admin Dashboard */}
          {!loading && page==="dashboard" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:20, fontWeight:700, color:T.gray800, marginBottom:20 }}>Admin dashboard</h1>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
                <StatCard label="Vendors pending approval" value={stats.pendingVendors} color={T.amber} sub={`${stats.approvedVendors} approved total`} />
                <StatCard label="Invoices pending review" value={stats.pendingInvoices} color={T.blue} />
                <StatCard label="Invoices on hold" value={stats.onHold} color={T.red} />
                <StatCard label="Total paid (all time)" value={fmtCurrency(stats.totalPaid)} color={T.green} />
                <StatCard label="Outstanding payable" value={fmtCurrency(stats.outstanding)} color={T.orange} />
                <StatCard label="Advance requests pending" value={stats.pendingAdv} color={T.purple} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <Card>
                  <CardH title="Vendors awaiting approval" right={<Btn size="sm" variant="ghost" onClick={()=>setPage("vendors")}>View all →</Btn>} />
                  <Tbl
                    cols={[
                      { label:"Company", render:v=><span style={{ color:T.blue, cursor:"pointer", fontWeight:500 }} onClick={()=>setDV(v)}>{v.company_name}</span> },
                      { label:"Category", key:"category" },
                      { label:"Registered", render:v=>fmtDate(v.registered_on||v.created_at) },
                      { label:"Action", render:v=>v.status==="pending"?<div style={{ display:"flex", gap:6 }}><Btn size="sm" variant="success" onClick={()=>approveVendor(v)}>Approve</Btn><Btn size="sm" variant="danger" onClick={()=>rejectVendor(v)}>Reject</Btn></div>:<Pill status={v.status} map={VENDOR_STATUS_META} /> },
                    ]}
                    rows={vendors.filter(v=>v.status==="pending")}
                    emptyMsg="No vendors pending"
                  />
                </Card>
                <Card>
                  <CardH title="Invoices pending review" right={<Btn size="sm" variant="ghost" onClick={()=>setPage("invoices")}>View all →</Btn>} />
                  <Tbl
                    cols={[
                      { label:"Invoice #", render:i=><span style={{ color:T.blue, cursor:"pointer", fontWeight:500 }} onClick={()=>setDI(i)}>{i.invoice_number||i.id}</span> },
                      { label:"Vendor", render:i=>getVendor(i.vendor_id)?.company_name?.split(" ").slice(0,2).join(" ")||"–" },
                      { label:"Type", render:i=><span style={{ fontSize:11 }}>{i.doc_type}</span> },
                      { label:"Amount", render:i=>fmtCurrency(i.grand_total) },
                      { label:"Status", render:i=><Pill status={i.status} /> },
                    ]}
                    rows={invoices.filter(i=>i.status==="pending")}
                    emptyMsg="No pending invoices"
                  />
                </Card>
              </div>
            </div>
          )}

          {/* Vendors */}
          {!loading && page==="vendors" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>Vendor management</h1>
              <Card>
                <Tbl
                  cols={[
                    { label:"ID", key:"id" },
                    { label:"Company", render:v=><span style={{ color:T.blue, fontWeight:600, cursor:"pointer" }} onClick={()=>setDV(v)}>{v.company_name}</span> },
                    { label:"Contact", key:"contact_person" },
                    { label:"Mobile", key:"mobile" },
                    { label:"Category", key:"category" },
                    { label:"GSTIN", render:v=><div style={{ display:"flex", flexDirection:"column", gap:4 }}>{v.gstin||<span style={{ color:T.gray400, fontSize:11 }}>Unregistered</span>}<GSTTag gstin={v.gstin}/></div> },
                    { label:"Status", render:v=><Pill status={v.status} map={VENDOR_STATUS_META} /> },
                    { label:"Actions", render:v=>v.status==="pending"?(<div style={{ display:"flex", gap:5 }}><Btn size="sm" variant="success" onClick={()=>approveVendor(v)}>Approve</Btn><Btn size="sm" variant="danger" onClick={()=>rejectVendor(v)}>Reject</Btn></div>):<Btn size="sm" variant="ghost" onClick={()=>setDV(v)}>View</Btn> },
                  ]}
                  rows={vendors}
                  emptyMsg="No vendors registered yet"
                />
              </Card>
            </div>
          )}

           {/* Purchase Orders */}
{!loading && page==="purchase-orders" && (
  <POManagement
    supabase={sb}
    vendors={vendors}
    mode="admin"
  />
)}

          {/* Invoices */}
          {!loading && page==="invoices" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>Invoice management</h1>
              <Card>
                <Tbl
                  cols={[
                    { label:"Invoice #", render:i=><span style={{ color:T.blue, fontWeight:600, cursor:"pointer" }} onClick={()=>setDI(i)}>{i.invoice_number||i.id}</span> },
                    { label:"Type", render:i=><span style={{ fontSize:11 }}>{i.doc_type}</span> },
                    { label:"Vendor", render:i=>getVendor(i.vendor_id)?.company_name?.split(" ").slice(0,2).join(" ")||"–" },
                    { label:"Invoice date", render:i=>fmtDate(i.invoice_date) },
                    { label:"PO #", key:"po_number" },
                    { label:"Taxable", render:i=>fmtCurrency(i.sub_total) },
                    { label:"GST", render:i=>i.gst_applicable?fmtCurrency(i.total_gst):"Nil" },
                    { label:"Grand total", render:i=><strong>{fmtCurrency(i.grand_total)}</strong> },
                    { label:"Advance adj.", render:i=>i.advance_adjusted>0?<span style={{ color:T.orange }}>-{fmtCurrency(i.advance_adjusted)}</span>:"–" },
                    { label:"Net payable", render:i=><strong style={{ color:T.blue }}>{fmtCurrency(i.net_payable||i.grand_total)}</strong> },
                    { label:"Status", render:i=><Pill status={i.status} /> },
                    { label:"Actions", render:i=>(
                      <div style={{ display:"flex", gap:4 }}>
                        {i.status==="pending" && <><Btn size="sm" variant="success" onClick={()=>approveInv(i)}>Approve</Btn><Btn size="sm" variant="danger" onClick={()=>{setDI(i);setSH(true)}}>Hold</Btn></>}
                        {i.status==="approved" && <Btn size="sm" variant="primary" onClick={()=>setPM(i)}>Mark paid</Btn>}
                        {i.file_url && <Btn size="sm" variant="ghost" onClick={()=>window.open(i.file_url)}>📎</Btn>}
                      </div>
                    )},
                  ]}
                  rows={invoices}
                  emptyMsg="No invoices yet"
                />
              </Card>
            </div>
          )}

          {/* Advances */}
          {!loading && page==="advances" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>Advance payment requests</h1>
              <Card>
                <Tbl
                  cols={[
                    { label:"Date", render:a=>fmtDate(a.request_date) },
                    { label:"Vendor", render:a=>getVendor(a.vendor_id)?.company_name?.split(" ").slice(0,2).join(" ")||"–" },
                    { label:"PO #", key:"po_number" },
                    { label:"Description", key:"description", wrap:true },
                    { label:"Order value", render:a=>fmtCurrency(a.total_order_value) },
                    { label:"Advance req.", render:a=><strong>{fmtCurrency(a.amount)}</strong> },
                    { label:"Status", render:a=><Pill status={a.status} /> },
                    { label:"Adjusted in", render:a=>a.adjusted_invoice_id||"–" },
                    { label:"Actions", render:a=>(
                      <div style={{ display:"flex", gap:4 }}>
                        {a.status==="pending" && <Btn size="sm" variant="success" onClick={()=>approveAdv(a)}>Approve</Btn>}
                        {a.status==="approved" && !a.adjusted_invoice_id && <Btn size="sm" variant="primary" onClick={()=>setDA(a)}>Record payment</Btn>}
                        {a.file_url && <Btn size="sm" variant="ghost" onClick={()=>window.open(a.file_url)}>📎</Btn>}
                      </div>
                    )},
                  ]}
                  rows={advances}
                  emptyMsg="No advance requests"
                />
              </Card>
            </div>
          )}
          {/* Reports & Excel */}
          {!loading && page==="reports" && (
            <div>
              <div style={{ marginBottom:20 }}>
                <h1 style={{
                  fontFamily:"'Plus Jakarta Sans',sans-serif",
                  fontSize:20,
                  fontWeight:700,
                  color:T.gray800,
                  marginBottom:6
                }}>
                  Reports & Excel
                </h1>
                <p style={{ color:T.gray500, fontSize:13 }}>
                  Download operational data as Excel workbooks for reconciliation and reporting.
                </p>
              </div>

              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(3,1fr)",
                gap:14,
                marginBottom:18
              }}>
                <Card>
                  <CardH title="Vendor master" />
                  <p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>
                    All registered vendors, GST classification, MSME and TDS details.
                  </p>
                  <Btn variant="primary" onClick={exportVendors}>
                    ⬇ Export vendors
                  </Btn>
                </Card>

                <Card>
                  <CardH title="Invoice register" />
                  <p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>
                    Invoice amounts, GST, advances, TDS, payment and status data.
                  </p>
                  <Btn variant="primary" onClick={exportInvoices}>
                    ⬇ Export invoices
                  </Btn>
                </Card>

                <Card>
                  <CardH title="Payment register" />
                  <p style={{ color:T.gray500, fontSize:12, marginBottom:14 }}>
                    Recorded payments with UTR, bank, TDS deductions and net paid amounts.
                  </p>
                  <Btn variant="primary" onClick={exportPayments}>
                    ⬇ Export payments
                  </Btn>
                </Card>
              </div>

              <Card>
                <CardH title="Quick summary" />

                <div style={{
                  display:"grid",
                  gridTemplateColumns:"repeat(4,1fr)",
                  gap:12
                }}>
                  <StatCard
                    label="Vendors"
                    value={vendors.length}
                    color={T.blue}
                  />

                  <StatCard
                    label="Invoices"
                    value={invoices.length}
                    color={T.purple}
                  />

                  <StatCard
                    label="Paid"
                    value={fmtCurrency(stats.totalPaid)}
                    color={T.green}
                  />

                  <StatCard
                    label="Outstanding"
                    value={fmtCurrency(stats.outstanding)}
                    color={T.orange}
                  />
                </div>
              </Card>
            </div>
          )}
          {/* Payments */}
          {!loading && page==="payments" && (
            <div>
              <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:700, color:T.gray800, marginBottom:16 }}>Payment records</h1>
              <Card>
                <Tbl
                  cols={[
                    { label:"Invoice #",   render:i=><span style={{ color:T.blue, fontWeight:600 }}>{i.invoice_number||i.id}</span> },
                    { label:"Vendor",      render:i=>getVendor(i.vendor_id)?.company_name?.split(" ").slice(0,2).join(" ")||"–" },
                    { label:"Grand total", render:i=>fmtCurrency(i.grand_total) },
                    { label:"Amt paid",    render:i=>i.paid_amount?<span style={{ color:T.green, fontWeight:600 }}>{fmtCurrency(i.paid_amount)}</span>:"–" },
                    { label:"Payment date",render:i=>fmtDate(i.payment_date) },
                    { label:"Mode",        render:i=>i.payment_mode||"–" },
                    { label:"UTR / Ref",   render:i=>i.payment_ref||"–" },
                    { label:"Status",      render:i=><Pill status={i.status} /> },
                  ]}
                  rows={invoices}
                  emptyMsg="No payment records"
                />
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Vendor detail modal */}
      {detailVendor && (
        <Modal title={detailVendor.company_name} onClose={()=>setDV(null)} width={640}
          footer={detailVendor.status==="pending"?<><Btn variant="danger" onClick={()=>rejectVendor(detailVendor)}>Reject</Btn><Btn variant="success" onClick={()=>approveVendor(detailVendor)}>Approve vendor</Btn></>:<Btn variant="secondary" onClick={()=>setDV(null)}>Close</Btn>}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[["Company name",detailVendor.company_name],["GSTIN",detailVendor.gstin||"Unregistered"],["PAN",detailVendor.pan],["Category",detailVendor.category],["Contact",detailVendor.contact_person],["Mobile",detailVendor.mobile],["Email",detailVendor.email],["City",`${detailVendor.city}, ${detailVendor.state}`],["Bank",detailVendor.bank_name],["Account #",detailVendor.account_number],["IFSC",detailVendor.ifsc],["Registered",fmtDate(detailVendor.created_at)]].map(([l,v]) => (
              <div key={l} style={{ background:T.gray50, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:11, color:T.gray400, marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:500, color:T.gray800 }}>{v||"–"}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Invoice detail + hold modal */}
      {detailInv && (
        <Modal title={`Invoice ${detailInv.invoice_number||detailInv.id}`} onClose={()=>{setDI(null);setSH(false);setHR("")}} width={680}
          footer={<div style={{ display:"flex", gap:8 }}>
            {detailInv.status==="pending" && <><Btn variant="danger" onClick={()=>setSH(v=>!v)}>Place on hold</Btn><Btn variant="secondary" onClick={()=>rejectInv(detailInv)}>Reject</Btn><Btn variant="success" onClick={()=>approveInv(detailInv)}>Approve</Btn></>}
            {detailInv.status==="approved" && <Btn variant="primary" onClick={()=>{setPM(detailInv);setDI(null)}}>Mark as paid</Btn>}
            {detailInv.file_url && <Btn variant="ghost" onClick={()=>window.open(detailInv.file_url)}>📎 View document</Btn>}
            <Btn variant="ghost" onClick={()=>{setDI(null);setSH(false)}}>Close</Btn>
          </div>}>
          <div style={{ background:T.gray50, borderRadius:8, padding:12, marginBottom:14, fontSize:12, color:T.gray600 }}>
            <strong>Vendor:</strong> {getVendor(detailInv.vendor_id)?.company_name} &nbsp;|&nbsp; GSTIN: {getVendor(detailInv.vendor_id)?.gstin||"Unregistered"} &nbsp;|&nbsp; <GSTTag gstin={getVendor(detailInv.vendor_id)?.gstin}/> &nbsp;|&nbsp; Type: {detailInv.doc_type}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
            {[["Invoice #",detailInv.invoice_number],["Invoice date",fmtDate(detailInv.invoice_date)],["PO number",detailInv.po_number],["Sub-total (taxable)",fmtCurrency(detailInv.sub_total)],["Total GST",detailInv.gst_applicable?fmtCurrency(detailInv.total_gst):"Nil (Not applicable)"],["Grand total",fmtCurrency(detailInv.grand_total)],["Advance adjusted",fmtCurrency(detailInv.advance_adjusted)],["Net payable",fmtCurrency(detailInv.net_payable||detailInv.grand_total)],["GST type",detailInv.gst_applicable?(detailInv.supply_state==="Maharashtra"?"CGST + SGST":"IGST"):"Not applicable"]].map(([l,v]) => (
              <div key={l} style={{ background:T.gray50, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:11, color:T.gray400, marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:l.includes("payable")||l.includes("total")?700:500, color:l.includes("payable")?T.blue:T.gray800 }}>{v||"–"}</div>
              </div>
            ))}
          </div>
          {detailInv.hold_reason && <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color:T.red }}><strong>Hold reason:</strong> {detailInv.hold_reason}</div>}
          {showHold && (
            <div style={{ marginTop:14, padding:14, border:`1px solid ${T.red}`, borderRadius:8, background:"#fff5f5" }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.red, marginBottom:6 }}>Hold reason (shown to vendor) *</label>
              <textarea value={holdReason} onChange={e=>setHR(e.target.value)} rows={3} style={{ width:"100%", padding:"8px 10px", border:`1px solid #fca5a5`, borderRadius:8, fontSize:13, resize:"vertical" }} placeholder="Explain the reason for hold…" />
              <Btn variant="danger" onClick={()=>holdInv(detailInv)} style={{ marginTop:8 }}>Confirm hold</Btn>
            </div>
          )}
        </Modal>
      )}

      {/* Advance payment modal */}
      {detailAdv && (
        <Modal title="Record advance payment" onClose={()=>setDA(null)}
          footer={<><Btn variant="secondary" onClick={()=>setDA(null)}>Cancel</Btn><Btn variant="primary" onClick={()=>{ const f={ paymentDate:today(), amount:detailAdv.amount, mode:"NEFT", reference:"" }; markAdvPaid(detailAdv,f); }}>Confirm payment</Btn></>}>
          <PaymentModal invoice={{ ...detailAdv, grand_total:detailAdv.amount, net_payable:detailAdv.amount }} onClose={()=>setDA(null)} onConfirm={form=>markAdvPaid(detailAdv,form)} />
        </Modal>
      )}

      {payModal && <PaymentModal invoice={payModal} onClose={()=>setPM(null)} onConfirm={form=>markPaid(payModal,form)} />}
      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]       = useState("login");
  const [session, setSession] = useState(null);

  const login  = sess => { setSession(sess); setView(sess.role); };
  const logout = ()   => { setSession(null);  setView("login"); };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {view==="register" && <RegistrationPage onSuccess={()=>setView("login")} onLoginClick={()=>setView("login")} />}
      {view==="login"    && <LoginPage onLogin={login} onRegisterClick={()=>setView("register")} />}
      {view==="vendor"   && session?.vendor && <VendorPortal vendor={session.vendor} onLogout={logout} />}
      {view==="admin"    && <AdminPanel onLogout={logout} />}
    </>
  );
}
