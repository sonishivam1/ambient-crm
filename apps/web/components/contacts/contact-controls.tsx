"use client";

import { Pencil, Plus, UserCheck, UserX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AccountOption } from "@/app/actions/accounts";
import { setContactActive } from "@/app/actions/contacts";

import { ContactDialog, type EditableContact, type RoleOption } from "./contact-dialog";

/**
 * "Add contact". With `openFromUrl`, it is open whenever the URL carries
 * ?new=contact; closing drops the param so a refresh doesn't reopen it.
 */
export function AddContactButton({
  roles,
  lockedAccount,
  openFromUrl = false,
  small = false,
}: {
  roles: RoleOption[];
  lockedAccount?: AccountOption;
  openFromUrl?: boolean;
  small?: boolean;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [session, setSession] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = openFromUrl && params.get("new") === "contact";
  const open = manualOpen || requested;

  const onOpenChange = (next: boolean) => {
    setManualOpen(next);
    if (next) setSession((s) => s + 1);
    if (!next && requested) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      const qs = rest.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  return (
    <>
      <button className={small ? "btn sm" : "btn primary"} onClick={() => onOpenChange(true)}>
        <Plus size={small ? 14 : 16} />
        Add contact
      </button>
      {/* A fresh dialog each time it opens, so fields start empty. */}
      <ContactDialog key={`${session}-${requested}`} open={open} onOpenChange={onOpenChange} lockedAccount={lockedAccount} roles={roles} />
    </>
  );
}

/** Edit and deactivate/reactivate buttons on a directory row. */
export function ContactRowActions({ contact, active, roles }: { contact: EditableContact & { name: string }; active: boolean; roles: RoleOption[] }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setContactActive({ id: contact.id, active: !active });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(active ? "Contact deactivated" : "Contact reactivated");
      setConfirming(false);
    });

  return (
    <div className="flex justify-end gap-1.5">
      <button className="btn xs" onClick={() => setEditing(true)} aria-label={`Edit ${contact.name}`}>
        <Pencil size={13} />
        Edit
      </button>
      <button className="btn xs" onClick={() => setConfirming(true)} disabled={pending} aria-label={`${active ? "Deactivate" : "Reactivate"} ${contact.name}`}>
        {active ? <UserX size={13} /> : <UserCheck size={13} />}
        {active ? "Deactivate" : "Reactivate"}
      </button>

      {editing && <ContactDialog open={editing} onOpenChange={setEditing} contact={contact} roles={roles} />}

      <Dialog.Root open={confirming} onOpenChange={setConfirming}>
        <Dialog.Portal>
          <Dialog.Overlay className="ov" />
          <Dialog.Content className="modal form" style={{ width: "min(440px, calc(100% - 32px))" }}>
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">{active ? "Deactivate contact" : "Reactivate contact"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">
                  {active
                    ? `${contact.name} stays on past activity but drops out of pickers and the active list.`
                    : `${contact.name} returns to the active list.`}
                </Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
              <Dialog.Close className="btn">Keep as is</Dialog.Close>
              <button className="btn primary" onClick={toggle} disabled={pending}>
                {pending ? "Saving…" : active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
