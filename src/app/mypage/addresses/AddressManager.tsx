"use client";

import { useState } from "react";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  type Address,
} from "@/actions/address";

type FormState = {
  lastName: string;
  firstName: string;
  lastNameRoman: string;
  firstNameRoman: string;
  postalCode: string;
  prefecture: string;
  address: string;
  address2: string;
};

const emptyForm: FormState = {
  lastName: "",
  firstName: "",
  lastNameRoman: "",
  firstNameRoman: "",
  postalCode: "",
  prefecture: "",
  address: "",
  address2: "",
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function AddressManager({
  initialAddresses,
  selectable = false,
  selectedId = null,
  onSelect,
  onChange,
}: {
  initialAddresses: Address[];
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (addresses: Address[]) => void;
}) {
  const [addresses, setAddressesState] = useState<Address[]>(initialAddresses);
  const setAddresses = (list: Address[]) => {
    setAddressesState(list);
    onChange?.(list);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openAdd() {
    setForm(emptyForm);
    setAdding(true);
    setEditingId(null);
    setError("");
  }

  function openEdit(a: Address) {
    setForm({
      lastName: a.lastName,
      firstName: a.firstName,
      lastNameRoman: a.lastNameRoman,
      firstNameRoman: a.firstNameRoman,
      postalCode: a.postalCode,
      prefecture: a.prefecture,
      address: a.address,
      address2: a.address2 ?? "",
    });
    setEditingId(a.id);
    setAdding(false);
    setMenuId(null);
    setError("");
  }

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function validate(): string | null {
    if (!form.lastName.trim()) return "姓を入力してください";
    if (!form.firstName.trim()) return "名を入力してください";
    if (!/^[A-Za-z .'-]+$/.test(form.lastNameRoman.trim())) {
      return "姓（ローマ字）は半角英字で入力してください";
    }
    if (!/^[A-Za-z .'-]+$/.test(form.firstNameRoman.trim())) {
      return "名（ローマ字）は半角英字で入力してください";
    }
    if (!/^\d{7}$/.test(form.postalCode)) return "郵便番号は7桁の数字で入力してください";
    if (!form.prefecture.trim()) return "都道府県を入力してください";
    if (!form.address.trim()) return "住所を入力してください";
    return null;
  }

  async function submitForm() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      lastNameRoman: form.lastNameRoman.trim(),
      firstNameRoman: form.firstNameRoman.trim(),
      postalCode: form.postalCode,
      prefecture: form.prefecture,
      address: form.address,
      address2: form.address2 || undefined,
    };
    const res = editingId
      ? await updateAddress(editingId, payload)
      : await createAddress(payload);
    setBusy(false);
    if (res.success && res.addresses) {
      setAddresses(res.addresses);
      closeForm();
    } else {
      setError(res.error ?? "保存に失敗しました");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("この住所を削除しますか？")) return;
    setBusy(true);
    const res = await deleteAddress(id);
    setBusy(false);
    setMenuId(null);
    if (res.success && res.addresses) setAddresses(res.addresses);
  }

  async function handleSetDefault(id: string) {
    setBusy(true);
    const res = await setDefaultAddress(id);
    setBusy(false);
    setMenuId(null);
    if (res.success && res.addresses) setAddresses(res.addresses);
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {addresses.map((a) => (
        <div
          key={a.id}
          className={`border-2 rounded-lg p-4 transition ${
            selectable && selectedId === a.id ? "border-brand-500 bg-brand-50" : "border-gray-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {selectable && (
              <input
                type="radio"
                name="addr-select"
                checked={selectedId === a.id}
                onChange={() => onSelect?.(a.id)}
                className="mt-1"
              />
            )}
            <button
              type="button"
              onClick={() => selectable && onSelect?.(a.id)}
              className="flex-1 text-left"
            >
              <p className="font-medium text-gray-900 flex items-center gap-2">
                {a.name}
                {a.isDefault && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                    デフォルト
                  </span>
                )}
              </p>
              {(a.lastNameRoman || a.firstNameRoman) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {a.lastNameRoman} {a.firstNameRoman}
                </p>
              )}
              <p className="text-sm text-gray-600 mt-0.5">
                〒{a.postalCode}　{a.prefecture}
                {a.address}
                {a.address2 ? ` ${a.address2}` : ""}
              </p>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuId(menuId === a.id ? null : a.id)}
                className="text-gray-400 hover:text-gray-700 px-2"
              >
                ⋮
              </button>
              {menuId === a.id && (
                <div className="absolute right-0 top-7 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40 text-sm">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50"
                  >
                    ✏️ 住所変更
                  </button>
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(a.id)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50"
                    >
                      ⭐ デフォルトに設定
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600"
                  >
                    🗑 削除
                  </button>
                </div>
              )}
            </div>
          </div>

          {editingId === a.id && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <AddressFields form={form} setForm={setForm} />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={submitForm}
                  disabled={busy}
                  className="bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="border-2 border-gray-200 rounded-lg p-4">
          <p className="font-medium text-gray-800 text-sm mb-3">新しい住所を追加</p>
          <AddressFields form={form} setForm={setForm} />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={submitForm}
              disabled={busy}
              className="bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              保存
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-brand-600 hover:border-brand-400 hover:bg-brand-50 transition"
        >
          ＋ 住所を追加する
        </button>
      )}
    </div>
  );
}

function AddressFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input className={inputCls} placeholder="姓 *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <input className={inputCls} placeholder="名 *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <input className={inputCls} placeholder="姓（ローマ字） *" value={form.lastNameRoman} onChange={(e) => setForm({ ...form, lastNameRoman: e.target.value })} />
      <input className={inputCls} placeholder="名（ローマ字） *" value={form.firstNameRoman} onChange={(e) => setForm({ ...form, firstNameRoman: e.target.value })} />
      <input className={inputCls} placeholder="郵便番号（7桁） *" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value.replace(/-/g, "") })} />
      <input className={inputCls} placeholder="都道府県 *" value={form.prefecture} onChange={(e) => setForm({ ...form, prefecture: e.target.value })} />
      <input className={inputCls} placeholder="住所（市区町村・番地） *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="建物名・部屋番号など" value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} />
    </div>
  );
}
