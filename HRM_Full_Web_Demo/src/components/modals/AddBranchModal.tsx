import React, { useState } from 'react';
import { Branch } from '../../types/hrm';
import { ModalShell, Field, inputCls } from '../common/ModalShell';

interface AddBranchModalProps {
  onClose: () => void;
  branches: Branch[];
  onAddBranch: (branch: Omit<Branch, 'id'>) => void;
}

type Errors = Partial<Record<'name' | 'city' | 'headName', string>>;

const normalize = (s: string) => s.trim().toLowerCase().replace(/[‘’ʻʼ`']/g, "'");

export const AddBranchModal: React.FC<AddBranchModalProps> = ({ onClose, branches, onAddBranch }) => {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [headName, setHeadName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [errors, setErrors] = useState<Errors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const next: Errors = {};
    if (!n) next.name = 'Filial nomini kiriting.';
    else if (branches.some((b) => normalize(b.name) === normalize(n))) next.name = 'Bunday nomli filial allaqachon mavjud.';
    if (!city.trim()) next.city = 'Hududni kiriting.';
    if (!headName.trim()) next.headName = 'Filial rahbarini kiriting.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onAddBranch({
      name: n,
      city: city.trim(),
      address: address.trim(),
      headName: headName.trim(),
      phone: phone.trim(),
      status: 'active',
    });
    onClose();
  };

  return (
    <ModalShell title="Yangi filial qo‘shish" icon="fa-building" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Filial nomi" required error={errors.name}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Buxoro" className={inputCls} />
          </Field>
          <Field label="Hudud (shahar/viloyat)" required error={errors.city}>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Buxoro" className={inputCls} />
          </Field>
        </div>

        <Field label="Manzil">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ko‘cha, uy raqami"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Filial rahbari" required error={errors.headName}>
            <input type="text" value={headName} onChange={(e) => setHeadName(e.target.value)} placeholder="Ism Familiya" className={inputCls} />
          </Field>
          <Field label="Telefon">
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 (65) 000-00-00" className={inputCls} />
          </Field>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
          >
            Bekor qilish
          </button>
          <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs">
            Filialni saqlash
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
