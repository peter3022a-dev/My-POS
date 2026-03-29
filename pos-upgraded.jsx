import { useState, useCallback, useEffect } from "react";
import { Preferences } from "@capacitor/preferences";

const TABS = [
  { id: 1, label: "TAB 1", desc: "9% Tax",        taxRate: 0.09, fixedPrice: null,  color: "#FF6B35" },
  { id: 2, label: "TAB 2", desc: "6% Tax",         taxRate: 0.06, fixedPrice: null,  color: "#F7C59F" },
  { id: 3, label: "TAB 3", desc: "No Tax",         taxRate: 0,    fixedPrice: null,  color: "#EFEFD0" },
  { id: 4, label: "TAB 4", desc: "25¢ / No Tax",   taxRate: 0,    fixedPrice: 0.25,  color: "#4ECDC4" },
  { id: 5, label: "TAB 5", desc: "50¢ / No Tax",   taxRate: 0,    fixedPrice: 0.50,  color: "#45B7D1" },
  { id: 6, label: "TAB 6", desc: "$2.50 + 6% Tax", taxRate: 0.06, fixedPrice: 2.50,  color: "#A78BFA" },
];

const QUICK_PRICES = [1, 2, 5, 10, 20, 50];

const fmt = (n) => `$${n.toFixed(2)}`;
const todayKey  = () => new Date().toISOString().slice(0, 10);
const fmtDate   = (d)  => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime   = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

// ── Capacitor Preferences helpers ────────────────────────────────────────────
async function loadHistory() {
  try {
    const { value } = await Preferences.get({ key: "pos-history" });
    return value ? JSON.parse(value) : {};
  } catch (_) { return {}; }
}
async function persistHistory(history) {
  try { await Preferences.set({ key: "pos-history", value: JSON.stringify(history) }); } catch (_) {}
}
// ─────────────────────────────────────────────────────────────────────────────

