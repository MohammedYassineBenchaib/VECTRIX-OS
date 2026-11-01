"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { api } from "@/lib/client";

export function AccountMenu({
  name,
  email,
  role,
  orgName,
}: {
  name: string;
  email: string;
  role: string;
  orgName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    setPending(true);
    try {
      await api("/api/auth/login", { method: "DELETE" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="account-name hide-mobile">{name}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="popover account-popover" role="menu">
          <div className="popover-head">
            <strong>{name}</strong>
            <span>{email}</span>
            <span className="mono">
              {role} · {orgName}
            </span>
          </div>
          <button type="button" className="popover-item" onClick={signOut} disabled={pending}>
            <LogOut size={14} aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
