"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Loader2,
  ShoppingCart,
  Send,
  Tag,
  Plus,
  Minus,
  Trash2,
  Search,
  UserCheck,
  X,
  CheckCircle2,
  Package,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Filter,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  Check,
  ShoppingBag,
  Clock,
  ArrowRight
} from "lucide-react";
import { parseItemVariants, getVariantCost, ItemVariant } from "@/lib/store-variant-utils";
import { PaginationControls } from "@/components/PaginationControls";

interface ApprovedUser {
  id: string;
  full_name: string;
}

interface StoreItem {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  cost: number;
  variants: any[];
}

interface CartItem {
  item_id: string;
  item_code: string;
  item_name: string;
  selected_variant: string;
  unit_cost: number;
  quantity: number;
}

export default function QuickStoreRequestPage() {
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<StoreItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"code_asc" | "name_asc" | "name_desc">("code_asc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Card variant state
  const [cardVariantMap, setCardVariantMap] = useState<Record<string, string>>({});

  // Multi-item Cart Basket
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<{ userName: string; count: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchApprovedUsers();
    fetchStoreItems();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchApprovedUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/store/public/users");
      if (res.ok) {
        const data = await res.json();
        setApprovedUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch approved users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchStoreItems = async () => {
    setLoadingItems(true);
    try {
      const res = await fetch("/api/store/public/items");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch store items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Filtered Approved Users
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return approvedUsers;
    const q = userSearchQuery.toLowerCase();
    return approvedUsers.filter(u => (u.full_name || "").toLowerCase().includes(q));
  }, [approvedUsers, userSearchQuery]);

  const selectedUserObj = useMemo(() => {
    return approvedUsers.find(u => u.id === selectedUserId);
  }, [approvedUsers, selectedUserId]);

  // Categories list
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(i => {
      if (i.category && i.category.trim()) cats.add(i.category.trim());
    });
    const list = Array.from(cats);
    if (list.length <= 1) return [];
    return ["all", ...list];
  }, [items]);

  // Filtered and Sorted Catalog Items
  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter(item => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (item.item_name || "").toLowerCase().includes(q);
          const matchCode = (item.item_code || "").toLowerCase().includes(q);
          const matchCat = (item.category || "").toLowerCase().includes(q);
          return matchName || matchCode || matchCat;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "code_asc") return (a.item_code || "").localeCompare(b.item_code || "", undefined, { numeric: true });
        if (sortBy === "name_asc") return (a.item_name || "").localeCompare(b.item_name || "");
        if (sortBy === "name_desc") return (b.item_name || "").localeCompare(a.item_name || "");
        return 0;
      });
  }, [items, searchQuery, categoryFilter, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, sortBy, pageSize]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedItems.slice(start, start + pageSize);
  }, [filteredAndSortedItems, page, pageSize]);

  const setCardVariant = (itemId: string, variantLabel: string) => {
    setCardVariantMap(prev => ({ ...prev, [itemId]: variantLabel }));
  };

  const addItemToCart = (item: StoreItem, selectedVariantLabel: string) => {
    const parsed = parseItemVariants(item.variants, item.cost);
    const chosenVariant = selectedVariantLabel || (parsed.length > 0 ? parsed[0].label : "");
    const unitCost = getVariantCost(chosenVariant, item.variants, item.cost);

    setCartItems(prev => {
      const existingIdx = prev.findIndex(ci => ci.item_id === item.id && ci.selected_variant === chosenVariant);
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [
        ...prev,
        {
          item_id: item.id,
          item_code: item.item_code,
          item_name: item.item_name,
          selected_variant: chosenVariant,
          unit_cost: unitCost,
          quantity: 1
        }
      ];
    });
  };

  const updateCartQuantity = (index: number, delta: number) => {
    setCartItems(prev => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  };

  const setCartItemQuantityDirect = (index: number, qty: number) => {
    if (isNaN(qty) || qty < 1) qty = 1;
    setCartItems(prev => {
      const updated = [...prev];
      updated[index].quantity = qty;
      return updated;
    });
  };

  const updateCartItemVariant = (index: number, newVariant: string) => {
    setCartItems(prev => {
      const updated = [...prev];
      const target = updated[index];
      const storeItem = items.find(i => i.id === target.item_id);
      if (storeItem) {
        target.selected_variant = newVariant;
        target.unit_cost = getVariantCost(newVariant, storeItem.variants, storeItem.cost);
      }
      return updated;
    });
  };

  const removeCartItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalCartQty = useMemo(() => cartItems.reduce((acc, ci) => acc + ci.quantity, 0), [cartItems]);

  const handlePublicSubmit = async () => {
    setErrorMsg("");
    if (!selectedUserId) {
      setErrorMsg("Please select your name from the approved list before submitting.");
      return;
    }
    if (cartItems.length === 0) {
      setErrorMsg("Please add at least one item to your request basket.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        user_id: selectedUserId,
        items: cartItems.map(ci => ({
          item_id: ci.item_id,
          quantity: ci.quantity,
          selected_variant: ci.selected_variant
        }))
      };

      const res = await fetch("/api/store/public/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSubmittedReceipt({
          userName: selectedUserObj?.full_name || "Approved User",
          count: data.count || cartItems.length
        });
        setCartItems([]);
        setIsMobileCartOpen(false);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Failed to submit request.");
      }
    } catch (err: any) {
      setErrorMsg("Connection error while submitting request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-violet-50/50 pb-24">
      
      {/* Header Banner - Light Violet / Purple Theme */}
      <div className="bg-gradient-to-r from-violet-900 via-purple-900 to-indigo-950 text-white pt-8 pb-12 px-4 shadow-md">
        <div className="max-w-7xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-2 bg-violet-800/60 border border-violet-500/30 text-violet-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            <ShoppingBag className="w-3.5 h-3.5 text-violet-300" />
            <span>Samvardhan Direct Request</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black font-outfit tracking-tight text-white">
            Quick Request
          </h1>
          <p className="text-xs sm:text-sm text-violet-100/80 max-w-2xl font-medium">
            Select your name from the approved list, add store items, choose varieties & quantities, and submit your request.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 -mt-6 space-y-6">

        {/* Step 1: User Picker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2 font-outfit">
              <UserCheck className="w-4 h-4 text-violet-600" />
              1. Select Your Approved Name *
            </label>

            {selectedUserObj && (
              <span className="text-[10px] sm:text-xs font-bold bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-violet-600 stroke-[3]" />
                {selectedUserObj.full_name}
              </span>
            )}
          </div>

          <div className="relative" ref={userDropdownRef}>
            {selectedUserObj ? (
              <div className="bg-violet-50/80 border border-violet-300 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    {selectedUserObj.full_name[0].toUpperCase()}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">{selectedUserObj.full_name}</div>
                    <div className="text-[10px] text-violet-700 font-semibold">Approved Store User</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserId("");
                    setIsUserDropdownOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-violet-800 bg-white hover:bg-violet-100 rounded-lg border border-violet-200 shadow-2xs shrink-0 transition-colors"
                >
                  Change Name
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={loadingUsers ? "Loading approved users..." : "Search & pick your name from approved list..."}
                  value={userSearchQuery}
                  onFocus={() => setIsUserDropdownOpen(true)}
                  onChange={e => {
                    setUserSearchQuery(e.target.value);
                    setIsUserDropdownOpen(true);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium outline-none focus:border-violet-500 focus:bg-white transition-all shadow-2xs"
                />
                {userSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setUserSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {isUserDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-30 p-1.5 space-y-1 custom-scrollbar">
                    {loadingUsers ? (
                      <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                        <span>Loading names...</span>
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-medium">No approved users found matching "{userSearchQuery}"</div>
                    ) : (
                      filteredUsers.map(u => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setIsUserDropdownOpen(false);
                          }}
                          className="p-2.5 rounded-lg hover:bg-violet-50 cursor-pointer text-xs sm:text-sm font-bold text-slate-800 flex items-center justify-between transition-colors"
                        >
                          <span>{u.full_name}</span>
                          <span className="text-[10px] text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-100">Approved</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="p-4 bg-rose-50 text-rose-800 font-bold rounded-2xl border border-rose-200 flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg("")} className="text-rose-600 hover:text-rose-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Catalog & Basket Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Catalog Column (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Catalog Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2 font-outfit">
                    <Package className="w-4 h-4 text-violet-600" />
                    Store Items ({filteredAndSortedItems.length})
                  </h2>

                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        viewMode === "list" ? "bg-white text-violet-700 shadow-2xs font-black" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">List</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        viewMode === "grid" ? "bg-white text-violet-700 shadow-2xs font-black" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Grid</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {availableCategories.length > 0 && (
                    <div className="flex items-center gap-1">
                      {availableCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                            categoryFilter === cat ? "bg-violet-700 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {cat === "all" ? "All Items" : cat}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 shadow-2xs">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                      className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 text-[11px] sm:text-xs truncate"
                    >
                      <option value="code_asc">Sort: Code</option>
                      <option value="name_asc">Sort: Name (A-Z)</option>
                      <option value="name_desc">Sort: Name (Z-A)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search catalog items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-violet-500 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Items */}
            {loadingItems ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-600" />
                <p className="text-xs text-slate-500 mt-2 font-medium">Loading store item catalog...</p>
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                No store items found.
              </div>
            ) : viewMode === "list" ? (
              <div className="space-y-1.5">
                {paginatedItems.map(item => {
                  const parsedVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                  const selectedVarLabel = cardVariantMap[item.id] || (parsedVariants.length > 0 ? (parsedVariants.find(v => v.is_available !== false)?.label || parsedVariants[0].label) : "");

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-slate-200/90 px-2.5 py-2 shadow-2xs flex items-center justify-between gap-1.5 sm:gap-2 hover:border-violet-400/80 transition-all group min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm group-hover:text-violet-700 transition-colors truncate">
                          {item.item_name}
                        </div>
                      </div>

                      {parsedVariants.length > 0 && (
                        <div className="w-28 sm:w-44 shrink-0">
                          <select
                            value={selectedVarLabel}
                            onChange={e => setCardVariant(item.id, e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-violet-500 cursor-pointer text-slate-800 truncate"
                          >
                            {parsedVariants.map((v, idx) => (
                              <option key={idx} value={v.label} disabled={v.is_available === false}>
                                {v.label} {v.is_available === false ? "(Out of Stock)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => addItemToCart(item, selectedVarLabel)}
                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paginatedItems.map(item => {
                  const parsedVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                  const selectedVarLabel = cardVariantMap[item.id] || (parsedVariants.length > 0 ? (parsedVariants.find(v => v.is_available !== false)?.label || parsedVariants[0].label) : "");

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs hover:shadow-sm hover:border-violet-300 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{item.item_name}</div>
                      </div>

                      {parsedVariants.length > 0 && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Variety / Size</label>
                          <select
                            value={selectedVarLabel}
                            onChange={e => setCardVariant(item.id, e.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-violet-500 cursor-pointer text-slate-800 truncate"
                          >
                            {parsedVariants.map((v, idx) => (
                              <option key={idx} value={v.label} disabled={v.is_available === false}>
                                {v.label} {v.is_available === false ? "(Out of Stock)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => addItemToCart(item, selectedVarLabel)}
                        className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-98"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Add to Request</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <PaginationControls
              currentPage={page}
              totalItems={filteredAndSortedItems.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>

          {/* Right Column (5 cols): Multi-Item Basket (Desktop View) */}
          <div className="lg:col-span-5 hidden lg:block sticky top-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm font-outfit uppercase tracking-wide flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-violet-600" />
                  Request Basket ({cartItems.length})
                </h3>

                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCartItems([])}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Basket
                  </button>
                )}
              </div>

              {/* Basket Items List */}
              {cartItems.length > 0 ? (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                  {cartItems.map((ci, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs truncate">{ci.item_name}</div>
                        {ci.selected_variant && (
                          <div className="text-[10px] text-violet-700 font-semibold truncate">{ci.selected_variant}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(idx, -1)}
                          className="text-slate-500 hover:text-slate-800 p-0.5"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold w-4 text-center text-slate-800 text-xs">{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(idx, 1)}
                          className="text-slate-500 hover:text-slate-800 p-0.5"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs">
                  Your request basket is empty. Browse items on the left and click +Add.
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                disabled={isSubmitting || cartItems.length === 0 || !selectedUserId}
                onClick={handlePublicSubmit}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                  isSubmitting || cartItems.length === 0 || !selectedUserId
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-700 text-white active:scale-98"
                }`}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Submit Samvardhan Request ({cartItems.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Mobile Bottom Action Bar */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-4 left-3 right-3 z-40 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2.5 min-w-0 pl-1">
            <div className="w-9 h-9 rounded-xl bg-violet-500 text-slate-950 font-black text-xs flex items-center justify-center font-mono shrink-0 shadow-xs">
              {cartItems.length}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">
                {cartItems.length} {cartItems.length === 1 ? "Item" : "Items"} ({totalCartQty} total qty)
              </div>
              <div className="text-[10px] text-violet-300 font-medium">Tap to review & submit</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
            className="px-3.5 py-2 bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
          >
            <span>View & Submit</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Mobile Slide-Up Drawer / Popup Modal */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 max-w-lg w-full p-4 sm:p-5 space-y-4 max-h-[85vh] flex flex-col justify-between shadow-2xl animate-in slide-in-from-bottom duration-250">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-violet-600" />
                <h3 className="font-bold text-slate-800 text-base font-outfit">Selected Request List ({cartItems.length})</h3>
              </div>

              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCartItems([])}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* User Selection Warning if not picked */}
            {!selectedUserId && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Please select your name from Step 1 before submitting!</span>
              </div>
            )}

            {/* Modal Items List */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 custom-scrollbar">
              {cartItems.map((ci, idx) => {
                const storeItem = items.find(i => i.id === ci.item_id);
                const parsedVariants: ItemVariant[] = storeItem ? parseItemVariants(storeItem.variants, storeItem.cost) : [];

                return (
                  <div key={idx} className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 space-y-2 relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-6">
                        <div className="font-bold text-slate-800 text-xs truncate">{ci.item_name}</div>
                        {ci.selected_variant && (
                          <span className="text-[9px] font-bold bg-violet-100 text-violet-800 px-1.5 py-0.2 rounded font-mono">
                            {ci.selected_variant}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg absolute right-2 top-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {parsedVariants.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">Variety:</span>
                        <select
                          value={ci.selected_variant}
                          onChange={e => updateCartItemVariant(idx, e.target.value)}
                          className="bg-white px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-violet-500 w-full truncate text-slate-700"
                        >
                          {parsedVariants.map((v, vIdx) => (
                            <option key={vIdx} value={v.label} disabled={v.is_available === false}>
                              {v.label} {v.is_available === false ? "(Out of Stock)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(idx, -1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 font-bold active:scale-95"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={ci.quantity}
                          onChange={e => setCartItemQuantityDirect(idx, parseInt(e.target.value))}
                          className="w-8 text-center text-xs font-bold outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(idx, 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 font-bold active:scale-95"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-[10px] font-bold text-slate-500">
                        Qty: {ci.quantity}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Submit */}
            <div className="pt-3 border-t border-slate-200 space-y-3 shrink-0">
              <div className="bg-violet-50/80 p-3 rounded-xl border border-violet-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                  <span>Total Request Items:</span>
                  <span className="font-bold text-slate-800">{cartItems.length} items ({totalCartQty} total qty)</span>
                </div>
                {selectedUserObj && (
                  <div className="flex items-center justify-between text-xs text-violet-800 font-bold">
                    <span>Requesting For:</span>
                    <span>{selectedUserObj.full_name}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isSubmitting || cartItems.length === 0 || !selectedUserId}
                onClick={async () => {
                  await handlePublicSubmit();
                  setIsMobileCartOpen(false);
                }}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Submitting Requests...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Submit Samvardhan Request ({cartItems.length})</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Confirmation Receipt Modal */}
      {submittedReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-black text-slate-900 text-xl font-outfit">Request Submitted!</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-medium">
                Successfully submitted <span className="font-bold text-violet-800">{submittedReceipt.count} items</span> for{" "}
                <span className="font-bold text-slate-900">{submittedReceipt.userName}</span>. Your request has been queued for store admin approval.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Status: <strong className="text-amber-700 uppercase">Pending Store Admin Approval</strong></span>
            </div>

            <button
              type="button"
              onClick={() => setSubmittedReceipt(null)}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all"
            >
              Done / Create Another Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