export default function POS() {
  const [activeTab,    setActiveTab]    = useState(TABS[0]);
  const [input,        setInput]        = useState("");
  const [qty,          setQty]          = useState(1);
  const [items,        setItems]        = useState([]);
  const [paymentType,  setPaymentType]  = useState("cash"); // "cash" | "card"
  const [flash,        setFlash]        = useState(false);
  const [view,         setView]         = useState("register");
  const [history,      setHistory]      = useState({});
  const [historyDate,  setHistoryDate]  = useState(todayKey());
  const [storageReady, setStorageReady] = useState(false);
  const [savedFlash,   setSavedFlash]   = useState(false);

  useEffect(() => {
    loadHistory().then(h => { setHistory(h); setStorageReady(true); });
  }, []);
  useEffect(() => {
    if (storageReady) persistHistory(history);
  }, [history, storageReady]);

  const triggerFlash = () => { setFlash(true); setTimeout(() => setFlash(false), 180); };

  const handleKey = (key) => {
    if (key === "⌫") { setInput(p => p.slice(0, -1)); return; }
    if (key === ".") { if (!input.includes(".")) setInput(p => p + "."); return; }
    setInput(p => {
      const next = p + key;
      const parts = next.split(".");
      if (parts[1] && parts[1].length > 2) return p;
      return next;
    });
  };

  const applyQuickPrice = (val) => { setInput(String(val)); };
  const changeQty = (d) => setQty(q => Math.max(1, Math.min(99, q + d)));

  const addItem = useCallback(() => {
    const tab = activeTab;
    let unitPrice = tab.fixedPrice !== null ? tab.fixedPrice : parseFloat(input);
    if (!unitPrice || isNaN(unitPrice) || unitPrice <= 0) return;
    const unitTax = +(unitPrice * tab.taxRate).toFixed(2);
    const price   = +(unitPrice * qty).toFixed(2);
    const tax     = +(unitTax   * qty).toFixed(2);
    const total   = +(price + tax).toFixed(2);
    setItems(prev => [...prev, {
      id: Date.now(), tab: tab.id, label: tab.desc, color: tab.color,
      taxRate: tab.taxRate, unitPrice, qty, price, tax, total,
    }]);
    setInput(""); setQty(1);
    triggerFlash();
  }, [activeTab, input, qty]);

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const clearAll   = () => { setItems([]); setInput(""); setQty(1); };

  const finalizeOrder = () => {
    if (!items.length) return;
    const day = todayKey();
    const transaction = {
      id: Date.now(), time: Date.now(),
      items:       [...items],
      paymentType,
      subtotal:    items.reduce((s, i) => s + i.price,    0),
      tax:         items.reduce((s, i) => s + i.tax,      0),
      total:       items.reduce((s, i) => s + i.total,    0),
    };
    setHistory(prev => ({ ...prev, [day]: [...(prev[day] || []), transaction] }));
    setHistoryDate(day);
    setItems([]); setInput(""); setQty(1); setPaymentType("cash");
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200);
  };

  const deleteTransaction = (date, txId) => {
    setHistory(prev => {
      const updated = (prev[date] || []).filter(t => t.id !== txId);
      if (!updated.length) { const n = { ...prev }; delete n[date]; return n; }
      return { ...prev, [date]: updated };
    });
  };

  const subtotal   = items.reduce((s, i) => s + i.price, 0);
  const totalTax   = items.reduce((s, i) => s + i.tax,   0);
  const grandTotal = items.reduce((s, i) => s + i.total,  0);
  const isFixed    = activeTab.fixedPrice !== null;
  const keys       = ["7","8","9","4","5","6","1","2","3",".","0","⌫"];

  const historyDays     = Object.keys(history).sort((a, b) => b.localeCompare(a));
  const dayTransactions = history[historyDate] || [];
  const dayTotal = dayTransactions.reduce((s, t) => s + t.total, 0);
  const dayTax   = dayTransactions.reduce((s, t) => s + t.tax,   0);
  const dayCount = dayTransactions.reduce((s, t) => s + t.items.reduce((a, i) => a + i.qty, 0), 0);
  const dayCash  = dayTransactions.filter(t => t.paymentType === "cash").reduce((s,t) => s + t.total, 0);
  const dayCard  = dayTransactions.filter(t => t.paymentType === "card").reduce((s,t) => s + t.total, 0);

  const B = { fontFamily: "'Courier New', monospace", cursor: "pointer", border: "none", outline: "none" };

  return (
    <div style={{ minHeight:"100vh", background:"#0D0D0D", fontFamily:"'Courier New', monospace", display:"flex", flexDirection:"column", alignItems:"center", padding:"16px", boxSizing:"border-box" }}>

      {/* Toast */}
      {savedFlash && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"#18392B", border:"1px solid #4ADE80", color:"#4ADE80", padding:"10px 24px", borderRadius:8, fontSize:13, letterSpacing:3, fontWeight:700, zIndex:999, boxShadow:"0 0 24px #4ADE8044" }}>
          ✓ ORDER SAVED
        </div>
      )}

      {/* Header */}
      <div style={{ width:"100%", maxWidth:820, marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <div style={{ color:"#666", fontSize:11, letterSpacing:4 }}>POINT OF SALE</div>
          <div style={{ color:"#FFF", fontSize:22, fontWeight:700, letterSpacing:2 }}>REGISTER</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[{k:"register",label:"REGISTER"},{k:"history",label:"HISTORY"}].map(v => (
            <button key={v.k} onClick={() => setView(v.k)} style={{ ...B, background:view===v.k?"#222":"transparent", color:view===v.k?"#FFF":"#555", border:`1px solid ${view===v.k?"#444":"#222"}`, borderRadius:6, padding:"7px 16px", fontSize:11, letterSpacing:2 }}>
              {v.label}{v.k==="history" && historyDays.length > 0 ? ` (${historyDays.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ REGISTER ══════════════ */}
      {view === "register" && (
        <div style={{ width:"100%", maxWidth:820, display:"flex", gap:14, flexWrap:"wrap" }}>

          {/* LEFT */}
          <div style={{ flex:"1 1 280px", display:"flex", flexDirection:"column", gap:10 }}>

            {/* Tab buttons */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => { setActiveTab(tab); setInput(""); setQty(1); }} style={{ ...B, background:activeTab.id===tab.id?tab.color:"#1A1A1A", color:activeTab.id===tab.id?"#000":"#888", border:`2px solid ${activeTab.id===tab.id?tab.color:"#2A2A2A"}`, borderRadius:8, padding:"10px 6px", fontWeight:700, fontSize:11, letterSpacing:1, transition:"all 0.12s", lineHeight:1.4 }}>
                  <div style={{ fontSize:13 }}>{tab.label}</div>
                  <div style={{ fontSize:9, opacity:0.8, marginTop:2 }}>{tab.desc}</div>
                </button>
              ))}
            </div>

            {/* Display */}
            <div style={{ background:"#111", border:`2px solid ${activeTab.color}`, borderRadius:10, padding:"12px 16px", minHeight:70 }}>
              <div style={{ color:"#555", fontSize:10, letterSpacing:2, marginBottom:4 }}>{activeTab.label} — {activeTab.desc}</div>
              {isFixed
                ? <div style={{ color:activeTab.color, fontSize:28, fontWeight:700 }}>{fmt(activeTab.fixedPrice)}<span style={{ color:"#555", fontSize:13, marginLeft:8 }}>FIXED</span></div>
                : <div style={{ color:"#FFF", fontSize:32, fontWeight:700, letterSpacing:2 }}>{input ? `$${input}` : <span style={{ color:"#333" }}>$0.00</span>}</div>
              }
            </div>

            {/* Quick price buttons */}
            {!isFixed && (
              <div>
                <div style={{ color:"#444", fontSize:9, letterSpacing:3, marginBottom:6 }}>QUICK PRICE</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6 }}>
                  {QUICK_PRICES.map(v => (
                    <button key={v} onClick={() => applyQuickPrice(v)} style={{ ...B, background: input === String(v) ? activeTab.color : "#1A1A1A", color: input === String(v) ? "#000" : "#888", border:`1px solid ${input===String(v)?activeTab.color:"#2A2A2A"}`, borderRadius:6, padding:"8px 0", fontSize:11, fontWeight:700, transition:"all 0.12s" }}
                      onMouseDown={e => e.currentTarget.style.opacity="0.7"}
                      onMouseUp={e => e.currentTarget.style.opacity="1"}
                    >${v}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Keypad */}
            {!isFixed && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {keys.map(k => (
                  <button key={k} onClick={() => handleKey(k)} style={{ ...B, background:k==="⌫"?"#2A1A1A":"#1C1C1C", color:k==="⌫"?"#FF6B6B":"#EEE", border:"1px solid #2A2A2A", borderRadius:8, padding:"14px 0", fontSize:18, fontWeight:700 }}
                    onMouseDown={e => e.currentTarget.style.background="#2A2A2A"}
                    onMouseUp={e => e.currentTarget.style.background=k==="⌫"?"#2A1A1A":"#1C1C1C"}
                  >{k}</button>
                ))}
              </div>
            )}

            {/* Qty row */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ color:"#555", fontSize:10, letterSpacing:2, whiteSpace:"nowrap" }}>QTY</div>
              <button onClick={() => changeQty(-1)} style={{ ...B, background:"#1A1A1A", color:qty===1?"#333":"#CCC", border:"1px solid #2A2A2A", borderRadius:6, width:38, height:38, fontSize:20, fontWeight:700, flexShrink:0 }}>−</button>
              <div style={{ flex:1, textAlign:"center", background:"#111", border:`1px solid ${qty>1?activeTab.color:"#2A2A2A"}`, borderRadius:6, padding:"8px 0", color:qty>1?activeTab.color:"#888", fontSize:20, fontWeight:700, transition:"all 0.15s" }}>{qty}</div>
              <button onClick={() => changeQty(1)}  style={{ ...B, background:"#1A1A1A", color:"#CCC", border:"1px solid #2A2A2A", borderRadius:6, width:38, height:38, fontSize:20, fontWeight:700, flexShrink:0 }}>+</button>
            </div>

            {/* CLR + ENTER */}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setInput(""); setQty(1); }} style={{ ...B, flex:1, background:"#1A1A1A", color:"#888", border:"1px solid #2A2A2A", borderRadius:8, padding:"14px 0", fontWeight:700, fontSize:13, letterSpacing:2 }}>CLR</button>
              <button onClick={addItem} style={{ ...B, flex:3, background:activeTab.color, color:"#000", borderRadius:8, padding:"14px 0", fontWeight:700, fontSize:15, letterSpacing:3, boxShadow:`0 0 20px ${activeTab.color}55` }}
                onMouseDown={e => e.currentTarget.style.opacity="0.8"}
                onMouseUp={e => e.currentTarget.style.opacity="1"}
              >
                {isFixed ? `+ ADD ${qty>1?`${qty}×`:""}${fmt(activeTab.fixedPrice)}` : qty>1?`ENTER ×${qty}`:"ENTER"}
              </button>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ flex:"1 1 280px", display:"flex", flexDirection:"column", gap:10 }}>

            {/* Items list */}
            <div style={{ background:"#111", border:"1px solid #222", borderRadius:10, flex:1, minHeight:180, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"10px 14px", borderBottom:"1px solid #222", color:"#555", fontSize:10, letterSpacing:3, display:"flex", justifyContent:"space-between" }}>
                <span>ITEMS ({items.reduce((s,i)=>s+i.qty,0)})</span>
                {items.length > 0 && <button onClick={clearAll} style={{ ...B, background:"none", color:"#FF6B6B", fontSize:10, letterSpacing:2 }}>VOID ALL</button>}
              </div>
              <div style={{ overflowY:"auto", flex:1, padding:"8px 0" }}>
                {items.length === 0 && <div style={{ color:"#333", fontSize:12, textAlign:"center", marginTop:40, letterSpacing:2 }}>NO ITEMS</div>}
                {items.map((item, idx) => (
                  <div key={item.id} style={{ display:"flex", alignItems:"center", padding:"8px 14px", borderBottom:"1px solid #1A1A1A" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:item.color, marginRight:10, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ color:"#888", fontSize:9, letterSpacing:1 }}>#{idx+1} · {item.label}</div>
                      <div style={{ color:"#EEE", fontSize:13, fontWeight:700, display:"flex", alignItems:"baseline", gap:6 }}>
                        {item.qty > 1 && <span style={{ color:item.color, fontSize:11, background:"#1A1A1A", padding:"1px 6px", borderRadius:4 }}>×{item.qty}</span>}
                        {fmt(item.unitPrice)}
                        {item.tax > 0 && <span style={{ color:"#555", fontSize:10 }}>+{fmt(+(item.unitPrice*item.taxRate).toFixed(2))} ea</span>}
                      </div>
                    </div>
                    <div style={{ marginLeft:8, textAlign:"right" }}>
                      <div style={{ color:"#FFF", fontWeight:700, fontSize:14 }}>{fmt(item.total)}</div>
                      <button onClick={() => removeItem(item.id)} style={{ ...B, background:"none", color:"#444", fontSize:10, padding:0, marginTop:2 }}>VOID</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div style={{ background:"#111", border:"1px solid #222", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ color:"#555", fontSize:11, letterSpacing:2 }}>SUBTOTAL</span>
                <span style={{ color:"#888", fontSize:13 }}>{fmt(subtotal)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12, paddingBottom:12, borderBottom:"1px solid #222" }}>
                <span style={{ color:"#555", fontSize:11, letterSpacing:2 }}>TAX</span>
                <span style={{ color:"#888", fontSize:13 }}>{fmt(totalTax)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:flash?"#1A1A1A":"transparent", transition:"background 0.18s", borderRadius:6, padding:"4px 0" }}>
                <span style={{ color:"#FFF", fontSize:13, letterSpacing:3, fontWeight:700 }}>TOTAL</span>
                <span style={{ color:"#FFF", fontSize:28, fontWeight:700 }}>{fmt(grandTotal)}</span>
              </div>
            </div>

            {/* Tax breakdown */}
            {items.length > 0 && (
              <div style={{ background:"#111", border:"1px solid #1A1A1A", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ color:"#444", fontSize:9, letterSpacing:3, marginBottom:8 }}>TAX BREAKDOWN</div>
                {TABS.filter(t => t.taxRate > 0).map(tab => {
                  const ti = items.filter(i => i.tab === tab.id);
                  if (!ti.length) return null;
                  const qc = ti.reduce((s,i)=>s+i.qty,0);
                  return (
                    <div key={tab.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"#555", fontSize:10 }}>
                        <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:tab.color, marginRight:6, verticalAlign:"middle" }}/>
                        {tab.desc} ({qc} item{qc!==1?"s":""})
                      </span>
                      <span style={{ color:"#666", fontSize:10 }}>{fmt(ti.reduce((s,i)=>s+i.tax,0))}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment type */}
            {items.length > 0 && (
              <div style={{ background:"#111", border:"1px solid #1A1A1A", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ color:"#444", fontSize:9, letterSpacing:3, marginBottom:8 }}>PAYMENT TYPE</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[{k:"cash",label:"💵 CASH",color:"#4ADE80"},{k:"card",label:"💳 CARD",color:"#60A5FA"}].map(p => (
                    <button key={p.k} onClick={() => setPaymentType(p.k)} style={{ ...B, flex:1, background:paymentType===p.k?"#0D1F1A":"#161616", color:paymentType===p.k?p.color:"#555", border:`1px solid ${paymentType===p.k?p.color:"#2A2A2A"}`, borderRadius:8, padding:"12px 0", fontWeight:700, fontSize:12, letterSpacing:2, transition:"all 0.15s", boxShadow:paymentType===p.k?`0 0 12px ${p.color}33`:"none" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save to history */}
            {items.length > 0 && (
              <button onClick={finalizeOrder} style={{ ...B, background:"#18392B", color:"#4ADE80", border:"1px solid #4ADE8055", borderRadius:8, padding:"15px 0", fontWeight:700, fontSize:13, letterSpacing:3, width:"100%", boxShadow:"0 0 16px #4ADE8022" }}>
                ✓ SAVE TO HISTORY
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ HISTORY ══════════════ */}
      {view === "history" && (
        <div style={{ width:"100%", maxWidth:820, display:"flex", gap:14, flexWrap:"wrap" }}>

          {/* Day list */}
          <div style={{ flex:"0 0 170px", display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ color:"#444", fontSize:9, letterSpacing:3, marginBottom:4 }}>SELECT DAY</div>
            {historyDays.length === 0 && <div style={{ color:"#333", fontSize:11 }}>No history yet</div>}
            {historyDays.map(day => {
              const dt = (history[day]||[]).reduce((s,t)=>s+t.total,0);
              const isToday = day === todayKey();
              return (
                <button key={day} onClick={() => setHistoryDate(day)} style={{ ...B, background:historyDate===day?"#1A1A1A":"transparent", border:`1px solid ${historyDate===day?"#333":"#1A1A1A"}`, borderRadius:8, padding:"10px 12px", textAlign:"left" }}>
                  <div style={{ color:isToday?"#4ADE80":"#888", fontSize:11, fontWeight:700 }}>{isToday?"TODAY":fmtDate(day)}</div>
                  <div style={{ color:"#555", fontSize:10, marginTop:2 }}>{(history[day]||[]).length} orders · {fmt(dt)}</div>
                </button>
              );
            })}
          </div>

          {/* Day detail */}
          <div style={{ flex:"1 1 400px", display:"flex", flexDirection:"column", gap:12 }}>

            {/* Summary bar */}
            <div style={{ background:"#111", border:"1px solid #222", borderRadius:10, padding:"14px 18px", display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
              {[
                { label:"DATE",       val: historyDate===todayKey()?"Today":fmtDate(historyDate) },
                { label:"ORDERS",     val: dayTransactions.length },
                { label:"ITEMS SOLD", val: dayCount },
                { label:"TOTAL TAX",  val: fmt(dayTax) },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ color:"#444", fontSize:9, letterSpacing:2 }}>{s.label}</div>
                  <div style={{ color:"#FFF", fontSize:13, fontWeight:700, marginTop:2 }}>{s.val}</div>
                </div>
              ))}
              {/* Cash / Card split */}
              <div style={{ display:"flex", gap:12, marginLeft:"auto", alignItems:"center" }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#444", fontSize:9, letterSpacing:2 }}>💵 CASH</div>
                  <div style={{ color:"#4ADE80", fontSize:13, fontWeight:700, marginTop:2 }}>{fmt(dayCash)}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#444", fontSize:9, letterSpacing:2 }}>💳 CARD</div>
                  <div style={{ color:"#60A5FA", fontSize:13, fontWeight:700, marginTop:2 }}>{fmt(dayCard)}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#444", fontSize:9, letterSpacing:2 }}>TOTAL</div>
                  <div style={{ color:"#4ADE80", fontSize:22, fontWeight:700, marginTop:2 }}>{fmt(dayTotal)}</div>
                </div>
              </div>
            </div>

            {/* Transactions */}
            <div style={{ display:"flex", flexDirection:"column", gap:8, overflowY:"auto", maxHeight:"60vh" }}>
              {dayTransactions.length === 0 && <div style={{ color:"#333", fontSize:13, textAlign:"center", marginTop:40, letterSpacing:2 }}>NO ORDERS THIS DAY</div>}
              {[...dayTransactions].reverse().map((tx, txIdx) => (
                <div key={tx.id} style={{ background:"#111", border:"1px solid #1E1E1E", borderRadius:10, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", borderBottom:"1px solid #1A1A1A", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ color:"#555", fontSize:10, letterSpacing:2 }}>ORDER #{dayTransactions.length-txIdx} · {fmtTime(tx.time)}</span>
                      {/* Payment badge */}
                      <span style={{ fontSize:9, fontWeight:700, letterSpacing:1, padding:"2px 8px", borderRadius:4, background: tx.paymentType==="cash"?"#0D1F1A":"#0D1525", color: tx.paymentType==="cash"?"#4ADE80":"#60A5FA", border:`1px solid ${tx.paymentType==="cash"?"#4ADE8033":"#60A5FA33"}` }}>
                        {tx.paymentType==="cash"?"💵 CASH":"💳 CARD"}
                      </span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ color:"#FFF", fontWeight:700, fontSize:15 }}>{fmt(tx.total)}</span>
                      <button onClick={() => deleteTransaction(historyDate, tx.id)} style={{ ...B, background:"none", border:"1px solid #2A1A1A", color:"#664444", fontSize:9, letterSpacing:1, padding:"4px 8px", borderRadius:4 }}>DELETE</button>
                    </div>
                  </div>
                  <div style={{ padding:"6px 0" }}>
                    {tx.items.map((item, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", padding:"5px 14px" }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:item.color, marginRight:10, flexShrink:0 }} />
                        <div style={{ flex:1, color:"#666", fontSize:10 }}>
                          {item.qty>1 && <span style={{ color:"#888", marginRight:4 }}>×{item.qty}</span>}
                          {item.label}
                        </div>
                        <div style={{ color:"#888", fontSize:11 }}>{fmt(item.unitPrice)}{item.tax>0&&<span style={{ color:"#444", fontSize:9, marginLeft:4 }}>+tax</span>}</div>
                        <div style={{ color:"#CCC", fontSize:12, fontWeight:700, marginLeft:12, minWidth:52, textAlign:"right" }}>{fmt(item.total)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:"8px 14px", borderTop:"1px solid #1A1A1A", display:"flex", justifyContent:"flex-end", gap:20 }}>
                    <span style={{ color:"#444", fontSize:10 }}>Sub: {fmt(tx.subtotal)}</span>
                    <span style={{ color:"#444", fontSize:10 }}>Tax: {fmt(tx.tax)}</span>
                    <span style={{ color:"#888", fontSize:10, fontWeight:700 }}>Total: {fmt(tx.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        button:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 4px; }
      `}</style>
    </div>
  );
}
