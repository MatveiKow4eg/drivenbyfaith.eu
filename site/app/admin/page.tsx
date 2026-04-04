"use client";

import { FormEvent, type CSSProperties, useEffect, useMemo, useState } from "react";

type AdminRole = "OWNER" | "ADMIN" | "SUPPORT";

type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
  isActive: boolean;
  images: Array<{
    id: string;
    path: string;
    alt: string | null;
    isMain: boolean;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    size: string;
    color: string;
    isActive: boolean;
    inventory: { quantity: number; reservedQuantity: number } | null;
    prices: Array<{ currency: "EUR"; amountMinor: number; isActive: boolean }>;
  }>;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: "PENDING" | "PAID" | "PROCESSING" | "SHIPPED" | "CANCELED" | "REFUNDED";
  email: string;
  totalMinor: number;
  currency: "EUR";
  createdAt: string;
};

type AdminPromo = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  isActive: boolean;
};

type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type MeResponse = {
  admin: {
    id: string;
    email: string;
    role: AdminRole;
  };
};

type VariantSize = "S" | "M" | "L" | "XL" | "XXL" | "XXXL";
type AdminTab = "products" | "orders" | "promos" | "users";
type Toast = { id: number; text: string; kind: "success" | "error" };
type ProductDraft = { name: string; slug: string; category: string; description: string; isActive: boolean };
const SIZE_OPTIONS: readonly VariantSize[] = ["S", "M", "L", "XL", "XXL", "XXXL"];

