'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ChecklistForm } from '@/components/ChecklistForm';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { todayISO, type ChecklistItemMeta } from '@/types';

export default function WarehousePage() {
  const toast = useToast();
  const { user } = useAuth();
  const canDelete = user && ['MANAGER', 'SUPER_ADMIN'].includes(user.role);
  const [date, setDate] = useState(todayISO());
  const [meta, setMeta] = useState<any>(null);
  const [day, setDay] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [low, setLow] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [editing, setEditing] = useState<
    Record<string, { currentStock: number; minStock: number; expiryDate: string }>
  >({});
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'apteka',
    minStock: 10,
    currentStock: 0,
    expiryDate: '',
  });

  async function load() {
    try {
      const [m, d, p, l, e] = await Promise.all([
        api('/kpi/meta'),
        api(`/kpi/day?date=${date}`),
        api('/settings/products'),
        api('/settings/products/low-stock'),
        api('/settings/products/expiring?days=30'),
      ]);
      setMeta(m);
      setDay(d);
      setProducts(p);
      setLow(l);
      setExpiring(e);
      const ed: Record<string, { currentStock: number; minStock: number; expiryDate: string }> = {};
      p.forEach((x: any) => {
        ed[x.id] = {
          currentStock: x.currentStock,
          minStock: x.minStock,
          expiryDate: x.expiryDate ? String(x.expiryDate).slice(0, 10) : '',
        };
      });
      setEditing(ed);
    } catch (err: any) {
      toast.error('Yuklash xatosi', err.message);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function saveChecklist(items: Record<string, boolean>) {
    try {
      await api('/kpi/warehouse', {
        method: 'POST',
        body: JSON.stringify({ date, items }),
      });
      toast.success('Ombor chek-list saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    }
  }

  async function saveStock(id: string) {
    try {
      const row = editing[id];
      await api(`/settings/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          currentStock: row.currentStock,
          minStock: row.minStock,
          expiryDate: row.expiryDate || null,
        }),
      });
      toast.success('Zaxira yangilandi');
      await load();
    } catch (e: any) {
      toast.error('Yangilanmadi', e.message);
    }
  }

  async function addProduct() {
    try {
      await api('/settings/products', {
        method: 'POST',
        body: JSON.stringify({
          ...productForm,
          expiryDate: productForm.expiryDate || undefined,
        }),
      });
      setProductForm({ name: '', category: 'apteka', minStock: 10, currentStock: 0, expiryDate: '' });
      toast.success('Mahsulot qoʻshildi');
      await load();
    } catch (e: any) {
      toast.error('Qoʻshilmadi', e.message);
    }
  }

  async function removeProduct(id: string) {
    if (!confirm('Mahsulotni o‘chirishni tasdiqlaysizmi?')) return;
    try {
      await api(`/settings/products/${id}`, { method: 'DELETE' });
      toast.success('Oʻchirildi');
      await load();
    } catch (e: any) {
      toast.error('Oʻchirilmadi', e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Logistika"
          title="Ombor tahlili"
          description="Zaxira tahriri, min-stock avto-ogohlantirish, yaroqlilik muddati."
          action={
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white/90 text-sm"
            />
          }
        />

        <div className="grid lg:grid-cols-2 gap-5">
          {meta && (
            <ChecklistForm
              title="Ombor chek-list"
              description="6 punkt · zaxira avtomatik hisobga olinadi"
              items={meta.warehouse as ChecklistItemMeta[]}
              initial={day?.warehouse?.items}
              percentage={day?.warehouse?.percentage}
              onSave={saveChecklist}
            />
          )}

          <div className="space-y-5">
            {low.length > 0 && (
              <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5">
                <h3 className="font-display text-2xl text-status-red mb-3">Past zaxira</h3>
                {low.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1">
                    <span className="font-medium">{p.name}</span>
                    <span>
                      {p.currentStock} / min {p.minStock}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {expiring.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                <h3 className="font-display text-2xl text-status-yellow mb-3">30 kun ichida muddati tugaydi</h3>
                {expiring.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1">
                    <span className="font-medium">{p.name}</span>
                    <span>{String(p.expiryDate).slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
              <h3 className="font-display text-2xl mb-4">Mahsulotlar / zaxira</h3>
              <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
                {products.map((p) => (
                  <div key={p.id} className="p-3 rounded-2xl bg-sand-50 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-ink-muted">{p.category}</p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          className="text-xs text-status-red"
                          onClick={() => removeProduct(p.id)}
                        >
                          Oʻchirish
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Joriy"
                        type="number"
                        value={editing[p.id]?.currentStock ?? 0}
                        onChange={(e) =>
                          setEditing((ed) => ({
                            ...ed,
                            [p.id]: { ...ed[p.id], currentStock: Number(e.target.value) },
                          }))
                        }
                      />
                      <Input
                        label="Min"
                        type="number"
                        value={editing[p.id]?.minStock ?? 0}
                        onChange={(e) =>
                          setEditing((ed) => ({
                            ...ed,
                            [p.id]: { ...ed[p.id], minStock: Number(e.target.value) },
                          }))
                        }
                      />
                    </div>
                    <Input
                      label="Yaroqlilik"
                      type="date"
                      value={editing[p.id]?.expiryDate ?? ''}
                      onChange={(e) =>
                        setEditing((ed) => ({
                          ...ed,
                          [p.id]: { ...ed[p.id], expiryDate: e.target.value },
                        }))
                      }
                    />
                    <Button size="sm" className="w-full min-h-11" onClick={() => saveStock(p.id)}>
                      Saqlash
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-teal-50 pt-4">
                <p className="text-sm font-semibold">Yangi mahsulot</p>
                <Input
                  label="Nomi"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
                <Input
                  label="Kategoriya"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Min"
                    type="number"
                    value={productForm.minStock}
                    onChange={(e) => setProductForm({ ...productForm, minStock: Number(e.target.value) })}
                  />
                  <Input
                    label="Joriy"
                    type="number"
                    value={productForm.currentStock}
                    onChange={(e) =>
                      setProductForm({ ...productForm, currentStock: Number(e.target.value) })
                    }
                  />
                </div>
                <Input
                  label="Yaroqlilik muddati"
                  type="date"
                  value={productForm.expiryDate}
                  onChange={(e) => setProductForm({ ...productForm, expiryDate: e.target.value })}
                />
                <Button className="w-full" onClick={addProduct} disabled={!productForm.name}>
                  Qoʻshish
                </Button>
              </div>
            </div>
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
