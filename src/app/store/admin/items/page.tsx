"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, Trash2, Edit3, Search, Filter, ArrowUpDown, Copy, Layers, Tag, Info, X, Check, Hash, AlertTriangle } from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { parseItemVariants, ItemVariant } from "@/lib/store-variant-utils";
import { PaginationControls } from "@/components/PaginationControls";

interface StoreItem {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  cost: number;
  variants: any[];
}

// Custom iOS-Style Smooth Toggle Switch Component
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="inline-flex items-center gap-2 cursor-pointer select-none group"
      title={checked ? "In Stock (Click to turn off)" : "Out of Stock (Click to turn on)"}
    >
      <div
        className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
          checked ? 'bg-green-500' : 'bg-slate-300'
        }`}
      >
        <div
          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
      {label && (
        <span className={`text-xs font-bold transition-colors ${checked ? 'text-green-700' : 'text-slate-400'}`}>
          {label}
        </span>
      )}
    </button>
  );
}

function getNextItemCode(existingItems: StoreItem[]): string {
  let maxNum = 0;
  existingItems.forEach(i => {
    if (i.item_code) {
      const match = i.item_code.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  });
  return String(maxNum + 1).padStart(3, '0');
}

export default function StoreItemsAdmin() {
  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { storeUser, loading: authLoading } = useStoreAuth();

  // Add Item State
  const [newItemCode, setNewItemCode] = useState("001");
  const [newItemName, setNewItemName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [variantRows, setVariantRows] = useState<{ brand: string; size: string; cost: string; is_available: boolean }[]>([
    { brand: "", size: "", cost: "", is_available: true }
  ]);
  const [isAdding, setIsAdding] = useState(false);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editVariantRows, setEditVariantRows] = useState<{ brand: string; size: string; cost: string; is_available: boolean }[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Search, Filter, and Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"code_asc" | "name_asc" | "name_desc">("code_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchItems();
    });
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const res = await fetch('/api/store/items?all=true');
    if (res.ok) {
      const data: StoreItem[] = await res.json();
      setItems(data);
      const nextCode = getNextItemCode(data);
      setNewItemCode(nextCode);
    }
    setLoading(false);
  };

  // Variant Row Management (Add Form)
  const addVariantRow = () => setVariantRows([...variantRows, { brand: "", size: "", cost: "", is_available: true }]);
  const removeVariantRow = (idx: number) => {
    if (variantRows.length > 1) {
      setVariantRows(variantRows.filter((_, i) => i !== idx));
    }
  };
  const updateVariantRow = (idx: number, field: "brand" | "size" | "cost" | "is_available", val: any) => {
    const updated = [...variantRows];
    updated[idx] = { ...updated[idx], [field]: val };
    setVariantRows(updated);
  };

  // Variant Row Management (Edit Form)
  const addEditVariantRow = () => setEditVariantRows([...editVariantRows, { brand: "", size: "", cost: "", is_available: true }]);
  const removeEditVariantRow = (idx: number) => {
    if (editVariantRows.length > 1) {
      setEditVariantRows(editVariantRows.filter((_, i) => i !== idx));
    }
  };
  const updateEditVariantRow = (idx: number, field: "brand" | "size" | "cost" | "is_available", val: any) => {
    const updated = [...editVariantRows];
    updated[idx] = { ...updated[idx], [field]: val };
    setEditVariantRows(updated);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    const validVariants = variantRows
      .filter(v => v.size.trim() && v.cost.trim())
      .map(v => {
        const sizeStr = v.size.trim();
        const brandStr = v.brand.trim();
        const parts = [];
        if (brandStr) parts.push(brandStr);
        if (sizeStr) parts.push(sizeStr);
        const label = parts.join(" - ") || sizeStr || brandStr;
        const parsedCost = parseFloat(v.cost);
        return {
          brand: brandStr || undefined,
          size: sizeStr,
          cost: isNaN(parsedCost) ? 0 : parsedCost,
          is_available: v.is_available !== false,
          label
        };
      });

    if (validVariants.length === 0) {
      alert("Please add at least one variant with Size/Variant and Price.");
      return;
    }

    setIsAdding(true);
    const itemCost = validVariants[0].cost || 0;
    const assignedCode = newItemCode || getNextItemCode(items);

    const res = await fetch('/api/store/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        item_code: assignedCode,
        item_name: newItemName,
        category: newCategory,
        cost: itemCost,
        variants: validVariants
      })
    });

    if (res.ok) {
      setNewItemName("");
      setVariantRows([{ brand: "", size: "", cost: "", is_available: true }]);
      fetchItems();
    } else {
      const err = await res.json();
      alert("Error adding item: " + err.error);
    }
    setIsAdding(false);
  };

  // Open Edit Modal
  const openEditModal = (item: StoreItem) => {
    setEditingItem(item);
    setEditCode(item.item_code);
    setEditName(item.item_name);
    setEditCategory(item.category || "General");

    const parsed = parseItemVariants(item.variants, item.cost);
    if (parsed.length > 0) {
      setEditVariantRows(parsed.map(v => ({
        brand: v.brand || "",
        size: v.size || (v.label && !v.brand ? v.label : ""),
        cost: typeof v.cost === 'number' ? v.cost.toString() : "",
        is_available: v.is_available !== false
      })));
    } else {
      setEditVariantRows([{ brand: "", size: "", cost: "", is_available: true }]);
    }
  };

  // Save Edit Item
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !editingItem) return;

    const validVariants = editVariantRows
      .filter(v => v.size.trim() && v.cost.trim())
      .map(v => {
        const sizeStr = v.size.trim();
        const brandStr = v.brand.trim();
        const parts = [];
        if (brandStr) parts.push(brandStr);
        if (sizeStr) parts.push(sizeStr);
        const label = parts.join(" - ") || sizeStr || brandStr;
        const parsedCost = parseFloat(v.cost);
        return {
          brand: brandStr || undefined,
          size: sizeStr,
          cost: isNaN(parsedCost) ? 0 : parsedCost,
          is_available: v.is_available !== false,
          label
        };
      });

    if (validVariants.length === 0) {
      alert("Please add at least one variant with Size/Variant and Price.");
      return;
    }

    setIsSavingEdit(true);
    const itemCost = validVariants[0].cost || 0;

    const res = await fetch('/api/store/items', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        id: editingItem.id,
        item_code: editCode,
        item_name: editName,
        category: editCategory,
        cost: itemCost,
        variants: validVariants
      })
    });

    if (res.ok) {
      setEditingItem(null);
      fetchItems();
    } else {
      const err = await res.json();
      alert("Error updating item: " + err.error);
    }
    setIsSavingEdit(false);
  };

  // Toggle specific variant availability directly in the table view
  const toggleVariantAvailabilityInTable = async (item: StoreItem, variantIdx: number) => {
    if (!session) return;
    const parsed = parseItemVariants(item.variants, item.cost);
    if (!parsed[variantIdx]) return;

    parsed[variantIdx].is_available = !(parsed[variantIdx].is_available !== false);

    // Optimistic UI update
    setItems(items.map(i => i.id === item.id ? { ...i, variants: parsed } : i));

    await fetch('/api/store/items', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        ...item,
        variants: parsed
      })
    });
  };

  // Duplicate / Clone Item
  const handleDuplicate = (item: StoreItem) => {
    const nextCode = getNextItemCode(items);
    setNewItemCode(nextCode);
    setNewItemName(`${item.item_name} (Copy)`);
    setNewCategory(item.category || "General");

    const parsed = parseItemVariants(item.variants, item.cost);
    if (parsed.length > 0) {
      setVariantRows(parsed.map(v => ({
        brand: v.brand || "",
        size: v.size || (v.label && !v.brand ? v.label : ""),
        cost: typeof v.cost === 'number' ? v.cost.toString() : "",
        is_available: true
      })));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async (id: string) => {
    const res = await fetch(`/api/store/items?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      fetchItems();
    } else {
      const err = await res.json();
      alert("Error deleting item: " + err.error);
    }
  };

  // Filter & Sort Items logic
  const filteredAndSortedItems = items
    .filter(item => {
      if (categoryFilter !== "All" && item.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = item.item_code.toLowerCase().includes(q);
        const nameMatch = item.item_name.toLowerCase().includes(q);
        const catMatch = item.category?.toLowerCase().includes(q);

        const parsedV = parseItemVariants(item.variants, item.cost);
        const variantMatch = parsedV.some(v => 
          v.label.toLowerCase().includes(q) || 
          v.brand?.toLowerCase().includes(q) || 
          v.size?.toLowerCase().includes(q)
        );

        return codeMatch || nameMatch || catMatch || variantMatch;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "code_asc") return a.item_code.localeCompare(b.item_code, undefined, { numeric: true });
      if (sortBy === "name_asc") return a.item_name.localeCompare(b.item_name);
      if (sortBy === "name_desc") return b.item_name.localeCompare(a.item_name);
      return 0;
    });

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedItems.slice(start, start + pageSize);
  }, [filteredAndSortedItems, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, sortBy, pageSize]);

  if (authLoading || loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-devo-500" /></div>;

  const canAccessAdminPanel = storeUser?.can_access_admin_panel ?? storeUser?.is_super_or_store_admin;

  if (!canAccessAdminPanel) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <h2 className="text-xl font-bold text-amber-600 mb-2 font-outfit">Store Admin Access Required</h2>
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-6">
            Store Managers have access to the Approvals Queue only. This page is restricted to Store Admins.
          </p>
          <a href="/store/admin/approvals" className="inline-block px-5 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors text-xs sm:text-sm">
            Go to Approvals Queue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-12">
      <h1 className="text-3xl font-black font-outfit text-slate-800 mb-6 flex items-center gap-3">
        <Layers className="w-8 h-8 text-devo-600" />
        Manage Store Items
      </h1>
        
        {/* Add Item Form */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-3 flex items-center justify-between">
            <span>Add New Item</span>
            <span className="text-xs font-semibold text-slate-400">Store Catalog Management</span>
          </h2>
          
          <form onSubmit={handleAddItem} className="space-y-6">
            
            {/* Basic Item Info */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase mb-1.5">
                    <Hash className="w-3.5 h-3.5 text-devo-600" />
                    <span>Auto Item Code</span>
                    <span className="text-slate-400 cursor-help" title="Item codes are sequential (001 - 999) and auto-allocated.">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </label>
                  <input 
                    readOnly 
                    value={newItemCode} 
                    className="w-full px-4 py-2.5 bg-devo-50/50 border border-devo-200 text-devo-900 rounded-xl outline-none font-mono font-bold text-sm tracking-wider shadow-2xs cursor-not-allowed" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Item Name *</label>
                  <input required value={newItemName} onChange={e => setNewItemName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 text-sm font-medium transition-all" placeholder="e.g. Chappal / Kurta / Soap" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 text-sm font-medium transition-all cursor-pointer">
                    <option>General</option>
                    <option>Internal</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Compulsory Item Variants Builder */}
            <div className="bg-slate-50/80 p-3 sm:p-6 rounded-2xl border border-slate-200 space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-devo-600" />
                <h3 className="text-xs sm:text-sm font-black uppercase text-slate-700 tracking-wider">
                  Item Variants, Pricing & Availability *
                </h3>
                <span className="text-slate-400 hover:text-slate-600 transition-colors cursor-help" title="Each variant has its own size, price, and availability toggle. Turned off variants are hidden from public requests.">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Headers (Desktop & Tablet) */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-1 text-xs font-bold text-slate-500 uppercase">
                <div className="col-span-3">Brand <span className="text-[10px] text-slate-400 font-normal lowercase">(optional)</span></div>
                <div className="col-span-3">Size / Variant *</div>
                <div className="col-span-3">Price ₹ *</div>
                <div className="col-span-2 text-center">In Stock Toggle</div>
                <div className="col-span-1 text-right">Action</div>
              </div>

              {/* Variant Rows (Compact 2-Col Grid on Mobile!) */}
              <div className="space-y-2.5">
                {variantRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-2 sm:grid-cols-12 gap-2 sm:gap-3 items-center bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase mb-0.5">Brand (optional)</label>
                      <input 
                        placeholder="e.g. Bata / Gopika" 
                        value={row.brand} 
                        onChange={e => updateVariantRow(index, "brand", e.target.value)} 
                        className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-devo-500 outline-none transition-all" 
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase mb-0.5">Size / Variant *</label>
                      <input 
                        required
                        placeholder="e.g. 8 / 9 / 36 *" 
                        value={row.size} 
                        onChange={e => updateVariantRow(index, "size", e.target.value)} 
                        className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-devo-500 outline-none transition-all" 
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase mb-0.5">Price ₹ *</label>
                      <input 
                        required
                        type="number" 
                        min="0"
                        step="0.01"
                        placeholder="Price ₹ *" 
                        value={row.cost} 
                        onChange={e => updateVariantRow(index, "cost", e.target.value)} 
                        className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:border-devo-500 outline-none transition-all" 
                      />
                    </div>

                    {/* Smooth iOS-Style Toggle Switch */}
                    <div className="col-span-1 sm:col-span-2 flex justify-between sm:justify-center items-center py-0.5 sm:py-0">
                      <span className="sm:hidden text-[11px] font-bold text-slate-600">Status:</span>
                      <ToggleSwitch
                        checked={row.is_available}
                        onChange={() => updateVariantRow(index, "is_available", !row.is_available)}
                        label={row.is_available ? "In Stock" : "Out of Stock"}
                      />
                    </div>

                    {variantRows.length > 1 && (
                      <div className="col-span-2 sm:col-span-1 text-right flex justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <button 
                          type="button" 
                          onClick={() => removeVariantRow(index)} 
                          className="px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                          title="Remove variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="sm:hidden">Remove Variant</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-1">
                <button 
                  type="button" 
                  onClick={addVariantRow} 
                  className="w-full sm:w-auto justify-center px-3.5 py-2 bg-white text-devo-700 font-bold text-xs rounded-xl border border-devo-200 hover:bg-devo-50 hover:border-devo-300 flex items-center gap-2 shadow-2xs transition-all"
                >
                  <Plus className="w-4 h-4 text-devo-600" />
                  + Add Another Variant Row
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button disabled={isAdding} type="submit" className="w-full sm:w-auto justify-center px-6 py-3 bg-devo-600 hover:bg-devo-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs sm:text-sm shadow-md transition-all">
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save Store Item
              </button>
            </div>
          </form>
        </div>

        {/* Existing Store Items Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
          
          {/* Controls Bar: Search, Category Filter, and Sorting */}
          <div className="p-3.5 sm:p-6 bg-slate-50/90 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            
            {/* Title & Badge */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <h2 className="font-bold text-slate-800 text-lg sm:text-xl font-outfit whitespace-nowrap">
                Existing Store Items
              </h2>
              <span className="bg-devo-100 text-devo-800 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                {filteredAndSortedItems.length} items
              </span>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search code, name, variant..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-devo-500 shadow-2xs transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter & Sort Option in a 2-Col Grid on Mobile */}
              <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
                {/* Category Filter */}
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-2 border border-slate-200 rounded-xl shadow-2xs text-xs font-medium text-slate-600 min-w-0">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select 
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 w-full text-[11px] sm:text-xs truncate"
                  >
                    <option value="All">All Categories</option>
                    <option value="General">General</option>
                    <option value="Internal">Internal</option>
                  </select>
                </div>

                {/* Sort Option */}
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-2 border border-slate-200 rounded-xl shadow-2xs text-xs font-medium text-slate-600 min-w-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select 
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 w-full text-[11px] sm:text-xs truncate"
                  >
                    <option value="code_asc">Sort: Code</option>
                    <option value="name_asc">Sort: Name (A-Z)</option>
                    <option value="name_desc">Sort: Name (Z-A)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Card View for Store Items */}
          <div className="block md:hidden p-3 space-y-2.5">
            {paginatedItems.map((item: StoreItem, itemIdx: number) => {
              const parsedVariants = parseItemVariants(item.variants, item.cost);
              const isEven = itemIdx % 2 === 0;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 shadow-2xs space-y-2.5 transition-colors ${
                    isEven
                      ? "bg-white border-l-4 border-l-devo-600 border-slate-200/90"
                      : "bg-slate-50/90 border-l-4 border-l-amber-500 border-slate-300/80"
                  }`}
                >
                  {/* Item Header: Code, Name & Category */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono font-bold text-devo-800 bg-devo-100 border border-devo-200 px-2 py-0.5 rounded-md shrink-0">
                        #{item.item_code}
                      </span>
                      <span className="font-black text-slate-900 text-sm truncate">
                        {item.item_name}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 shrink-0">
                      {item.category}
                    </span>
                  </div>

                  {/* Variants & In-Stock Toggles */}
                  {parsedVariants.length > 0 ? (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Variants & In-Stock Status
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {parsedVariants.map((v: ItemVariant, idx: number) => {
                          const isAvail = v.is_available !== false;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                                isAvail ? 'bg-white border-slate-200' : 'bg-red-50/70 border-red-200 text-red-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ToggleSwitch
                                  checked={isAvail}
                                  onChange={() => toggleVariantAvailabilityInTable(item, idx)}
                                />
                                <span className={`text-xs font-bold truncate ${isAvail ? 'text-slate-800' : 'text-red-600 line-through'}`}>
                                  {v.label}
                                </span>
                              </div>

                              <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs shrink-0 ${
                                isAvail ? 'text-devo-800 bg-devo-50 border border-devo-200' : 'text-red-700 bg-white border border-red-200'
                              }`}>
                                ₹{v.cost} {isAvail ? '' : '(Out of Stock)'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs italic">No variants</div>
                  )}

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/50">
                    <button
                      onClick={() => openEditModal(item)}
                      className="px-2.5 py-1 text-slate-700 hover:text-devo-700 hover:bg-devo-50 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    <button
                      onClick={() => handleDuplicate(item)}
                      className="px-2.5 py-1 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-amber-600" />
                      Duplicate
                    </button>

                    <button
                      onClick={() => handleDelete(item.id)}
                      className="px-2.5 py-1 text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredAndSortedItems.length === 0 && (
              <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
                {searchQuery || categoryFilter !== "All" ? "No store items match your search or filter." : "No store items found."}
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100/70 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase w-28">Code</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase w-48">Item Name</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase w-32">Category</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Variants, Prices & In-Stock Toggles</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item: StoreItem) => {
                  const parsedVariants = parseItemVariants(item.variants, item.cost);
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-sm font-mono font-bold text-devo-700 bg-devo-50/30">{item.item_code}</td>
                      <td className="p-4 text-sm font-bold text-slate-800">{item.item_name}</td>
                      <td className="p-4 text-sm text-slate-600">{item.category}</td>
                      <td className="p-4 text-sm">
                        {parsedVariants.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-3">
                            {parsedVariants.map((v: ItemVariant, idx: number) => {
                              const isAvail = v.is_available !== false;
                              return (
                                <div key={idx} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                                  isAvail ? 'bg-white border-slate-200 shadow-2xs' : 'bg-red-50/60 border-red-200 text-red-700'
                                }`}>
                                  <ToggleSwitch 
                                    checked={isAvail} 
                                    onChange={() => toggleVariantAvailabilityInTable(item, idx)} 
                                  />
                                  <span className={`text-xs font-semibold ${isAvail ? 'text-slate-800' : 'text-red-600 line-through opacity-75'}`}>
                                    {v.label}
                                  </span>
                                  <span className={`font-bold px-2 py-0.5 rounded border text-[11px] ${
                                    isAvail ? 'text-devo-700 bg-slate-50 border-slate-200' : 'text-red-700 bg-white border-red-200'
                                  }`}>
                                    ₹{v.cost} {isAvail ? '' : '(Out of Stock)'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">No variants</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => openEditModal(item)} 
                            className="p-2 text-slate-600 hover:text-devo-600 hover:bg-devo-50 rounded-lg transition-colors" 
                            title="Edit Item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button 
                            onClick={() => handleDuplicate(item)} 
                            className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" 
                            title="Duplicate Item"
                          >
                            <Copy className="w-4 h-4" />
                          </button>

                          <button 
                            onClick={() => handleDelete(item.id)} 
                            className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredAndSortedItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      {searchQuery || categoryFilter !== "All" ? "No store items match your search or filter." : "No store items found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4">
            <PaginationControls
              currentPage={page}
              pageSize={pageSize}
              totalItems={filteredAndSortedItems.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[20, 50, 100]}
            />
          </div>
        </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <Edit3 className="w-5 h-5 text-devo-600" />
                Edit Store Item ({editCode})
              </h2>
              <button onClick={() => setEditingItem(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-6">
              {/* Item Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Code (001 - 999) *</label>
                  <input required value={editCode} onChange={e => setEditCode(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 text-sm font-mono font-bold text-devo-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Item Name *</label>
                  <input required value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 text-sm font-medium">
                    <option>General</option>
                    <option>Internal</option>
                  </select>
                </div>
              </div>

              {/* Edit Variants */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-devo-600" />
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Edit Variants, Prices & In-Stock Toggles *
                  </h3>
                </div>

                <div className="grid grid-cols-12 gap-3 px-1 text-xs font-bold text-slate-500 uppercase">
                  <div className="col-span-3">Brand (optional)</div>
                  <div className="col-span-3">Size / Variant *</div>
                  <div className="col-span-3">Price ₹ *</div>
                  <div className="col-span-2 text-center">In Stock Toggle</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="space-y-2">
                  {editVariantRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="col-span-3">
                        <input 
                          placeholder="e.g. Bata (optional)" 
                          value={row.brand} 
                          onChange={e => updateEditVariantRow(index, "brand", e.target.value)} 
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:border-devo-500" 
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          required
                          placeholder="e.g. 8 / 9 / 36 *" 
                          value={row.size} 
                          onChange={e => updateEditVariantRow(index, "size", e.target.value)} 
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:border-devo-500" 
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          required
                          type="number" 
                          min="0"
                          step="0.01"
                          placeholder="Price ₹ *" 
                          value={row.cost} 
                          onChange={e => updateEditVariantRow(index, "cost", e.target.value)} 
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-devo-500" 
                        />
                      </div>

                      {/* Smooth Toggle Switch in Edit Modal */}
                      <div className="col-span-2 flex justify-center items-center">
                        <ToggleSwitch
                          checked={row.is_available}
                          onChange={() => updateEditVariantRow(index, "is_available", !row.is_available)}
                          label={row.is_available ? "In Stock" : "Out of Stock"}
                        />
                      </div>

                      <div className="col-span-1 text-right">
                        {editVariantRows.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeEditVariantRow(index)} 
                            className="p-1 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  type="button" 
                  onClick={addEditVariantRow} 
                  className="px-3 py-1.5 bg-white text-devo-700 font-bold text-xs rounded-lg border border-devo-200 hover:bg-devo-50 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-devo-600" />
                  + Add Variant Row
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setEditingItem(null)} 
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSavingEdit} 
                  type="submit" 
                  className="px-6 py-2.5 bg-devo-600 hover:bg-devo-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm shadow-md"
                >
                  {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Popup Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base font-outfit">Delete Catalog Item?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to delete this store item and all its variants? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmId;
                  setDeleteConfirmId(null);
                  if (id) executeDelete(id);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
