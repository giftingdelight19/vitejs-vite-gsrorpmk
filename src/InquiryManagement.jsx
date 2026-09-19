import { useEffect, useMemo, useState } from "react";

const STATUSES = ["New", "Contacted", "Quotation Sent", "Negotiation", "Won", "Lost", "On Hold"];
const SOURCES = ["Website", "WhatsApp", "Email", "Phone", "Referral", "Existing Customer", "Other"];
const product = () => ({ product_name:"", description:"", quantity:"", unit:"pcs", budget_per_unit:"", total_budget:"" });
const blank = () => ({ customer_name:"", contact_name:"", contact_phone:"", contact_email:"", requirement:"", expected_delivery_date:"", source:"Website", status:"New", notes:"", products:[product()] });
const inp = { width:"100%", padding:"10px 11px", border:"1px solid #cbd5e1", borderRadius:8, fontSize:13, background:"#fff" };
const btn = { border:0, borderRadius:8, padding:"9px 14px", fontWeight:600, cursor:"pointer" };

function Field({ label, required, children }) {
  return <div><label style={{ display:"block", marginBottom:5, fontSize:12, fontWeight:600, color:"#475569" }}>{label}{required && " *"}</label>{children}</div>;
}

function InquiryForm({ supabase, publicMode=false, initialValue, onSaved, onCancel }) {
  const [form, setForm] = useState(initialValue || blank());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key, value) => setForm(f => ({ ...f, [key]:value }));
  const setProduct = (index, key, value) => setForm(f => ({ ...f, products:f.products.map((p,i) => i===index ? { ...p, [key]:value } : p) }));

  async function save(e) {
    e.preventDefault(); setMessage("");
    if (!form.contact_name.trim() || !form.contact_phone.trim() || !form.requirement.trim()) {
      setMessage("Please enter your name, phone number and requirement."); return;
    }
    setSaving(true);
    const products = form.products.filter(p => p.product_name.trim()).map(p => ({ ...p, quantity:p.quantity===""?null:Number(p.quantity), budget_per_unit:p.budget_per_unit===""?null:Number(p.budget_per_unit), total_budget:p.total_budget===""?null:Number(p.total_budget) }));
    const payload = { customer_name:form.customer_name.trim()||null, contact_name:form.contact_name.trim(), contact_phone:form.contact_phone.trim(), contact_email:form.contact_email.trim()||null, requirement:form.requirement.trim(), expected_delivery_date:form.expected_delivery_date||null, source:publicMode?"Website":form.source, status:publicMode?"New":form.status, notes:form.notes.trim()||null, products, updated_at:new Date().toISOString() };
    const result = form.id ? await supabase.from("inquiries").update(payload).eq("id",form.id) : await supabase.from("inquiries").insert([{ ...payload, inquiry_date:new Date().toISOString().slice(0,10) }]);
    setSaving(false);
    if (result.error) { setMessage(`Unable to save inquiry: ${result.error.message}`); return; }
    if (publicMode) { setForm(blank()); setMessage("Thank you. Your inquiry has been submitted successfully. Our team will contact you shortly."); }
    else onSaved?.();
  }

  return <form onSubmit={save} style={{ display:"grid", gap:15 }}>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
      <Field label="Company / customer name"><input style={inp} value={form.customer_name} onChange={e=>set("customer_name",e.target.value)} /></Field>
      <Field label="Contact person" required><input style={inp} value={form.contact_name} onChange={e=>set("contact_name",e.target.value)} /></Field>
      <Field label="Phone / mobile" required><input style={inp} value={form.contact_phone} onChange={e=>set("contact_phone",e.target.value)} /></Field>
      <Field label="Email"><input type="email" style={inp} value={form.contact_email} onChange={e=>set("contact_email",e.target.value)} /></Field>
      <Field label="Expected delivery date"><input type="date" style={inp} value={form.expected_delivery_date||""} onChange={e=>set("expected_delivery_date",e.target.value)} /></Field>
      {!publicMode && <Field label="Source"><select style={inp} value={form.source} onChange={e=>set("source",e.target.value)}>{SOURCES.map(x=><option key={x}>{x}</option>)}</select></Field>}
      {!publicMode && <Field label="Status"><select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>{STATUSES.map(x=><option key={x}>{x}</option>)}</select></Field>}
    </div>
    <Field label="Requirement" required><textarea rows={4} style={{ ...inp, resize:"vertical" }} value={form.requirement} onChange={e=>set("requirement",e.target.value)} placeholder="Tell us what you need, quantity, branding, budget and delivery location." /></Field>
    <div><div style={{ fontSize:12, fontWeight:600, color:"#475569", marginBottom:8 }}>Products</div>
      {form.products.map((p,index)=><div key={index} style={{ display:"grid", gridTemplateColumns:"repeat(6,minmax(100px,1fr)) auto", gap:7, marginBottom:8, alignItems:"center" }}>
        <input style={inp} placeholder="Product" value={p.product_name} onChange={e=>setProduct(index,"product_name",e.target.value)} />
        <input style={inp} placeholder="Specifications" value={p.description} onChange={e=>setProduct(index,"description",e.target.value)} />
        <input type="number" min="0" style={inp} placeholder="Qty" value={p.quantity} onChange={e=>setProduct(index,"quantity",e.target.value)} />
        <input style={inp} placeholder="Unit" value={p.unit} onChange={e=>setProduct(index,"unit",e.target.value)} />
        <input type="number" min="0" style={inp} placeholder="Budget/unit" value={p.budget_per_unit} onChange={e=>setProduct(index,"budget_per_unit",e.target.value)} />
        <input type="number" min="0" style={inp} placeholder="Total budget" value={p.total_budget} onChange={e=>setProduct(index,"total_budget",e.target.value)} />
        <button type="button" onClick={()=>setForm(f=>({ ...f,products:f.products.length===1?[product()]:f.products.filter((_,i)=>i!==index) }))} style={{ ...btn,color:"#dc2626",background:"#fee2e2" }}>×</button>
      </div>)}
      <button type="button" onClick={()=>setForm(f=>({ ...f,products:[...f.products,product()] }))} style={{ ...btn,color:"#1e56d9",background:"#e8effd" }}>+ Add product</button>
    </div>
    <Field label="Additional notes"><textarea rows={2} style={{ ...inp,resize:"vertical" }} value={form.notes||""} onChange={e=>set("notes",e.target.value)} /></Field>
    {message && <div style={{ padding:11,borderRadius:8,background:message.startsWith("Thank")?"#dcfce7":"#fee2e2",color:message.startsWith("Thank")?"#166534":"#b91c1c",fontSize:13 }}>{message}</div>}
    <div style={{ display:"flex",justifyContent:"flex-end",gap:8 }}>{onCancel&&<button type="button" onClick={onCancel} style={{ ...btn,background:"#f1f5f9",color:"#334155" }}>Cancel</button>}<button disabled={saving} style={{ ...btn,background:"#1e56d9",color:"#fff",opacity:saving?.6:1 }}>{saving?"Saving…":publicMode?"Submit inquiry":"Save inquiry"}</button></div>
  </form>;
}

