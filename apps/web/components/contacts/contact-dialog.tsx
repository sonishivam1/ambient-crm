"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { listSoldTos, type AccountOption } from "@/app/actions/accounts";
import { createContact, updateContact } from "@/app/actions/contacts";
import { AccountPicker, ChosenAccount, Field } from "@/components/forms/fields";
import { cn } from "@/lib/cn";

export type RoleOption = { key: string; label: string };

export type EditableContact = {
  id: string;
  accountId: string;
  account: string;
  accountCode: string;
  soldTo: { id: string } | null;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phone: string;
  roles: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  contact?: EditableContact;
  /** Fixes the account (opened from a customer profile). */
  lockedAccount?: AccountOption;
  roles: RoleOption[];
};

/** Add or edit a contact. Scope, roles and duplicate emails are checked again on the server. */
export function ContactDialog({ open, onOpenChange, contact, lockedAccount, roles }: Props) {
  const editing = !!contact;
  const [account, setAccount] = useState<AccountOption | null>(
    contact ? { id: contact.accountId, name: contact.account, code: contact.accountCode } : (lockedAccount ?? null),
  );
  const [sites, setSites] = useState<AccountOption[]>([]);
  const [soldTo, setSoldTo] = useState(contact?.soldTo?.id ?? "");
  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [picked, setPicked] = useState<string[]>(contact?.roles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const accountId = account?.id;
  useEffect(() => {
    if (!accountId) return;
    let stale = false;
    listSoldTos(accountId).then((rows) => {
      if (!stale) setSites(rows);
    });
    return () => {
      stale = true;
    };
  }, [accountId]);

  const chooseAccount = (next: AccountOption | null) => {
    setAccount(next);
    setSites([]);
    setSoldTo("");
  };

  const submit = () =>
    startTransition(async () => {
      setError(null);
      if (!account) return setError("Choose an account.");
      const fields = { accountId: account.id, soldToAccountId: soldTo || null, firstName, lastName, jobTitle, email, phone, roles: picked };
      const result = editing ? await updateContact({ id: contact.id, ...fields }) : await createContact(fields);
      if (!result.ok) return setError(result.error);
      toast(editing ? "Contact updated" : "Contact added");
      onOpenChange(false);
    });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form wide">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">{editing ? "Edit contact" : "Add contact"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">Contacts belong to a bill-to account, and optionally one of its sites.</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="m-body">
              <Field label="Bill-to account" required group>
                {account ? (
                  <ChosenAccount account={account} onChange={lockedAccount ? undefined : () => chooseAccount(null)} />
                ) : (
                  <AccountPicker onPick={chooseAccount} />
                )}
              </Field>

              {account && sites.length > 0 && (
                <Field label="Site (optional)">
                  <select className="sel" value={soldTo} onChange={(e) => setSoldTo(e.target.value)} aria-label="Site">
                    <option value="">Whole account</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} [{s.code}]
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="f2">
                <Field label="First name" required>
                  <input className="inp" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} autoComplete="off" />
                </Field>
                <Field label="Last name">
                  <input className="inp" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} autoComplete="off" />
                </Field>
              </div>
              <Field label="Job title">
                <input className="inp" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} placeholder="e.g. Procurement Manager" />
              </Field>
              <div className="f2">
                <Field label="Email">
                  <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="name@company.com" autoComplete="off" />
                </Field>
                <Field label="Phone">
                  <input className="inp" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="off" />
                </Field>
              </div>
              {roles.length > 0 && (
                <Field label="Roles" group>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
                    {roles.map((r) => {
                      const on = picked.includes(r.key);
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className={cn("chip", on && "on")}
                          aria-pressed={on}
                          onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r.key) : [...p, r.key]))}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              {error && (
                <p className="m-0 text-[13px] font-semibold text-risk" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
              <Dialog.Close type="button" className="btn">
                Cancel
              </Dialog.Close>
              <button type="submit" className="btn primary" disabled={pending || !account || !firstName.trim()}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add contact"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
