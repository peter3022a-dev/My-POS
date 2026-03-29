import { useState, useCallback, useEffect } from "react";
import { Preferences } from "@capacitor/preferences";

const TABS = [
  { id: 1, label: "TAB 1", desc: "9% Tax", taxRate: 0.09, fixedPrice: null, color: "#FF6B35" },
  { id: 2, label: "TAB 2", desc: "6% Tax", taxRate: 0.06, fixedPrice: null, color: "#F7C59F" },
  { id: 3, label: "TAB 3", desc: "No Tax", taxRate: 0, fixedPrice: null, color: "#EFEFD0" },
  { id: 4, label: "TAB 4", desc: "25¢ / No Tax", taxRate: 0, fixedPrice: 0.25, color: "#4ECDC4" },
  { id: 5, label: "TAB 5", desc: "50¢ / No Tax", taxRate: 0, fixedPrice: 0.50, color: "#45B7D1" },
  { id: 6, label: "TAB 6", desc: "$2.50 + 6% Tax", taxRate: 0.06, fixedPrice: 2.50, color: "#A78BFA" },
];

const fmt = (n) => `$${n.toFixed(2)}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

async function loadHistory() {
  const { value } = await Preferences.get({ key: "pos-history" });
  return value ? JSON.parse(value) : {};
}

async function persistHistory(history) {
  await Preferences.set({ key: "pos-history", value: JSON.stringify(history) });
}

export default function POS() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [input, setInput] = useState("");
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState({});
  const [paymentType, setPaymentType] = useState("cash");

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  const addItem = useCallback(() => {
    let unitPrice = activeTab.fixedPrice ?? parseFloat(input);
    if (isNaN(unitPrice) || unitPrice <= 0) return;

    const price = +(unitPrice * qty).toFixed(2);
    const tax = +(price * activeTab.taxRate).toFixed(2);
    const total = +(price + tax).toFixed(2);

    setItems(prev => [...prev, {
      id: Date.now(),
      label: activeTab.desc,
      unitPrice,
      qty,
      price,
      tax,
      total,
      taxRate: activeTab.taxRate
    }]);

    setInput("");
    setQty(1);
  }, [activeTab, input, qty]);

  const finalizeOrder = () => {
    const day = todayKey();
    const transaction = {
      id: Date.now(),
      items,
      total: items.reduce((s,i)=>s+i.total,0),
      paymentType
    };

    setHistory(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), transaction]
    }));

    setItems([]);
  };

  return (
    <div style={{padding:20, color:"#fff", background:"#000", minHeight:"100vh"}}>
      <h2>POS SYSTEM</h2>

      <div>
        {TABS.map(tab => (
          <button key={tab.id} onClick={()=>setActiveTab(tab)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Enter price"/>
        <button onClick={()=>setQty(q=>q+1)}>+</button>
        <span>{qty}</span>
        <button onClick={()=>setQty(q=>Math.max(1,q-1))}>-</button>
      </div>

      <div>
        {[1,2,5,10,20].map(v=>(
          <button key={v} onClick={()=>setInput(String(v))}>${v}</button>
        ))}
      </div>

      <button onClick={addItem}>ADD ITEM</button>

      <div>
        {items.map(i=>(
          <div key={i.id}>
            {i.label} - {fmt(i.total)}
          </div>
        ))}
      </div>

      <div>
        <button onClick={()=>setPaymentType("cash")}>CASH</button>
        <button onClick={()=>setPaymentType("card")}>CARD</button>
      </div>

      <button onClick={finalizeOrder}>SAVE</button>
    </div>
  );
}