export function PublicInquiryPage({ supabase, onBackToLogin }) {
  return <div style={{ minHeight:"100vh",background:"#f8fafc",padding:24 }}><div style={{ maxWidth:1050,margin:"0 auto" }}>
    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}><div><div style={{ fontSize:22,fontWeight:800,color:"#0f1f3d" }}>GDPL</div><div style={{ color:"#64748b",fontSize:13 }}>Gifting Delight Private Limited</div></div><button onClick={onBackToLogin} style={{ ...btn,background:"#fff",border:"1px solid #cbd5e1",color:"#334155" }}>Portal login</button></div>
    <div style={{ background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:24,boxShadow:"0 8px 28px rgba(15,31,61,.06)" }}><h1 style={{ margin:0,color:"#0f1f3d",fontSize:24 }}>Send us your inquiry</h1><p style={{ color:"#64748b",margin:"6px 0 22px" }}>No login is required. Share your requirement and our team will contact you.</p><InquiryForm supabase={supabase} publicMode /></div>
  </div></div>;
}

export default function InquiryManagement({ supabase }) {
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[editing,setEditing]=useState(null),[search,setSearch]=useState("");
  async function load(){ setLoading(true);setError("");const {data,error:e}=await supabase.from("inquiries").select("*").order("created_at",{ascending:false});if(e)setError(e.message);else setRows(data||[]);setLoading(false); }
  useEffect(()=>{load();},[]);
  const filtered=useMemo(()=>rows.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase())),[rows,search]);
  if(editing)return <div><h1 style={{fontSize:20,marginBottom:16}}>{editing.id?"Edit inquiry":"Add inquiry"}</h1><div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20}}><InquiryForm supabase={supabase} initialValue={{...blank(),...editing,products:Array.isArray(editing.products)&&editing.products.length?editing.products:[product()]}} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);load();}} /></div></div>;
  return <div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><div style={{flex:1}}><h1 style={{fontSize:20,margin:0}}>Leads & Inquiries</h1><div style={{color:"#64748b",fontSize:12}}>Review public inquiries, complete missing information and update action status.</div></div><button onClick={()=>setEditing(blank())} style={{...btn,background:"#1e56d9",color:"#fff"}}>+ Add inquiry</button></div>
    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}><div style={{padding:14,borderBottom:"1px solid #e2e8f0"}}><input style={{...inp,maxWidth:380}} placeholder="Search customer, phone, product or requirement" value={search} onChange={e=>setSearch(e.target.value)} /></div>{error&&<div style={{padding:18,color:"#b91c1c"}}>Unable to load inquiries: {error}</div>}{loading?<div style={{padding:35,textAlign:"center",color:"#64748b"}}>Loading inquiries…</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#f8fafc"}}>{["Date","Customer","Contact","Requirement","Products","Delivery","Source","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:10,color:"#475569"}}>{h}</th>)}</tr></thead><tbody>{filtered.length===0?<tr><td colSpan="9" style={{padding:35,textAlign:"center",color:"#94a3b8"}}>No inquiries found</td></tr>:filtered.map(r=><tr key={r.id} style={{borderTop:"1px solid #f1f5f9"}}><td style={{padding:10,whiteSpace:"nowrap"}}>{r.inquiry_date||r.created_at?.slice(0,10)}</td><td style={{padding:10,fontWeight:600}}>{r.customer_name||"–"}</td><td style={{padding:10}}>{r.contact_name}<br/><span style={{color:"#64748b"}}>{r.contact_phone}</span></td><td style={{padding:10,minWidth:220}}>{r.requirement}</td><td style={{padding:10}}>{Array.isArray(r.products)?r.products.map(p=>p.product_name).filter(Boolean).join(", ")||"–":"–"}</td><td style={{padding:10}}>{r.expected_delivery_date||"–"}</td><td style={{padding:10}}>{r.source||"–"}</td><td style={{padding:10}}><span style={{padding:"4px 8px",borderRadius:12,background:r.status==="Won"?"#dcfce7":"#e8effd",color:r.status==="Won"?"#166534":"#1e56d9"}}>{r.status||"New"}</span></td><td style={{padding:10}}><button onClick={()=>setEditing(r)} style={{...btn,padding:"6px 10px",background:"#f1f5f9",color:"#334155"}}>View / Edit</button></td></tr>)}</tbody></table></div>}</div>
  </div>;
}
