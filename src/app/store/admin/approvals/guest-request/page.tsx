"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Search,
  UserPlus,
  User,
  Calendar,
  Package,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Filter,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  Building,
  Phone,
  ArrowRight
} from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import {
  parseItemVariants,
  getVariantCost,
  matchStoreItem,
  getFullVariantProductName,
  filterVariantsForSearch,
  ItemVariant
} from "@/lib/store-variant-utils";
import { PaginationControls } from "@/components/PaginationControls";

interface StoreItem {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  cost: number;
  variants: any[];
}

interface SelectedRequestItem {
  item_id: string;
  item_name: string;
  item_code: string;
  category: string;
  selected_variant: string;
  unit_cost: number;
  quantity: number;
}

export default function CreateGuestRequestPage() {
  const router = useRouter();
  const { storeUser, loading: authLoading } = useStoreAuth();

  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<StoreItem[]>([]);

  // Guest Information
  const [guestName, setGuestName] = useState("");
  const [guestTemple, setGuestTemple] = useState("");
  const [guestMobile, setGuestMobile] = useState("");
  const [requestDate, setRequestDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // View mode switcher: 'list' (default) or 'grid'
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Multi-item cart list state
  const [cartItems, setCartItems] = useState<SelectedRequestItem[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        setIsKeyboardOpen(false);
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    const vv = window.visualViewport;
    const handleVvResize = () => {
      if (vv) {
        setIsKeyboardOpen(vv.height < window.innerHeight * 0.8);
      }
    };

    if (vv) {
      vv.addEventListener("resize", handleVvResize);
    }

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      if (vv) {
        vv.removeEventListener("resize", handleVvResize);
      }
    };
  }, []);

  // Catalog item search, category filter, and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "General" | "Internal">("all");
  const [sortBy, setSortBy] = useState<"code_asc" | "name_asc" | "name_desc">("code_asc");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchItems(session.access_token);
      }
    });
  }, []);

  const fetchItems = async (token: string) => {
    const res = await fetch("/api/store/items?all=true", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data);
    }
  };

  // Filtered categories
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(i => {
      if (i.category && i.category.trim()) cats.add(i.category.trim());
    });
    const catList = Array.from(cats);
    if (catList.length <= 1) return [];
    return ["all", ...catList];
  }, [items]);

  // Filtered and sorted catalog items
  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter(item => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        return matchStoreItem(item, searchQuery);
      })
      .sort((a, b) => {
        if (sortBy === "code_asc")
          return (a.item_code || "").localeCompare(b.item_code || "", undefined, {
            numeric: true
          });
        if (sortBy === "name_asc")
          return (a.item_name || "").localeCompare(b.item_name || "");
        if (sortBy === "name_desc")
          return (b.item_name || "").localeCompare(a.item_name || "");
        return 0;
      });
  }, [items, searchQuery, categoryFilter, sortBy]);

  // Reset page to 1 on filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, sortBy, pageSize]);

  // Paginated catalog items
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredAndSortedItems.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedItems, page, pageSize]);

  // Add item to multi-item cart list
  const addItemToCart = (item: StoreItem, chosenVariantLabel?: string) => {
    const parsed = parseItemVariants(item.variants, item.cost);
    const chosenVariant =
      chosenVariantLabel !== undefined
        ? chosenVariantLabel
        : parsed.length > 0
        ? parsed.find(v => v.is_available !== false)?.label || parsed[0].label
        : "";
    const unitCost = getVariantCost(chosenVariant, item.variants, item.cost);

    setCartItems(prev => {
      const existingIdx = prev.findIndex(
        ci => ci.item_id === item.id && ci.selected_variant === chosenVariant
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          item_id: item.id,
          item_name: item.item_name,
          item_code: item.item_code,
          category: item.category,
          selected_variant: chosenVariant,
          unit_cost: unitCost,
          quantity: 1
        }
      ];
    });
    setSuccessMsg("");
    setErrorMsg("");
  };

  // Update item variant in cart
  const updateCartItemVariant = (index: number, newVariant: string) => {
    setCartItems(prev => {
      const copy = [...prev];
      const target = copy[index];
      const storeItem = items.find(i => i.id === target.item_id);
      if (storeItem) {
        target.selected_variant = newVariant;
        target.unit_cost = getVariantCost(newVariant, storeItem.variants, storeItem.cost);
      }
      return copy;
    });
  };

  // Update item quantity in cart
  const updateCartItemQuantity = (index: number, delta: number) => {
    setCartItems(prev => {
      const copy = [...prev];
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      copy[index].quantity = newQty;
      return copy;
    });
  };

  // Remove item from cart
  const removeCartItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  // Totals
  const totalCartQty = useMemo(
    () => cartItems.reduce((acc, ci) => acc + ci.quantity, 0),
    [cartItems]
  );
  const totalCartCost = useMemo(
    () => cartItems.reduce((acc, ci) => acc + ci.unit_cost * ci.quantity, 0),
    [cartItems]
  );

  // Submit Guest Request (Auto-Approved for Admin)
  const handleSubmit = async () => {
    if (!session || cartItems.length === 0) return;
    if (!guestName.trim()) {
      setErrorMsg("Please enter the guest's full name.");
      return;
    }

    setIsSubmitting(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const token = session.access_token;
      const firstItem = cartItems[0];

      // Submit first item to create guest user record & request
      const resFirst = await fetch("/api/store/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          is_guest: true,
          guest_name: guestName.trim(),
          guest_temple: guestTemple.trim() || "Guest Temple",
          guest_mobile: guestMobile.trim() || "N/A",
          item_id: firstItem.item_id,
          quantity: firstItem.quantity,
          request_date: requestDate || undefined,
          auto_approve: true,
          selected_variant: JSON.stringify({
            variant: firstItem.selected_variant || "",
            snapshot_item_name: firstItem.item_name,
            snapshot_item_code: firstItem.item_code,
            snapshot_cost: firstItem.unit_cost,
            source: "Guest Entry",
            approved_by: storeUser?.full_name || storeUser?.email || "Admin"
          })
        })
      });

      if (!resFirst.ok) {
        const err = await resFirst.json().catch(() => ({}));
        setErrorMsg("Error creating guest request: " + (err.error || "Failed to create"));
        setIsSubmitting(false);
        return;
      }

      const firstData = await resFirst.json();
      const guestUserId = firstData.user_id;

      // Submit remaining items using generated guestUserId
      if (cartItems.length > 1 && guestUserId) {
        const remainingItems = cartItems.slice(1);
        await Promise.all(
          remainingItems.map(item =>
            fetch("/api/store/requests", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                target_user_id: guestUserId,
                item_id: item.item_id,
                quantity: item.quantity,
                request_date: requestDate || undefined,
                auto_approve: true,
                selected_variant: JSON.stringify({
                  variant: item.selected_variant || "",
                  snapshot_item_name: item.item_name,
                  snapshot_item_code: item.item_code,
                  snapshot_cost: item.unit_cost,
                  source: "Guest Entry",
                  approved_by: storeUser?.full_name || storeUser?.email || "Admin"
                })
              })
            })
          )
        );
      }

      setSuccessMsg(
        `Successfully created & auto-approved guest request for ${guestName.trim()} (${cartItems.length} item(s))!`
      );
      setTimeout(() => {
        router.push("/store/admin/approvals");
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit guest request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href="/store/admin/approvals"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Back to Approvals"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2 font-outfit">
              <UserPlus className="w-6 h-6 text-purple-600" />
              Create Guest Request
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Create an auto-approved store item request for senior monks, visitors, or guest devotees.
            </p>
          </div>
        </div>

        <Link
          href="/store/admin/approvals"
          className="text-xs font-bold text-slate-600 hover:text-slate-900 underline flex items-center gap-1 self-start sm:self-auto"
        >
          Cancel & Return to Approvals
        </Link>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Step 1: Guest Information & Date */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <h2 className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
          <User className="w-4 h-4 text-purple-600" />
          Step 1: Guest Information & Request Date
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Guest Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. HH Jayapataka Swami"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              Temple / Location
            </label>
            <input
              type="text"
              placeholder="e.g. ISKCON Mayapur"
              value={guestTemple}
              onChange={e => setGuestTemple(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              Mobile Number (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. +91 98765 43210"
              value={guestMobile}
              onChange={e => setGuestMobile(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Request Date
            </label>
            <input
              type="date"
              value={requestDate}
              onChange={e => setRequestDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-slate-800 cursor-pointer"
            />
          </div>

        </div>
      </div>

      {/* Catalog Items Section (Full Width) */}
      <div className="space-y-4">
          
        {/* Controls Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-800 font-outfit">
                  Store Item Catalog ({filteredAndSortedItems.length})
                </h2>

                {/* View Switcher */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 ml-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      viewMode === "list"
                        ? "bg-white text-purple-700 shadow-2xs font-black"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      viewMode === "grid"
                        ? "bg-white text-purple-700 shadow-2xs font-black"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                </div>

                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(true)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer ml-1"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Review & Submit ({cartItems.length})</span>
                  </button>
                )}
              </div>

              {/* Category Pills & Sort Dropdown */}
              <div className="flex flex-wrap items-center gap-2">
                {availableCategories.length > 0 && (
                  <div className="flex items-center gap-1">
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                          categoryFilter === cat
                            ? "bg-purple-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {cat === "all" ? "All" : cat}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 border border-slate-200 rounded-xl text-xs font-medium text-slate-600">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 text-[11px] truncate"
                  >
                    <option value="code_asc">Code</option>
                    <option value="name_asc">Name A-Z</option>
                    <option value="name_desc">Name Z-A</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Catalog Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search catalog by item name, code, or variety..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Catalog Open Tree Diagram */}
          {viewMode === "list" ? (
            <div className="space-y-3">
              {paginatedItems.map(item => {
                const rawVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                const parsedVariants = filterVariantsForSearch(item, rawVariants, searchQuery);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs hover:border-purple-400/80 transition-all space-y-2.5 min-w-0"
                  >
                    {/* Main Item Root Node */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-purple-600 shrink-0" />
                        <span className="font-bold text-slate-900 text-xs sm:text-sm break-words">
                          {item.item_name}
                        </span>
                        {item.category && (
                          <span
                            className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 uppercase tracking-wider ${
                              item.category === "Internal"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {item.category}
                          </span>
                        )}
                      </div>
                      {parsedVariants.length === 0 && (
                        <span className="text-xs sm:text-sm font-black text-slate-900 font-mono shrink-0">
                          ₹{item.cost || 0}
                        </span>
                      )}
                    </div>

                    {/* Open Tree Branches: All Variants List */}
                    {parsedVariants.length > 0 ? (
                      <div className="ml-2.5 pl-3 border-l-2 border-purple-300/80 space-y-1.5 pt-0.5">
                        {parsedVariants.map((v, idx) => {
                          const avail = v.is_available !== false;
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-xl bg-slate-50/90 hover:bg-purple-50/70 border border-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-purple-500 font-bold text-xs select-none">
                                  └─
                                </span>
                                <div className="min-w-0">
                                  <span
                                    className={`text-xs font-bold ${
                                      avail ? "text-slate-800" : "text-slate-400 line-through"
                                    }`}
                                  >
                                    {v.label}
                                  </span>
                                  <span className="ml-2 text-[11px] font-mono text-purple-800 font-bold">
                                    ₹{v.cost}
                                  </span>
                                  {!avail && (
                                    <span className="ml-2 text-[9px] font-bold text-rose-500 uppercase bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                      Out of Stock
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={!avail}
                                onClick={() => addItemToCart(item, v.label)}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Add</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Standard Item Node */
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-xs text-slate-500 font-medium italic">
                          Standard Item
                        </span>
                        <button
                          type="button"
                          onClick={() => addItemToCart(item, "")}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Add</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredAndSortedItems.length === 0 && (
                <div className="bg-white p-8 text-center text-slate-400 font-medium rounded-2xl border border-slate-200 text-xs">
                  No store items found matching "{searchQuery}"
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paginatedItems.map(item => {
                const rawVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                const parsedVariants = filterVariantsForSearch(item, rawVariants, searchQuery);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs hover:border-purple-400/80 transition-all flex flex-col justify-between space-y-3 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-purple-600 shrink-0" />
                        <span className="font-bold text-slate-900 text-xs sm:text-sm break-words">
                          {item.item_name}
                        </span>
                      </div>
                      {item.category && (
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                            item.category === "Internal"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {item.category}
                        </span>
                      )}
                    </div>

                    {parsedVariants.length > 0 ? (
                      <div className="ml-2.5 pl-3 border-l-2 border-purple-300/80 space-y-1.5 pt-0.5 flex-1">
                        {parsedVariants.map((v, idx) => {
                          const avail = v.is_available !== false;
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-xl bg-slate-50/90 hover:bg-purple-50/70 border border-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-purple-500 font-bold text-xs select-none">
                                  └─
                                </span>
                                <div className="min-w-0">
                                  <span
                                    className={`text-xs font-bold ${
                                      avail ? "text-slate-800" : "text-slate-400 line-through"
                                    }`}
                                  >
                                    {v.label}
                                  </span>
                                  <span className="ml-2 text-[11px] font-mono text-purple-800 font-bold">
                                    ₹{v.cost}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={!avail}
                                onClick={() => addItemToCart(item, v.label)}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Add</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-sm font-black text-slate-900 font-mono">
                          ₹{item.cost || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItemToCart(item, "")}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Add</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <PaginationControls
              currentPage={page}
              pageSize={pageSize}
              totalItems={filteredAndSortedItems.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 20, 30]}
            />
          </div>
        </div>

      {/* Floating Action Bar for Review & Submit (Fixed at Bottom Center) */}
      {!isKeyboardOpen && cartItems.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 max-w-xl w-[92vw] sm:w-[500px] z-[1001] bg-slate-900/95 backdrop-blur-md text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-purple-500/40 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300 ring-1 ring-white/10">
          <div className="flex items-center gap-3 min-w-0 pl-1">
            <div className="w-10 h-10 rounded-xl bg-purple-500 text-slate-950 font-black text-sm flex items-center justify-center font-mono shrink-0 shadow-md">
              {cartItems.length}
            </div>
            <div className="truncate">
              <div className="text-xs sm:text-sm font-bold text-white truncate">
                {cartItems.length} {cartItems.length === 1 ? "Item" : "Items"} ({totalCartQty} total qty)
              </div>
              <div className="text-[11px] text-purple-300 font-bold font-mono">
                Est. Total: ₹{totalCartCost.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsReviewModalOpen(true)}
            className="px-4 py-2.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center gap-2 shadow-lg active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Review & Submit</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Review & Submit Request Popup Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[1002] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[90vh] flex flex-col justify-between shadow-2xl animate-in slide-in-from-bottom duration-250">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-800 text-base font-outfit">
                  Review Request List ({cartItems.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCartItems([])}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Guest Details Warning or Info */}
            {!guestName.trim() ? (
              <div className="bg-purple-50 border border-purple-200 text-purple-900 p-3 rounded-xl text-xs flex items-center gap-2 font-medium shrink-0">
                <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Please enter the Guest's Full Name in Step 1 before submitting!</span>
              </div>
            ) : (
              <div className="bg-purple-50/70 border border-purple-200/80 p-3 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">
                    Guest Request For:
                  </span>
                  <span className="font-bold text-slate-900 text-xs truncate block">
                    {guestName} {guestTemple ? `(${guestTemple})` : ""} {guestMobile ? `• ${guestMobile}` : ""}
                  </span>
                </div>
                <span className="text-[10px] bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                  Date: {requestDate}
                </span>
              </div>
            )}

            {/* Modal Scrollable Items List */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 custom-scrollbar min-h-[160px]">
              {cartItems.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="text-xs font-bold text-slate-600">
                    Request Basket is Empty
                  </div>
                  <div className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Add items from the catalog tree list to review them here.
                  </div>
                </div>
              ) : (
                cartItems.map((ci, idx) => {
                  const storeItem = items.find(i => i.id === ci.item_id);
                  const parsedVariants: ItemVariant[] = storeItem
                    ? parseItemVariants(storeItem.variants, storeItem.cost)
                    : [];

                  return (
                    <div
                      key={idx}
                      className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 space-y-2 relative"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 pr-6">
                          <div className="font-bold text-slate-800 text-xs truncate">
                            {getFullVariantProductName(ci.item_name, ci.selected_variant)}
                          </div>
                          <span className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-mono">
                            ₹{ci.unit_cost} / unit
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeCartItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg absolute right-2 top-2 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {parsedVariants.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 shrink-0">
                            Variety:
                          </span>
                          <select
                            value={ci.selected_variant}
                            onChange={e => updateCartItemVariant(idx, e.target.value)}
                            className="bg-white px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-purple-500 w-full truncate text-slate-700 cursor-pointer"
                          >
                            {parsedVariants.map((v, vIdx) => {
                              const fullProdName = getFullVariantProductName(
                                storeItem?.item_name || ci.item_name,
                                v.label
                              );
                              return (
                                <option
                                  key={vIdx}
                                  value={v.label}
                                  disabled={v.is_available === false}
                                >
                                  {fullProdName} (₹{v.cost})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(idx, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold active:scale-95 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={ci.quantity}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10) || 1;
                              const copy = [...cartItems];
                              copy[idx].quantity = Math.max(1, val);
                              setCartItems(copy);
                            }}
                            className="w-8 text-center text-xs font-bold outline-none bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(idx, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold active:scale-95 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Subtotal
                          </span>
                          <span className="font-black text-purple-900 font-mono text-xs">
                            ₹{(ci.unit_cost * ci.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer Submit */}
            <div className="pt-3 border-t border-slate-200 space-y-3 shrink-0">
              <div className="bg-purple-50/80 p-3 rounded-xl border border-purple-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                  <span>Total Items:</span>
                  <span className="font-bold text-slate-800">
                    {cartItems.length} items ({totalCartQty} total qty)
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-black text-purple-900">
                  <span>Total Estimated Cost:</span>
                  <span className="text-base font-mono">
                    ₹{totalCartCost.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmitting || cartItems.length === 0 || !guestName.trim()}
                onClick={async () => {
                  await handleSubmit();
                  setIsReviewModalOpen(false);
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Submitting Guest Request...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Submit & Auto-Approve Guest Request ({cartItems.length})</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
