"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Moon,
  Sun,
  Plus,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupByDate } from "@/lib/group-by-date";
import { signOutAction } from "@/app/(app)/actions";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function AppShell({
  org,
  userName,
  conversations,
  children,
}: {
  org: { name: string; slug: string };
  userName: string;
  conversations: ConversationSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);

  const groups = groupByDate(conversations);
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;

  async function newChat() {
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const { conversation } = await res.json();
      router.push(`/chat/${conversation.id}`);
      router.refresh();
    } catch {
      // no-op; the chat list page still works
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-screen">
      <aside
        className={cn(
          "flex flex-col border-r border-border/70 bg-surface transition-[width] duration-200",
          collapsed ? "w-[54px]" : "w-64",
        )}
      >
        <div className="flex items-center justify-between px-3 py-3">
          {!collapsed && (
            <Link href="/dashboard" className="min-w-0">
              <span className="font-serif text-lg">
                Helpdesk<span className="text-primary">AI</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">{org.name}</span>
            </Link>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className="px-2">
          <button
            onClick={newChat}
            disabled={creating}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm font-medium hover:border-primary/40 hover:bg-accent",
              collapsed && "justify-center px-0",
            )}
          >
            <Plus className="h-4 w-4 text-primary" />
            {!collapsed && (creating ? "Creating…" : "New chat")}
          </button>
        </div>

        {!collapsed && (
          <nav className="scroll-slim mt-3 flex-1 overflow-y-auto px-2">
            {groups.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No conversations yet.</p>
            )}
            {groups.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((c) => (
                  <Link
                    key={c.id}
                    href={`/chat/${c.id}`}
                    className={cn(
                      "block truncate rounded-lg px-2.5 py-1.5 text-sm",
                      activeId === c.id
                        ? "bg-accent font-medium text-foreground"
                        : "text-foreground/80 hover:bg-accent",
                    )}
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
        {collapsed && <div className="flex-1" />}

        <div className="border-t border-border/70 p-2">
          {!collapsed &&
            nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                    active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          {!collapsed && <ThemeToggle />}
          {!collapsed && (
            <div className="mt-1 flex items-center justify-between px-2.5 py-1.5">
              <span className="truncate text-xs text-muted-foreground">{userName}</span>
              <form action={signOutAction}>
                <button
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
          {collapsed && (
            <form action={signOutAction}>
              <button
                className="flex w-full justify-center rounded-md p-2 text-muted-foreground hover:bg-accent"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-hidden bg-background">{children}</main>
    </div>
  );
}
