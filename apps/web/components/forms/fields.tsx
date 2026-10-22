"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { searchBillToAccounts, type AccountOption } from "@/app/actions/accounts";

/**
 * A labelled form field in a dialog. The label names the one control inside
 * it; `group` is for fields holding several controls, a button or read-only
 * text, which get a named group instead.
 */
export function Field({ label, required, group, children }: { label: string; required?: boolean; group?: boolean; children: ReactNode }) {
  const id = useId();
  const text = (
    <span className="lbl" id={group ? id : undefined}>
      {label}
      {required && <i className="text-accent not-italic"> *</i>}
    </span>
  );
  if (group) {
    return (
      <div className="fld" role="group" aria-labelledby={id}>
        {text}
        {children}
      </div>
    );
  }
  return (
    <label className="fld">
      {text}
      {children}
    </label>
  );
}

/** Type-ahead over the bill-to accounts the user can see. */
export function AccountPicker({ onPick }: { onPick: (a: AccountOption) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AccountOption[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) return;
    let stale = false;
    const t = setTimeout(async () => {
      const rows = await searchBillToAccounts(q);
      if (!stale) setResults(rows);
    }, 180);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, focused]);

  return (
    <div className="relative">
      <input
        className="inp"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search bill-to accounts by name or code…"
        aria-label="Search bill-to accounts"
        autoComplete="off"
      />
      {focused && (
        <div className="ta-list" role="listbox">
          {results.length ? (
            results.map((a) => (
              <button key={a.id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(a)}>
                <span>{a.name}</span>
                <span className="text-[12px] text-muted">[{a.code}]</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-[13px] text-muted">No accounts found</div>
          )}
        </div>
      )}
    </div>
  );
}

/** The chosen account, with "Change" when it isn't fixed. */
export function ChosenAccount({ account, onChange }: { account: AccountOption; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-line bg-surface2 px-3.5 py-2.5">
      <span>
        <b>{account.name}</b>
        {account.code && <span className="ml-1.5 text-[12px] text-muted">[{account.code}]</span>}
      </span>
      {onChange && (
        <button type="button" className="lnk text-[12.5px]" onClick={onChange}>
          Change
        </button>
      )}
    </div>
  );
}