function deriveCategoryFromProduct(product: AdminProduct): string {
  const fromDb = product.category?.trim();
  return fromDb && fromDb.length > 0 ? fromDb : "General";
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.drivenbyfaith.eu/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

function resolveProductImageSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (path.startsWith("/products/")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${API_ORIGIN}${path}`;
  }
  return `${API_ORIGIN}/${path}`;
}

const color = {
  bg: "#050505",
  card: "#0f0f10",
  cardSoft: "#141416",
  border: "#252529",
  text: "#f4f4f5",
  muted: "#a3a3ad",
  accent: "#ffffff",
  accentText: "#0a0a0a",
  danger: "#c33131",
  success: "#17803d"
};

const inputStyle: CSSProperties = {
  background: "#09090b",
  color: color.text,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: "10px 12px"
};

const buttonStyle: CSSProperties = {
  background: color.accent,
  color: color.accentText,
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer"
};

const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: color.text,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

function toSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: color.muted
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const inputWithSuffixStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 10,
  background: "#09090b",
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  paddingRight: 12
};

const suffixStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: color.muted,
  letterSpacing: 0.3,
  textTransform: "uppercase"
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical"
};

function formatEurMinorForInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function parseEurInputToMinor(value: string) {
  const normalized = value.replace(",", ".").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * 100);
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("products");
  const [email, setEmail] = useState("admin@drivenbyfaith.eu");
  const [password, setPassword] = useState("ChangeMe123!");
  const [statusText, setStatusText] = useState("Not authenticated");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [me, setMe] = useState<MeResponse["admin"] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});

  const [newProductName, setNewProductName] = useState("");
  const [newProductSlug, setNewProductSlug] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("General");
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState("");

  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>("ADMIN");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");

  const [variantSize, setVariantSize] = useState<VariantSize>("M");
  const [variantColor, setVariantColor] = useState("Black");
  const [variantInventory, setVariantInventory] = useState(20);
  const [variantPriceInput, setVariantPriceInput] = useState("39.00");
  const [variantIsActive, setVariantIsActive] = useState(true);

  const [imagePath, setImagePath] = useState("/products/sunrise.png");
  const [imageAlt, setImageAlt] = useState("Product image");
  const [imageIsMain, setImageIsMain] = useState(true);
  const [imageSortOrder, setImageSortOrder] = useState(1);

  const [orderFilter, setOrderFilter] = useState<AdminOrder["status"] | "ALL">("ALL");

  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [promoDrafts, setPromoDrafts] = useState<
    Record<string, { code: string; type: "PERCENT" | "FIXED"; value: number; isActive: boolean }>
  >({});

  const selectedProduct = useMemo(() => products.find((p) => p.id === selectedProductId) ?? null, [products, selectedProductId]);
  const selectedVariant = useMemo(
    () => selectedProduct?.variants.find((v) => v.id === selectedVariantId) ?? null,
    [selectedProduct, selectedVariantId]
  );
  const editingProduct = useMemo(() => products.find((p) => p.id === editingProductId) ?? null, [products, editingProductId]);
  const editingProductDraft = useMemo<ProductDraft | null>(() => {
    if (!editingProduct) return null;
    return (
      productDrafts[editingProduct.id] ?? {
        name: editingProduct.name,
        slug: editingProduct.slug,
        category: editingProduct.category?.trim() || "General",
        description: editingProduct.description?.trim() || "",
        isActive: editingProduct.isActive
      }
    );
  }, [editingProduct, productDrafts]);
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const activeProductsSorted = useMemo(
    () => [...activeProducts].sort((a, b) => `${deriveCategoryFromProduct(a)} ${a.name}`.localeCompare(`${deriveCategoryFromProduct(b)} ${b.name}`)),
    [activeProducts]
  );
  const visibleOrders = useMemo(
    () => orders.filter((o) => (orderFilter === "ALL" ? true : o.status === orderFilter)),
    [orders, orderFilter]
  );

  function pushToast(text: string, kind: Toast["kind"]) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("dbf_admin_token");
    if (stored) {
      setToken(stored);
      setStatusText("Token restored");
    }
  }, []);

  useEffect(() => {
    if (token) {
      window.localStorage.setItem("dbf_admin_token", token);
    } else {
      window.localStorage.removeItem("dbf_admin_token");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function authedRequest(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers
    });
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    setStatusText("Signing in...");

    const response = await fetch(`${API_BASE}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      setStatusText(data.message ?? "Login failed");
      pushToast(data.message ?? "Login failed", "error");
      return;
    }

    setToken(data.token);
    setStatusText(`Authenticated as ${data.admin.email}`);
    pushToast("Signed in", "success");
  }

  async function loadAll() {
    if (!token) {
      setStatusText("Login first");
      return;
    }

    setStatusText("Loading admin data...");

    const [meRes, productsRes, ordersRes, promosRes, usersRes] = await Promise.all([
      authedRequest("/admin/me", { method: "GET" }),
      authedRequest("/admin/products", { method: "GET" }),
      authedRequest("/admin/orders", { method: "GET" }),
      authedRequest("/admin/promocodes", { method: "GET" }),
      authedRequest("/admin/users", { method: "GET" })
    ]);

    if (!meRes.ok || !productsRes.ok || !ordersRes.ok || !promosRes.ok || !usersRes.ok) {
      setStatusText("Failed to load one or more admin resources");
      pushToast("Failed to load data", "error");
      return;
    }

    const meData: MeResponse = await meRes.json();
    const productsData: AdminProduct[] = await productsRes.json();
    const ordersData: AdminOrder[] = await ordersRes.json();
    const promosData: AdminPromo[] = await promosRes.json();
    const usersData: AdminUser[] = await usersRes.json();

    setMe(meData.admin);
    setProducts(productsData);
    setOrders(ordersData);
    setPromos(promosData);
    setUsers(usersData);
    setProductDrafts(
      Object.fromEntries(
        productsData.map((p) => [
          p.id,
          {
            name: p.name,
            slug: p.slug,
            category: p.category?.trim() || "General",
            description: p.description?.trim() || "",
            isActive: p.isActive
          }
        ])
      )
    );
    setPromoDrafts(
      Object.fromEntries(promosData.map((p) => [p.id, { code: p.code, type: p.type, value: p.value, isActive: p.isActive }]))
    );
    setStatusText(`Admin data loaded (${meData.admin.role})`);
    pushToast("Data refreshed", "success");
  }

  function logout() {
    setToken("");
    setMe(null);
    setProducts([]);
    setOrders([]);
    setPromos([]);
    setUsers([]);
    setStatusText("Signed out");
    pushToast("Signed out", "success");
  }

  function patchProductDraft(id: string, patch: Partial<ProductDraft>) {
    setProductDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { name: "", slug: "", category: "General", description: "", isActive: true }),
        ...patch
      }
    }));
  }

  function patchPromoDraft(id: string, patch: Partial<{ code: string; type: "PERCENT" | "FIXED"; value: number; isActive: boolean }>) {
    setPromoDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { code: "", type: "PERCENT", value: 10, isActive: true }),
        ...patch
      }
    }));
  }

  async function createProduct(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const response = await authedRequest("/admin/products", {
      method: "POST",
      body: JSON.stringify({
        name: newProductName,
        slug: newProductSlug,
        category: newProductCategory,
        description: "Created from admin panel",
        isActive: true
      })
    });

    if (!response.ok) {
      const data = await response.json();
      setStatusText(data.message ?? "Create product failed");
      pushToast(data.message ?? "Create product failed", "error");
      return;
    }

    setNewProductName("");
    setNewProductSlug("");
    setNewProductCategory("General");
    setShowCreateProductForm(false);
    pushToast("Product created", "success");
    await loadAll();
  }

  async function createAdminUser(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const response = await authedRequest("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: newAdminEmail,
        password: newAdminPassword,
        role: newAdminRole,
        isActive: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      pushToast(data.message ?? "Create admin user failed", "error");
      return;
    }

    setNewAdminEmail("");
    setNewAdminPassword("");
    setNewAdminRole("ADMIN");
    pushToast(`Admin user created: ${data.email}`, "success");
    await loadAll();
  }

  async function persistProductDraft(productId: string) {
    const draft = productDrafts[productId];
    if (!draft) {
      return;
    }

    const response = await authedRequest(`/admin/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(draft)
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message ?? "Product update failed");
    }
  }

  async function addImageToProduct(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedProductId) return;

    const response = await authedRequest(`/admin/products/${selectedProductId}/images`, {
      method: "POST",
      body: JSON.stringify({
        path: imagePath,
        alt: imageAlt,
        isMain: imageIsMain,
        sortOrder: imageSortOrder
      })
    });

    if (!response.ok) {
      const data = await response.json();
      pushToast(data.message ?? "Add image failed", "error");
      return;
    }

    pushToast("Image attached", "success");
    await loadAll();
  }

  async function createVariant(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedProductId) return;

    const response = await authedRequest("/admin/variants", {
      method: "POST",
      body: JSON.stringify({
        productId: selectedProductId,
        size: variantSize,
        color: variantColor,
        inventoryQty: variantInventory,
        priceEURMinor: parseEurInputToMinor(variantPriceInput),
        isActive: true
      })
    });

    if (!response.ok) {
      const data = await response.json();
      pushToast(data.message ?? "Create variant failed", "error");
      return;
    }

    pushToast("Variant created", "success");
    await loadAll();
  }

  async function persistSelectedVariantMeta() {
    if (!selectedVariantId) {
      return;
    }

    const response = await authedRequest(`/admin/variants/${selectedVariantId}`, {
      method: "PATCH",
      body: JSON.stringify({
        size: variantSize,
        color: variantColor,
        isActive: variantIsActive
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message ?? "Update variant failed");
    }
  }

  async function persistSelectedVariantPrice() {
    if (!selectedVariantId) {
      return;
    }

    const response = await authedRequest(`/admin/variants/${selectedVariantId}/prices`, {
      method: "PUT",
      body: JSON.stringify({ eurMinor: parseEurInputToMinor(variantPriceInput) })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message ?? "Update prices failed");
    }
  }

  async function persistSelectedVariantInventory() {
    if (!selectedVariantId) {
      return;
    }

    const response = await authedRequest(`/admin/variants/${selectedVariantId}/inventory`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: variantInventory, reservedQuantity: 0 })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message ?? "Update inventory failed");
    }
  }

  async function saveEditorChanges() {
    if (!token || !editingProduct) {
      return;
    }

    try {
      await persistProductDraft(editingProduct.id);

      if (selectedVariantId) {
        await persistSelectedVariantMeta();
        await persistSelectedVariantPrice();
        await persistSelectedVariantInventory();
      }

      pushToast(selectedVariantId ? "Product and variant saved" : "Product saved", "success");
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      pushToast(message, "error");
    }
  }

  async function savePromoInline(promoId: string) {
    const draft = promoDrafts[promoId];
    if (!draft) return;

    const response = await authedRequest(`/admin/promocodes/${promoId}`, {
      method: "PATCH",
      body: JSON.stringify(draft)
    });

    if (!response.ok) {
      const data = await response.json();
      pushToast(data.message ?? "Promo update failed", "error");
      return;
    }

    pushToast("Promo updated", "success");
    await loadAll();
  }

  async function updateOrderStatus(orderId: string, status: AdminOrder["status"]) {
    const response = await authedRequest(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      pushToast("Order status update failed", "error");
      return;
    }

    pushToast("Order status updated", "success");
    await loadAll();
  }

  const tabs: Array<{ key: AdminTab; label: string }> = [
    { key: "products", label: "Products" },
    { key: "orders", label: "Orders" },
    { key: "promos", label: "Promos" },
    { key: "users", label: "Users" }
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        maxWidth: activeTab === "products" ? "100%" : 1240,
        width: "100%",
        margin: "0 auto",
        color: color.text,
        background: `radial-gradient(circle at top right, #19191d 0%, ${color.bg} 45%, #020202 100%)`,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"
      }}
    >
      <h1 style={{ fontSize: 34, marginBottom: 8, letterSpacing: 0.5, color: "#fff" }}>Driven By Faith Admin</h1>
      <p style={{ marginBottom: 14, color: color.muted }}>{statusText}</p>

      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 50, display: "grid", gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              color: "#fff",
              background: t.kind === "success" ? color.success : color.danger,
              boxShadow: "0 4px 18px rgba(0,0,0,0.3)",
              fontSize: 13
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {!token ? (
        <section style={{ border: `1px solid ${color.border}`, background: color.card, borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12, color: "#fff" }}>Login</h2>
          <form onSubmit={login} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" />
            <input
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
            <button style={buttonStyle} type="submit">
              Login
            </button>
          </form>
        </section>
      ) : (
        <>
          <section
            style={{
              border: `1px solid ${color.border}`,
              background: color.card,
              borderRadius: 14,
              padding: 12,
              marginBottom: 18,
              display: "flex",
              gap: 8,
              flexWrap: "wrap"
            }}
          >
            <button style={buttonStyle} onClick={loadAll}>
              Refresh Data
            </button>
            <button style={ghostButtonStyle} onClick={logout}>
              Logout
            </button>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...(activeTab === tab.key ? buttonStyle : ghostButtonStyle),
                  opacity: activeTab === tab.key ? 1 : 0.85
                }}
              >
                {tab.label}
              </button>
            ))}
          </section>

          {activeTab === "products" ? (
            <section
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: editingProduct ? "minmax(0, 1.7fr) minmax(360px, 460px)" : "1fr",
                gap: 18,
                alignItems: "start"
              }}
            >
              <div style={{ border: `1px solid ${color.border}`, background: color.card, borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    padding: 16,
                    borderBottom: `1px solid ${color.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    position: "sticky",
                    top: 0,
                    background: color.card,
                    zIndex: 2
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>Products</h2>
                    <p style={{ color: color.muted, fontSize: 13 }}>{activeProducts.length} active products. Simple list on the left, focused editor on the right.</p>
                  </div>
                  <button style={buttonStyle} onClick={() => setShowCreateProductForm((v) => !v)}>
                    {showCreateProductForm ? "Close" : "Create Product"}
                  </button>
                </div>

                {showCreateProductForm ? (
                  <form
                    onSubmit={createProduct}
                    style={{
                      padding: 16,
                      borderBottom: `1px solid ${color.border}`,
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1.2fr) minmax(180px, 1fr) minmax(160px, 1fr) auto",
                      gap: 10,
                      alignItems: "center"
                    }}
                  >
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Product Name</span>
                      <input
                        style={inputStyle}
                        value={newProductName}
                        onChange={(e) => {
                          const name = e.target.value;
                          setNewProductName(name);
                          setNewProductSlug(toSlug(name));
                        }}
                        placeholder="Black Oversized Tee"
                      />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Product Slug</span>
                      <input style={inputStyle} value={newProductSlug} onChange={(e) => setNewProductSlug(e.target.value)} placeholder="black-oversized-tee" />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Category</span>
                      <input style={inputStyle} value={newProductCategory} onChange={(e) => setNewProductCategory(e.target.value)} placeholder="T-Shirts" />
                    </div>
                    <button style={buttonStyle} type="submit">
                      Create
                    </button>
                  </form>
                ) : null}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "112px minmax(180px, 1.1fr) minmax(140px, 0.9fr) minmax(260px, 1.6fr) minmax(140px, 0.9fr) auto",
                    gap: 12,
                    padding: "12px 16px",
                    fontSize: 12,
                    color: color.muted,
                    borderBottom: `1px solid ${color.border}`,
                    letterSpacing: 0.3,
                    textTransform: "uppercase"
                  }}
                >
                  <span>Image</span>
                  <span>Name</span>
                  <span>Category</span>
                  <span>Description</span>
                  <span>Variants</span>
                  <span></span>
                </div>

                <div style={{ display: "grid" }}>
                  {activeProductsSorted.map((product) => {
                    const mainImage = product.images.find((img) => img.isMain) ?? product.images[0];
                    const hasBrokenImage = mainImage?.id ? brokenImageIds[mainImage.id] : false;

                    return (
                      <div
                        key={product.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "112px minmax(180px, 1.1fr) minmax(140px, 0.9fr) minmax(260px, 1.6fr) minmax(140px, 0.9fr) auto",
                          gap: 12,
                          padding: 16,
                          alignItems: "center",
                          borderBottom: `1px solid ${color.border}`,
                          background: editingProductId === product.id ? "#17171a" : "transparent"
                        }}
                      >
                        {!mainImage?.path || hasBrokenImage ? (
                          <div
                            style={{
                              width: 96,
                              height: 96,
                              borderRadius: 10,
                              border: `1px solid ${color.border}`,
                              background: color.cardSoft,
                              color: color.muted,
                              display: "grid",
                              placeItems: "center",
                              fontSize: 12
                            }}
                          >
                            No image
                          </div>
                        ) : (
                          <img
                            src={resolveProductImageSrc(mainImage.path)}
                            alt={mainImage.alt ?? product.name}
                            onError={() => {
                              if (mainImage.id) {
                                setBrokenImageIds((prev) => ({ ...prev, [mainImage.id]: true }));
                              }
                            }}
                            style={{
                              width: 96,
                              height: 96,
                              objectFit: "cover",
                              borderRadius: 10,
                              border: `1px solid ${color.border}`,
                              background: color.cardSoft
                            }}
                          />
                        )}

                        <div>
                          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>{product.name}</div>
                          <div style={{ fontSize: 12, color: color.muted }}>{product.slug}</div>
                        </div>
                        <div style={{ color: color.text }}>{deriveCategoryFromProduct(product)}</div>
                        <div style={{ color: color.text, fontSize: 14 }}>{product.description?.trim() || "No description"}</div>
                        <div style={{ color: color.muted, fontSize: 13 }}>
                          {product.variants.length} variants
                          <div>{product.images.length} images</div>
                        </div>
                        <button
                          style={editingProductId === product.id ? ghostButtonStyle : buttonStyle}
                          onClick={() => {
                            setEditingProductId(product.id);
                            setSelectedProductId(product.id);
                            setSelectedVariantId("");
                          }}
                        >
                          {editingProductId === product.id ? "Open" : "Edit"}
                        </button>
                      </div>
                    );
                  })}

                  {activeProducts.length === 0 ? <p style={{ padding: 16, color: color.muted }}>No active products yet.</p> : null}
                </div>
              </div>

              {editingProduct && editingProductDraft ? (
                <aside
                  style={{
                    border: `1px solid ${color.border}`,
                    background: color.card,
                    borderRadius: 14,
                    padding: 16,
                    position: "sticky",
                    top: 18,
                    display: "grid",
                    gap: 14
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                    <div>
                      <h2 style={{ fontSize: 20, color: "#fff", marginBottom: 4 }}>{editingProduct.name}</h2>
                      <p style={{ color: color.muted, fontSize: 13 }}>{editingProduct.slug}</p>
                    </div>
                    <button
                      style={ghostButtonStyle}
                      onClick={() => {
                        setEditingProductId("");
                        setSelectedProductId("");
                        setSelectedVariantId("");
                      }}
                    >
                      Close
                    </button>
                  </div>

                  <section style={{ display: "grid", gap: 10, border: `1px solid ${color.border}`, borderRadius: 12, padding: 12, background: color.cardSoft }}>
                    <strong style={{ color: "#fff" }}>Product</strong>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Product Name</span>
                      <input
                        style={inputStyle}
                        value={editingProductDraft.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          patchProductDraft(editingProduct.id, { name, slug: toSlug(name) });
                        }}
                        placeholder="Product name"
                      />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Slug</span>
                      <input
                        style={inputStyle}
                        value={editingProductDraft.slug}
                        onChange={(e) => patchProductDraft(editingProduct.id, { slug: e.target.value })}
                        placeholder="product-slug"
                      />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Category</span>
                      <input
                        style={inputStyle}
                        value={editingProductDraft.category}
                        onChange={(e) => patchProductDraft(editingProduct.id, { category: e.target.value })}
                        placeholder="T-Shirts"
                      />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Description</span>
                      <textarea
                        style={textareaStyle}
                        value={editingProductDraft.description}
                        onChange={(e) => patchProductDraft(editingProduct.id, { description: e.target.value })}
                        placeholder="Short product description"
                      />
                    </div>
                    <label style={{ color: color.muted, fontSize: 14 }}>
                      <input
                        checked={editingProductDraft.isActive}
                        onChange={(e) => patchProductDraft(editingProduct.id, { isActive: e.target.checked })}
                        type="checkbox"
                      />{" "}
                      Active product
                    </label>
                    <button style={buttonStyle} onClick={() => void saveEditorChanges()}>
                      Save
                    </button>
                  </section>

                  <section style={{ display: "grid", gap: 10, border: `1px solid ${color.border}`, borderRadius: 12, padding: 12, background: color.cardSoft }}>
                    <strong style={{ color: "#fff" }}>Variants</strong>
                    <select
                      style={inputStyle}
                      value={selectedVariantId}
                      onChange={(e) => {
                        const variantId = e.target.value;
                        setSelectedVariantId(variantId);
                        const variant = editingProduct.variants.find((item) => item.id === variantId);
                        if (variant) {
                          const eur = variant.prices.find((price) => price.currency === "EUR" && price.isActive);
                          setVariantPriceInput(formatEurMinorForInput(eur?.amountMinor ?? 3900));
                          setVariantInventory(variant.inventory?.quantity ?? 0);
                          setVariantColor(variant.color);
                          setVariantSize(variant.size as VariantSize);
                          setVariantIsActive(variant.isActive);
                        }
                      }}
                    >
                      <option value="">Select variant</option>
                      {editingProduct.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.size} / {variant.color}
                        </option>
                      ))}
                    </select>

                    {selectedVariant ? (
                      <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.5 }}>
                        Selected variant: {selectedVariant.size} / {selectedVariant.color}
                        <div>Stock: {selectedVariant.inventory?.quantity ?? 0}</div>
                        <div>Reserved: {selectedVariant.inventory?.reservedQuantity ?? 0}</div>
                        <div>Price: {formatEurMinorForInput(selectedVariant.prices.find((price) => price.currency === "EUR" && price.isActive)?.amountMinor ?? 0)} EUR</div>
                      </div>
                    ) : null}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={fieldStackStyle}>
                        <span style={fieldLabelStyle}>Size</span>
                        <select style={inputStyle} value={variantSize} onChange={(e) => setVariantSize(e.target.value as VariantSize)}>
                          {SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={fieldStackStyle}>
                        <span style={fieldLabelStyle}>Color</span>
                        <input style={inputStyle} value={variantColor} onChange={(e) => setVariantColor(e.target.value)} placeholder="Black" />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={fieldStackStyle}>
                        <span style={fieldLabelStyle}>Stock Quantity</span>
                        <input
                          style={inputStyle}
                          value={variantInventory}
                          onChange={(e) => setVariantInventory(Number(e.target.value) || 0)}
                          type="number"
                          placeholder="20"
                        />
                      </div>
                      <div style={fieldStackStyle}>
                        <span style={fieldLabelStyle}>Price</span>
                        <div style={inputWithSuffixStyle}>
                          <input
                            style={{ ...inputStyle, border: "none", paddingRight: 0 }}
                            value={variantPriceInput}
                            onChange={(e) => setVariantPriceInput(e.target.value)}
                            type="text"
                            inputMode="decimal"
                            placeholder="39.00"
                          />
                          <span style={suffixStyle}>EUR</span>
                        </div>
                      </div>
                    </div>

                    <label style={{ color: color.muted, fontSize: 14 }}>
                      <input checked={variantIsActive} onChange={(e) => setVariantIsActive(e.target.checked)} type="checkbox" /> Active variant
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                      <button style={buttonStyle} onClick={(e) => void createVariant(e as unknown as FormEvent)}>
                        Create Variant
                      </button>
                    </div>
                  </section>

                  <section style={{ display: "grid", gap: 10, border: `1px solid ${color.border}`, borderRadius: 12, padding: 12, background: color.cardSoft }}>
                    <strong style={{ color: "#fff" }}>Images</strong>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Image Path</span>
                      <input style={inputStyle} value={imagePath} onChange={(e) => setImagePath(e.target.value)} placeholder="/products/your-image.png" />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Image Alt Text</span>
                      <input style={inputStyle} value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Front photo of product" />
                    </div>
                    <div style={fieldStackStyle}>
                      <span style={fieldLabelStyle}>Image Sort Order</span>
                      <input style={inputStyle} value={imageSortOrder} onChange={(e) => setImageSortOrder(Number(e.target.value) || 0)} type="number" />
                    </div>
                    <label style={{ color: color.muted, fontSize: 14 }}>
                      <input checked={imageIsMain} onChange={(e) => setImageIsMain(e.target.checked)} type="checkbox" /> Set as main image
                    </label>
                    <button style={buttonStyle} onClick={(e) => void addImageToProduct(e as unknown as FormEvent)}>
                      Attach Image
                    </button>
                  </section>
                </aside>
              ) : null}
            </section>
          ) : null}

          {activeTab === "orders" ? (
            <section style={{ marginTop: 18, border: `1px solid ${color.border}`, background: color.card, borderRadius: 14, padding: 16 }}>
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>Orders ({visibleOrders.length}/{orders.length})</h2>
              <div style={{ marginBottom: 10 }}>
                <select style={inputStyle} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value as AdminOrder["status"] | "ALL")}>
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="PAID">PAID</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="SHIPPED">SHIPPED</option>
                  <option value="CANCELED">CANCELED</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>
              </div>
              <ul style={{ display: "grid", gap: 8 }}>
                {visibleOrders.map((o) => (
                  <li key={o.id} style={{ border: `1px solid ${color.border}`, background: color.cardSoft, borderRadius: 10, padding: 10 }}>
                    <strong>{o.orderNumber}</strong> | {o.email} | {(o.totalMinor / 100).toFixed(2)} {o.currency}
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: color.muted }}>Status: {o.status}</span>
                      <button style={ghostButtonStyle} onClick={() => updateOrderStatus(o.id, "PAID")}>Set PAID</button>
                      <button style={ghostButtonStyle} onClick={() => updateOrderStatus(o.id, "PROCESSING")}>Set PROCESSING</button>
                      <button style={ghostButtonStyle} onClick={() => updateOrderStatus(o.id, "SHIPPED")}>Set SHIPPED</button>
                      <button style={ghostButtonStyle} onClick={() => updateOrderStatus(o.id, "CANCELED")}>Set CANCELED</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activeTab === "promos" ? (
            <section style={{ marginTop: 18, border: `1px solid ${color.border}`, background: color.card, borderRadius: 14, padding: 16 }}>
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>Promo Codes ({promos.length})</h2>
              <ul style={{ display: "grid", gap: 8 }}>
                {promos.map((promo) => (
                  <li key={promo.id} style={{ border: `1px solid ${color.border}`, background: color.cardSoft, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto", gap: 8 }}>
                      <input
                        style={inputStyle}
                        value={promoDrafts[promo.id]?.code ?? promo.code}
                        onChange={(e) => patchPromoDraft(promo.id, { code: e.target.value.toUpperCase() })}
                      />
                      <select
                        style={inputStyle}
                        value={promoDrafts[promo.id]?.type ?? promo.type}
                        onChange={(e) => patchPromoDraft(promo.id, { type: e.target.value as "PERCENT" | "FIXED" })}
                      >
                        <option value="PERCENT">PERCENT</option>
                        <option value="FIXED">FIXED</option>
                      </select>
                      <input
                        style={inputStyle}
                        value={promoDrafts[promo.id]?.value ?? promo.value}
                        onChange={(e) => patchPromoDraft(promo.id, { value: Number(e.target.value) || 0 })}
                        type="number"
                      />
                      <label style={{ color: color.muted }}>
                        <input
                          checked={promoDrafts[promo.id]?.isActive ?? promo.isActive}
                          onChange={(e) => patchPromoDraft(promo.id, { isActive: e.target.checked })}
                          type="checkbox"
                        />{" "}
                        Active
                      </label>
                      <button style={buttonStyle} onClick={() => savePromoInline(promo.id)}>
                        Save
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activeTab === "users" ? (
            <section style={{ marginTop: 18, border: `1px solid ${color.border}`, background: color.card, borderRadius: 14, padding: 16 }}>
              <h2 style={{ fontSize: 20, marginBottom: 10, color: "#fff" }}>Admin Users ({users.length})</h2>
              <p style={{ marginBottom: 12, color: color.muted }}>
                Current role: {me?.role ?? "UNKNOWN"}. New admin creation is allowed only for OWNER.
              </p>

              <form onSubmit={createAdminUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px auto", gap: 10, marginBottom: 14 }}>
                <input
                  style={inputStyle}
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="new-admin@drivenbyfaith.eu"
                />
                <input
                  style={inputStyle}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Temporary password"
                  type="password"
                />
                <select style={inputStyle} value={newAdminRole} onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}>
                  <option value="OWNER">OWNER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPPORT">SUPPORT</option>
                </select>
                <button style={buttonStyle} type="submit" disabled={me?.role !== "OWNER"}>
                  Add User
                </button>
              </form>

              <ul style={{ display: "grid", gap: 8 }}>
                {users.map((u) => (
                  <li key={u.id} style={{ border: `1px solid ${color.border}`, background: color.cardSoft, borderRadius: 10, padding: 10 }}>
                    <strong>{u.email}</strong> | {u.role} | {u.isActive ? "ACTIVE" : "DISABLED"}
                    <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>
                      Created: {new Date(u.createdAt).toLocaleString()} | Last login: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
